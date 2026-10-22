import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorResponseSchema,
  getDesignResponseSchema,
  listDesignsResponseSchema,
} from '@athar/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, signIn } from './create-test-app.js';

const SLUGS = ['desert-dunes', 'al-sadu-diamonds', 'eight-point-star', 'palm-fronds'];
const IDS = ['dunes', 'sadu', 'star', 'khoos'];

describe('designs over HTTP', () => {
  let app: NestExpressApplication;
  let customer: { Authorization: string };

  beforeAll(async () => {
    app = await createTestApp();
    customer = bearer(await signIn(app, 'customer'));
  });

  afterAll(async () => {
    await app.close();
  });

  // Every request below is a signed-in customer's: designs are the same for every account.
  const http = () => request.agent(app.getHttpServer()).set(customer);

  describe('GET /api/v1/designs', () => {
    it('returns the collection version and exactly four designs, in order', async () => {
      const response = await http().get('/api/v1/designs').expect(200);
      const body = listDesignsResponseSchema.parse(response.body);

      expect(body.collectionVersion).toBe(1);
      expect(body.designs.map((design) => design.id)).toStrictEqual(IDS);
      expect(body.designs.map((design) => design.slug)).toStrictEqual(SLUGS);
    });

    it('needs a session', async () => {
      await request(app.getHttpServer()).get('/api/v1/designs').expect(401);
      await request(app.getHttpServer()).get('/api/v1/designs/dunes').expect(401);
    });

    it('returns every design with English and Arabic text and an inspiration note', async () => {
      const body: unknown = (await http().get('/api/v1/designs').expect(200)).body;

      for (const design of listDesignsResponseSchema.parse(body).designs) {
        expect(design.title.en.length).toBeGreaterThan(0);
        expect(design.title.ar).toMatch(/[؀-ۿ]/);
        expect(design.description.ar).toMatch(/[؀-ۿ]/);
        expect(design.inspiration.note.ar).toMatch(/[؀-ۿ]/);
        expect(['documented-traditional', 'original-modern']).toContain(design.inspiration.kind);
        expect(design.estimatedDurationSeconds).toBeGreaterThan(0);
      }
    });

    it('serves Arabic as UTF-8 that survives the round trip', async () => {
      const response = await http().get('/api/v1/designs').expect(200);

      expect(response.headers['content-type']).toMatch(/charset=utf-8/i);
      expect(response.text).toContain('كثبان الصحراء');
    });

    it('omits the preview path and the trajectory: the list stays small', async () => {
      const response = await http().get('/api/v1/designs').expect(200);

      expect(response.text).not.toContain('previewPath');
      expect(response.text).not.toContain('trajectory');
      expect(response.text).not.toContain('polar-theta-rho');
      expect(response.text.length).toBeLessThan(10_000);
    });

    it('lists only the fields of a design summary, nothing extra', async () => {
      const body: unknown = (await http().get('/api/v1/designs').expect(200)).body;

      for (const design of (body as { designs: object[] }).designs) {
        expect(Object.keys(design).sort()).toStrictEqual([
          'description',
          'estimatedDurationSeconds',
          'id',
          'inspiration',
          'slug',
          'title',
        ]);
      }
    });
  });

  describe('GET /api/v1/designs/:designId', () => {
    it.each(IDS)('returns %s with a preview path of at most 500 points', async (id) => {
      const response = await http().get(`/api/v1/designs/${id}`).expect(200);
      const design = getDesignResponseSchema.parse(response.body);

      expect(design.id).toBe(id);
      expect(design.previewPath.length).toBeGreaterThanOrEqual(2);
      expect(design.previewPath.length).toBeLessThanOrEqual(500);
      expect(design.previewPath.every(([, rho]) => rho >= 0 && rho <= 1)).toBe(true);
    });

    it('returns the same summary fields as the list, plus the preview', async () => {
      const list = (await http().get('/api/v1/designs').expect(200)).body as {
        designs: { id: string }[];
      };

      for (const summary of list.designs) {
        const body: unknown = (await http().get(`/api/v1/designs/${summary.id}`).expect(200)).body;
        const { previewPath: _previewPath, ...rest } = body as Record<string, unknown>;

        expect(rest).toStrictEqual(summary);
      }
    });

    it.each(IDS)('never returns the full trajectory of %s', async (id) => {
      const response = await http().get(`/api/v1/designs/${id}`).expect(200);
      const body = response.body as Record<string, unknown>;

      expect(body).not.toHaveProperty('trajectory');
      expect(response.text).not.toContain('polar-theta-rho');
      expect(response.text).not.toContain('"format"');
      // A preview is a few hundred points; a trajectory is thousands, and much larger on the wire.
      expect(response.text.length).toBeLessThan(40_000);
    });

    it('starts and ends the preview at the centre, where every design starts and ends', async () => {
      const body: unknown = (await http().get('/api/v1/designs/sadu').expect(200)).body;
      const { previewPath } = getDesignResponseSchema.parse(body);

      expect(previewPath[0]?.[1]).toBe(0);
      expect(previewPath.at(-1)?.[1]).toBeLessThan(1e-6);
    });

    it('answers DESIGN_NOT_FOUND with the standard envelope for an unknown design', async () => {
      const response = await http().get('/api/v1/designs/no-such-design').expect(404);

      expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('DESIGN_NOT_FOUND');
    });

    it('does not find a design by its slug', async () => {
      await http().get('/api/v1/designs/desert-dunes').expect(404);
    });

    it.each([
      ['uppercase', 'Dunes'],
      ['an underscore', 'des_ert'],
      ['too long', 'a'.repeat(65)],
      ['a leading hyphen', '-dunes'],
      ['a percent-encoded space', 'des%20ert'],
    ])('answers VALIDATION_FAILED for an invalid id: %s', async (_label, id) => {
      const response = await http().get(`/api/v1/designs/${id}`).expect(400);
      const error = apiErrorResponseSchema.parse(response.body).error;

      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details?.[0]?.path).toBe('params.designId');
    });
  });

  it('serves nothing that writes: designs are read-only', async () => {
    await http().post('/api/v1/designs').send({}).expect(404);
    await http().delete('/api/v1/designs/dunes').expect(404);
    await http().put('/api/v1/designs/dunes').send({}).expect(404);
  });
});
