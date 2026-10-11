import {
  designDetailSchema,
  designSummarySchema,
  listDesignsResponseSchema,
} from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { designCollectionV1 } from './data/designs.v1.js';
import { loadDesignCollection } from './design-collection.js';
import { DesignsModule } from './designs.module.js';
import { DesignsService } from './designs.service.js';

const collection = loadDesignCollection(designCollectionV1);
const service = new DesignsService(collection);

describe('DesignsService', () => {
  describe('list', () => {
    it('returns the collection version and all four designs, in collection order', () => {
      const { collectionVersion, designs } = service.list();

      expect(collectionVersion).toBe(1);
      expect(designs.map((design) => design.id)).toStrictEqual(['dunes', 'sadu', 'star', 'khoos']);
    });

    it('matches the shared response schema, entry by entry', () => {
      expect(listDesignsResponseSchema.safeParse(service.list()).success).toBe(true);
    });

    it('lists summaries only: no preview path and no trajectory', () => {
      for (const design of service.list().designs) {
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

  describe('get', () => {
    it.each(['dunes', 'sadu', 'star', 'khoos'])('returns %s with its preview path', (id) => {
      const design = service.get(id);

      expect(designDetailSchema.safeParse(design).success).toBe(true);
      expect(design.id).toBe(id);
      expect(design.previewPath.length).toBeGreaterThanOrEqual(2);
      expect(design.previewPath.length).toBeLessThanOrEqual(500);
    });

    it('returns exactly the summary fields plus previewPath, and never the trajectory', () => {
      expect(Object.keys(service.get('sadu')).sort()).toStrictEqual([
        'description',
        'estimatedDurationSeconds',
        'id',
        'inspiration',
        'previewPath',
        'slug',
        'title',
      ]);
      expect(JSON.stringify(service.get('sadu'))).not.toContain('polar-theta-rho');
    });

    it('agrees with the list for every field they share', () => {
      for (const summary of service.list().designs) {
        const { previewPath: _previewPath, ...rest } = service.get(summary.id);

        expect(designSummarySchema.parse(rest)).toStrictEqual(summary);
      }
    });

    it('throws DESIGN_NOT_FOUND for an unknown id', () => {
      expect(() => service.get('no-such-design')).toThrow(
        expect.objectContaining({ code: 'DESIGN_NOT_FOUND' }) as Error,
      );
    });

    it('is case sensitive and does not accept a slug in place of an id', () => {
      expect(() => service.get('Dunes')).toThrow();
      expect(() => service.get('desert-dunes')).toThrow();
    });
  });

  describe('getTrajectory (internal)', () => {
    it('returns the full trajectory, which is far larger than any preview', () => {
      const trajectory = service.getTrajectory('khoos');

      expect(trajectory.format).toBe('polar-theta-rho/v1');
      expect(trajectory.points.length).toBeGreaterThan(service.get('khoos').previewPath.length);
    });

    it('throws DESIGN_NOT_FOUND for an unknown id', () => {
      expect(() => service.getTrajectory('nope')).toThrow(
        expect.objectContaining({ code: 'DESIGN_NOT_FOUND' }) as Error,
      );
    });
  });
});

describe('DesignsModule.forRoot', () => {
  it('accepts the shipped collection', () => {
    expect(() => DesignsModule.forRoot()).not.toThrow();
  });

  it('refuses a broken collection while the module is described, before the application exists', () => {
    expect(() =>
      DesignsModule.forRoot({
        ...designCollectionV1,
        designs: designCollectionV1.designs.slice(0, 3),
      }),
    ).toThrow('The design collection is invalid');
  });
});
