/**
 * Plans and features: what an ordered table includes (decisions D2 to D4).
 *
 * A table's features are derived from its `plan` and its `voiceAssistant`
 * add-on, here and nowhere else, so the API and the app cannot disagree.
 */

import { z } from 'zod';

export const planSchema = z.enum(['basic', 'personalized']);
export type Plan = z.infer<typeof planSchema>;

export const featureSchema = z.enum([
  'catalogue',
  'rake',
  'drawingPen',
  'ledAmbiences',
  'voiceAssistant',
]);
export type Feature = z.infer<typeof featureSchema>;

/**
 * What each plan includes (D3). Moving a feature between plans is a change to
 * this constant only. `voiceAssistant` is in no plan: it is a per-table add-on (D4).
 */
export const PLAN_FEATURES: Readonly<Record<Plan, readonly Feature[]>> = {
  basic: ['catalogue', 'rake'],
  personalized: ['catalogue', 'rake', 'drawingPen', 'ledAmbiences'],
};

/** The features a table has: its plan's, plus `voiceAssistant` when the add-on is on. */
export function featuresFor(table: {
  readonly plan: Plan;
  readonly voiceAssistant: boolean;
}): Feature[] {
  return table.voiceAssistant
    ? [...PLAN_FEATURES[table.plan], 'voiceAssistant']
    : [...PLAN_FEATURES[table.plan]];
}
