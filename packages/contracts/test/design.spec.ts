import { describe, expect, it } from 'vitest';
import {
  PREVIEW_PATH_MAX_POINTS,
  designDetailSchema,
  designInspirationSchema,
  designSummarySchema,
  localizedTextSchema,
  previewPathSchema,
} from '../src/index.js';

const text = { en: 'English', ar: 'عربي' };

function inspiration(kind: string, sources: unknown[]) {
  return designInspirationSchema.safeParse({ kind, note: text, sources });
}

describe('design inspiration', () => {
  it('rejects a documented traditional design without a source', () => {
    const result = inspiration('documented-traditional', []);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toStrictEqual(['sources']);
  });

  it('accepts a documented traditional design with a source', () => {
    expect(inspiration('documented-traditional', [{ label: 'A reference' }]).success).toBe(true);
  });

  it('accepts an original modern design with no sources', () => {
    expect(inspiration('original-modern', []).success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(inspiration('folk', []).success).toBe(false);
  });
});

describe('localized text', () => {
  it('requires both languages', () => {
    expect(localizedTextSchema.safeParse(text).success).toBe(true);
    expect(localizedTextSchema.safeParse({ en: 'English' }).success).toBe(false);
    expect(localizedTextSchema.safeParse({ ar: 'عربي' }).success).toBe(false);
    expect(localizedTextSchema.safeParse({ en: '', ar: 'عربي' }).success).toBe(false);
  });
});

describe('preview path', () => {
  const points = (count: number) =>
    Array.from({ length: count }, (_, i): [number, number] => [i * 0.1, i / count]);

  it('accepts between 2 and the maximum number of points', () => {
    expect(previewPathSchema.safeParse(points(2)).success).toBe(true);
    expect(previewPathSchema.safeParse(points(PREVIEW_PATH_MAX_POINTS)).success).toBe(true);
  });

  it('rejects too few or too many points', () => {
    expect(previewPathSchema.safeParse(points(1)).success).toBe(false);
    expect(previewPathSchema.safeParse(points(PREVIEW_PATH_MAX_POINTS + 1)).success).toBe(false);
  });

  it('keeps rho within 0..1 but allows unwrapped theta', () => {
    expect(
      previewPathSchema.safeParse([
        [0, 0],
        [7 * Math.PI, 1],
      ]).success,
    ).toBe(true);
    expect(
      previewPathSchema.safeParse([
        [0, 0],
        [1, 1.01],
      ]).success,
    ).toBe(false);
    expect(
      previewPathSchema.safeParse([
        [0, -0.1],
        [1, 1],
      ]).success,
    ).toBe(false);
  });
});

describe('design summary and detail', () => {
  const summary = {
    id: 'design-one',
    slug: 'design-one',
    title: text,
    description: text,
    inspiration: { kind: 'original-modern', note: text, sources: [] },
    estimatedDurationSeconds: 600,
  };

  it('accepts a summary without a preview path', () => {
    expect(designSummarySchema.safeParse(summary).success).toBe(true);
  });

  it('requires the preview path on the detail', () => {
    expect(designDetailSchema.safeParse(summary).success).toBe(false);
    expect(
      designDetailSchema.safeParse({
        ...summary,
        previewPath: [
          [0, 0],
          [1, 1],
        ],
      }).success,
    ).toBe(true);
  });

  it('has no place for a full trajectory', () => {
    const parsed = designDetailSchema.parse({
      ...summary,
      previewPath: [
        [0, 0],
        [1, 1],
      ],
      trajectory: { format: 'polar-theta-rho/v1', points: [] },
    });

    expect(parsed).not.toHaveProperty('trajectory');
  });
});
