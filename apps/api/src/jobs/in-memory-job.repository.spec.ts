import type { DrawingJob, JobState } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { InMemoryJobRepository } from './in-memory-job.repository.js';

let counter = 0;

function job(overrides: Partial<DrawingJob> = {}): DrawingJob {
  counter += 1;

  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    tableId: 'table-001',
    designId: 'star',
    mode: 'simulation',
    state: 'queued',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: null,
    errorCode: null,
    ...overrides,
  };
}

const request = (n: number) => `request-${n}`;

/** Store a job and finish it, as the service would. */
async function insertFinished(
  repository: InMemoryJobRepository,
  n: number,
  tableId = 'table-001',
  state: JobState = 'completed',
): Promise<DrawingJob> {
  const created = job({ tableId });

  await repository.insertIfNoActive(created, request(n));
  const finished = { ...created, state };

  await repository.update(finished);

  return finished;
}

describe('InMemoryJobRepository', () => {
  it('refuses a history limit that is not a whole number of at least 1', () => {
    expect(() => new InMemoryJobRepository(0)).toThrow(RangeError);
    expect(() => new InMemoryJobRepository(-3)).toThrow(RangeError);
    expect(() => new InMemoryJobRepository(1.5)).toThrow(RangeError);
  });

  describe('insertIfNoActive', () => {
    it('stores a job on a table with none, which becomes its active job', async () => {
      const repository = new InMemoryJobRepository(10);
      const first = job();

      expect(await repository.insertIfNoActive(first, request(1))).toStrictEqual({
        kind: 'inserted',
      });
      expect(await repository.get(first.id)).toStrictEqual(first);
      expect(await repository.findActive('table-001')).toStrictEqual(first);
    });

    it.each(['queued', 'drawing', 'paused'] as const)(
      'is busy while the table has a %s job',
      async (state) => {
        const repository = new InMemoryJobRepository(10);
        const running = job({ state });

        await repository.insertIfNoActive(running, request(1));

        expect(await repository.insertIfNoActive(job(), request(2))).toStrictEqual({
          kind: 'busy',
          activeJobId: running.id,
        });
        expect(await repository.listRecent('table-001', 10)).toHaveLength(1);
      },
    );

    it.each(['completed', 'failed', 'cancelled'] as const)(
      'accepts a new job once the last one is %s',
      async (state) => {
        const repository = new InMemoryJobRepository(10);
        await insertFinished(repository, 1, 'table-001', state);

        expect(await repository.insertIfNoActive(job(), request(2))).toStrictEqual({
          kind: 'inserted',
        });
      },
    );

    it('keeps tables independent: one busy table does not block another', async () => {
      const repository = new InMemoryJobRepository(10);

      await repository.insertIfNoActive(job({ tableId: 'table-001' }), request(1));

      expect(
        await repository.insertIfNoActive(job({ tableId: 'table-002' }), request(2)),
      ).toStrictEqual({ kind: 'inserted' });
    });

    it('returns the original job for a repeated (table, request id), storing nothing new', async () => {
      const repository = new InMemoryJobRepository(10);
      const original = job();

      await repository.insertIfNoActive(original, request(1));
      const result = await repository.insertIfNoActive(job(), request(1));

      expect(result).toStrictEqual({ kind: 'replayed', job: original });
      expect(await repository.listRecent('table-001', 10)).toHaveLength(1);
    });

    it('decides a repeat before it decides busy, so a double tap is not told the table is busy', async () => {
      const repository = new InMemoryJobRepository(10);
      const original = job();

      await repository.insertIfNoActive(original, request(1));

      // The table is busy with exactly this job, and the same request repeats.
      expect((await repository.insertIfNoActive(job(), request(1))).kind).toBe('replayed');
      // A different request is busy.
      expect((await repository.insertIfNoActive(job(), request(2))).kind).toBe('busy');
    });

    it('still returns the job for a repeat after that job has finished', async () => {
      const repository = new InMemoryJobRepository(10);
      const finished = await insertFinished(repository, 1);

      expect(await repository.insertIfNoActive(job(), request(1))).toStrictEqual({
        kind: 'replayed',
        job: finished,
      });
    });

    it('scopes request ids to the table: the same id on another table is a new request', async () => {
      const repository = new InMemoryJobRepository(10);

      await repository.insertIfNoActive(job({ tableId: 'table-001' }), request(1));

      expect(
        (await repository.insertIfNoActive(job({ tableId: 'table-002' }), request(1))).kind,
      ).toBe('inserted');
    });

    describe('atomicity: the check and the insert are one step', () => {
      it('lets exactly one of many simultaneous starts on a table through', async () => {
        const repository = new InMemoryJobRepository(10);

        const results = await Promise.all(
          Array.from({ length: 100 }, (_, n) => repository.insertIfNoActive(job(), request(n))),
        );

        expect(results.filter((result) => result.kind === 'inserted')).toHaveLength(1);
        expect(results.filter((result) => result.kind === 'busy')).toHaveLength(99);
        expect(await repository.listRecent('table-001', 100)).toHaveLength(1);
      });

      it('lets exactly one of many simultaneous identical requests create a job, and returns it to the rest', async () => {
        const repository = new InMemoryJobRepository(10);

        const results = await Promise.all(
          Array.from({ length: 50 }, () => repository.insertIfNoActive(job(), request(1))),
        );

        expect(results.filter((result) => result.kind === 'inserted')).toHaveLength(1);
        expect(results.filter((result) => result.kind === 'replayed')).toHaveLength(49);
        expect(await repository.listRecent('table-001', 100)).toHaveLength(1);
      });

      it('has decided the answer before it returns a promise: the work is synchronous', () => {
        const repository = new InMemoryJobRepository(10);

        // No await: if the check and the insert were separated by one, the second call
        // below could not already see the first job.
        void repository.insertIfNoActive(job(), request(1));
        const second = repository.insertIfNoActive(job(), request(2));
        void repository.insertIfNoActive(job({ tableId: 'table-002' }), request(3));

        return expect(second).resolves.toMatchObject({ kind: 'busy' });
      });
    });
  });

  describe('lookups', () => {
    it('finds a job by its request id, and nothing for an unknown one', async () => {
      const repository = new InMemoryJobRepository(10);
      const stored = job();

      await repository.insertIfNoActive(stored, request(1));

      expect(await repository.findByClientRequestId('table-001', request(1))).toStrictEqual(stored);
      expect(await repository.findByClientRequestId('table-001', request(2))).toBeUndefined();
      expect(await repository.findByClientRequestId('table-002', request(1))).toBeUndefined();
    });

    it('finds nothing for an unknown job or a table with no active job', async () => {
      const repository = new InMemoryJobRepository(10);

      expect(await repository.get('nope')).toBeUndefined();
      expect(await repository.findActive('table-001')).toBeUndefined();
    });

    it('no longer finds a table’s active job once it has finished', async () => {
      const repository = new InMemoryJobRepository(10);
      await insertFinished(repository, 1);

      expect(await repository.findActive('table-001')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('replaces the stored job, and the change is seen by every lookup', async () => {
      const repository = new InMemoryJobRepository(10);
      const stored = job();
      await repository.insertIfNoActive(stored, request(1));

      await repository.update({ ...stored, state: 'drawing', progress: 0.5 });

      expect(await repository.get(stored.id)).toMatchObject({ state: 'drawing', progress: 0.5 });
      expect(await repository.findActive('table-001')).toMatchObject({ progress: 0.5 });
      expect(await repository.findByClientRequestId('table-001', request(1))).toMatchObject({
        progress: 0.5,
      });
    });

    it('does nothing for a job that is not stored, such as one that has been forgotten', async () => {
      const repository = new InMemoryJobRepository(10);

      await repository.update(job());

      expect(await repository.listRecent('table-001', 10)).toStrictEqual([]);
    });

    it('frees the table when the active job finishes', async () => {
      const repository = new InMemoryJobRepository(10);
      const stored = job();
      await repository.insertIfNoActive(stored, request(1));

      await repository.update({ ...stored, state: 'cancelled' });

      expect((await repository.insertIfNoActive(job(), request(2))).kind).toBe('inserted');
    });
  });

  describe('copies', () => {
    it('hands out copies, so a caller cannot change what is stored', async () => {
      const repository = new InMemoryJobRepository(10);
      const stored = job();
      await repository.insertIfNoActive(stored, request(1));

      const fetched = (await repository.get(stored.id))!;
      fetched.state = 'completed';
      (await repository.listRecent('table-001', 1))[0]!.progress = 0.9;
      (await repository.findActive('table-001'))!.state = 'failed';

      expect(await repository.get(stored.id)).toStrictEqual(stored);
    });

    it('stores a copy of what it is given', async () => {
      const repository = new InMemoryJobRepository(10);
      const stored = job();
      await repository.insertIfNoActive(stored, request(1));

      stored.state = 'completed';

      expect((await repository.get(stored.id))?.state).toBe('queued');
    });
  });

  describe('listRecent', () => {
    it('returns the table’s jobs newest first', async () => {
      const repository = new InMemoryJobRepository(10);
      const first = await insertFinished(repository, 1);
      const second = await insertFinished(repository, 2);
      const third = await insertFinished(repository, 3);

      expect((await repository.listRecent('table-001', 10)).map((j) => j.id)).toStrictEqual([
        third.id,
        second.id,
        first.id,
      ]);
    });

    it('honours the limit, keeping the newest', async () => {
      const repository = new InMemoryJobRepository(10);
      await insertFinished(repository, 1);
      await insertFinished(repository, 2);
      const newest = await insertFinished(repository, 3);

      const recent = await repository.listRecent('table-001', 2);

      expect(recent).toHaveLength(2);
      expect(recent[0]?.id).toBe(newest.id);
    });

    it('lists only the table asked for, and an empty list for a table with no jobs', async () => {
      const repository = new InMemoryJobRepository(10);
      await insertFinished(repository, 1, 'table-001');
      await insertFinished(repository, 2, 'table-002');

      expect(await repository.listRecent('table-001', 10)).toHaveLength(1);
      expect(await repository.listRecent('table-003', 10)).toStrictEqual([]);
    });
  });

  describe('bounded history', () => {
    it('forgets the oldest finished jobs of a table beyond the limit', async () => {
      const repository = new InMemoryJobRepository(3);
      const jobs: DrawingJob[] = [];

      for (let n = 1; n <= 5; n += 1) {
        jobs.push(await insertFinished(repository, n));
      }

      expect((await repository.listRecent('table-001', 10)).map((j) => j.id)).toStrictEqual([
        jobs[4]!.id,
        jobs[3]!.id,
        jobs[2]!.id,
      ]);
      expect(await repository.get(jobs[0]!.id)).toBeUndefined();
      expect(await repository.get(jobs[1]!.id)).toBeUndefined();
    });

    it('forgets the idempotency entries of a job with it, so its request id is a new request again', async () => {
      const repository = new InMemoryJobRepository(2);

      await insertFinished(repository, 1);
      await insertFinished(repository, 2);
      await insertFinished(repository, 3); // pushes request 1 out

      expect(await repository.findByClientRequestId('table-001', request(1))).toBeUndefined();
      expect(await repository.findByClientRequestId('table-001', request(2))).toBeDefined();
      expect((await repository.insertIfNoActive(job(), request(1))).kind).toBe('inserted');
    });

    it('keeps the idempotency entries of the jobs it still remembers', async () => {
      const repository = new InMemoryJobRepository(2);

      await insertFinished(repository, 1);
      await insertFinished(repository, 2);

      expect((await repository.insertIfNoActive(job(), request(2))).kind).toBe('replayed');
    });

    it('applies the limit per table, not across them', async () => {
      const repository = new InMemoryJobRepository(2);

      for (let n = 1; n <= 4; n += 1) {
        await insertFinished(repository, n, 'table-001');
        await insertFinished(repository, 10 + n, 'table-002');
      }

      expect(await repository.listRecent('table-001', 10)).toHaveLength(2);
      expect(await repository.listRecent('table-002', 10)).toHaveLength(2);
    });

    it('never forgets a job that is still active, even with a limit of 1', async () => {
      const repository = new InMemoryJobRepository(1);
      await insertFinished(repository, 1);
      const running = job();

      await repository.insertIfNoActive(running, request(2));

      expect((await repository.listRecent('table-001', 10)).map((j) => j.id)).toStrictEqual([
        running.id,
      ]);
      expect(await repository.findActive('table-001')).toStrictEqual(running);
    });

    it('does not grow without bound: a thousand jobs leave only the limit', async () => {
      const repository = new InMemoryJobRepository(20);

      for (let n = 1; n <= 1000; n += 1) {
        await insertFinished(repository, n);
      }

      expect(await repository.listRecent('table-001', 1000)).toHaveLength(20);
    });
  });
});
