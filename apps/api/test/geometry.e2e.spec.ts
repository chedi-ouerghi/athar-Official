import type { NestExpressApplication } from '@nestjs/platform-express';
import { adminTableSchema, apiErrorResponseSchema, getTableResponseSchema } from '@athar/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryTableRepository } from '../src/tables/in-memory-table.repository.js';
import { bearer, createTestApp, signIn, signInOwner } from './create-test-app.js';
import { fixtureTables } from './table-fixtures.js';

const ADMIN = '/api/v1/admin/tables';
const BASE = { displayName: 'Atrium', location: 'Lobby' };

/** A response body read through the shared contract, so nothing is `any`. */
const stored = (body: unknown) => adminTableSchema.parse(body);
const errorOf = (body: unknown) => apiErrorResponseSchema.parse(body).error;

describe('table shape and size over HTTP', () => {
  let app: NestExpressApplication;
  let admin: { Authorization: string };
  let owner: { Authorization: string };

  beforeAll(async () => {
    app = await createTestApp({}, { repository: new InMemoryTableRepository(fixtureTables()) });
    admin = { Authorization: `Bearer ${(await signIn(app)).accessToken}` };
    owner = bearer(await signInOwner(app, 'table-001', 'table-off'));
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it.each([
    ['round', 800, 800],
    ['square', 700, 700],
    ['rectangle', 1500, 900],
    ['oval', 1100, 650],
  ])('registers a %s table of %i x %i mm and returns it as stored', async (shape, w, h) => {
    const geometry = { shape, widthMm: w, heightMm: h };

    const created = await http()
      .post(ADMIN)
      .set(admin)
      .send({ ...BASE, geometry })
      .expect(201);
    expect(stored(created.body).geometry).toStrictEqual(geometry);

    const read = await http()
      .get(`${ADMIN}/${stored(created.body).id}`)
      .set(admin)
      .expect(200);
    expect(stored(read.body).geometry).toStrictEqual(geometry);
  });

  it('gives a table registered without a size the placeholder', async () => {
    const created = await http().post(ADMIN).set(admin).send(BASE).expect(201);

    expect(stored(created.body).geometry).toStrictEqual({
      shape: 'round',
      widthMm: 600,
      heightMm: 600,
    });
  });

  it.each([
    ['a square with two different sides', { shape: 'square', widthMm: 800, heightMm: 600 }],
    ['a round table with two different sides', { shape: 'round', widthMm: 800, heightMm: 500 }],
    ['a rectangle with equal sides', { shape: 'rectangle', widthMm: 700, heightMm: 700 }],
    ['an oval with equal sides', { shape: 'oval', widthMm: 700, heightMm: 700 }],
    ['an unknown shape', { shape: 'hexagon', widthMm: 800, heightMm: 600 }],
    ['a side below the minimum', { shape: 'rectangle', widthMm: 50, heightMm: 600 }],
    ['a side above the maximum', { shape: 'rectangle', widthMm: 20_000, heightMm: 600 }],
    ['a fractional side', { shape: 'rectangle', widthMm: 800.5, heightMm: 600 }],
    ['a missing height', { shape: 'rectangle', widthMm: 800 }],
  ])('refuses %s with VALIDATION_FAILED', async (_label, geometry) => {
    const response = await http()
      .post(ADMIN)
      .set(admin)
      .send({ ...BASE, geometry })
      .expect(400);

    expect(errorOf(response.body).code).toBe('VALIDATION_FAILED');
  });

  it('names the field that disagrees', async () => {
    const response = await http()
      .post(ADMIN)
      .set(admin)
      .send({ ...BASE, geometry: { shape: 'square', widthMm: 800, heightMm: 600 } })
      .expect(400);

    expect(JSON.stringify(errorOf(response.body).details)).toContain('body.geometry.heightMm');
  });

  it('shows the customer the size of their table, so the app can draw it to scale', async () => {
    const rectangle = await http().get('/api/v1/tables/table-001').set(owner).expect(200);
    const round = await http().get('/api/v1/tables/table-off').set(owner).expect(200);

    expect(getTableResponseSchema.parse(rectangle.body).geometry).toStrictEqual({
      shape: 'rectangle',
      widthMm: 1200,
      heightMm: 800,
    });
    expect(getTableResponseSchema.parse(round.body).geometry).toStrictEqual({
      shape: 'round',
      widthMm: 900,
      heightMm: 900,
    });
  });

  describe('PATCH', () => {
    it('replaces shape and both dimensions together, and the customer sees it at once', async () => {
      const geometry = { shape: 'oval', widthMm: 1400, heightMm: 900 };

      const patched = await http()
        .patch(`${ADMIN}/table-001`)
        .set(admin)
        .send({ geometry })
        .expect(200);
      expect(stored(patched.body).geometry).toStrictEqual(geometry);
      // Nothing else moved.
      expect(stored(patched.body).displayName).toBe('Main hall');

      const seen = await http().get('/api/v1/tables/table-001').set(owner).expect(200);
      expect(getTableResponseSchema.parse(seen.body).geometry).toStrictEqual(geometry);
    });

    it('leaves the size alone when it is not part of the patch', async () => {
      const before = stored((await http().get(`${ADMIN}/table-off`).set(admin).expect(200)).body);

      const patched = await http()
        .patch(`${ADMIN}/table-off`)
        .set(admin)
        .send({ location: 'Cellar' })
        .expect(200);

      expect(stored(patched.body).geometry).toStrictEqual(before.geometry);
    });

    it.each([
      ['only a width, which would leave the shape and height to guess', { widthMm: 900 }],
      ['an inconsistent size', { shape: 'square', widthMm: 900, heightMm: 800 }],
    ])('refuses a patch with %s', async (_label, geometry) => {
      const response = await http()
        .patch(`${ADMIN}/table-001`)
        .set(admin)
        .send({ geometry })
        .expect(400);

      expect(errorOf(response.body).code).toBe('VALIDATION_FAILED');
    });

    it('does not let a customer change it', async () => {
      await http()
        .patch(`${ADMIN}/table-001`)
        .set(owner)
        .send({ geometry: { shape: 'round', widthMm: 500, heightMm: 500 } })
        .expect(403);
    });
  });
});
