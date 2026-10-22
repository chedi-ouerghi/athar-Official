import { describe, expect, it } from 'vitest';
import { PLAN_FEATURES, featureSchema, featuresFor, planSchema } from '../src/index.js';

describe('plans and features', () => {
  it('basic is the catalogue and the rake; personalized adds the pen and the LED ambiences', () => {
    expect(PLAN_FEATURES.basic).toStrictEqual(['catalogue', 'rake']);
    expect(PLAN_FEATURES.personalized).toStrictEqual([
      'catalogue',
      'rake',
      'drawingPen',
      'ledAmbiences',
    ]);
  });

  it('every plan is mapped, and the voice assistant is in no plan', () => {
    for (const plan of planSchema.options) {
      expect(PLAN_FEATURES[plan]).toBeDefined();
      expect(PLAN_FEATURES[plan]).not.toContain('voiceAssistant');
      for (const feature of PLAN_FEATURES[plan]) {
        expect(featureSchema.safeParse(feature).success).toBe(true);
      }
    }
  });

  it('featuresFor adds the voice assistant to either plan when the add-on is on', () => {
    expect(featuresFor({ plan: 'basic', voiceAssistant: false })).toStrictEqual([
      'catalogue',
      'rake',
    ]);
    expect(featuresFor({ plan: 'basic', voiceAssistant: true })).toStrictEqual([
      'catalogue',
      'rake',
      'voiceAssistant',
    ]);
    expect(featuresFor({ plan: 'personalized', voiceAssistant: true })).toStrictEqual([
      'catalogue',
      'rake',
      'drawingPen',
      'ledAmbiences',
      'voiceAssistant',
    ]);
  });

  it('featuresFor returns a copy, so a caller cannot change the plan map', () => {
    featuresFor({ plan: 'basic', voiceAssistant: false }).push('drawingPen');

    expect(PLAN_FEATURES.basic).toStrictEqual(['catalogue', 'rake']);
  });

  it('rejects an unknown plan or feature', () => {
    expect(planSchema.safeParse('premium').success).toBe(false);
    expect(featureSchema.safeParse('laser').success).toBe(false);
  });
});
