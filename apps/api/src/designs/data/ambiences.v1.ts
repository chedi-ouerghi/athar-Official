/**
 * The LED ambiences a table can show, version 1.
 *
 * Only the three the website names: Gulf blue, amber and pearl. The product
 * owner supplies the rest; until then only these three exist. Never invent a
 * name to fill the list.
 *
 * The Arabic names are straightforward translations and **need native review**
 * (docs/designs.md). The colours are first guesses for the app's swatches; the
 * hardware driver maps the id to its own LED values.
 */

import type { Ambience } from '@athar/contracts';

export const AMBIENCES_V1: readonly Ambience[] = [
  // Arabic needs native review.
  { id: 'gulf-blue', name: { en: 'Gulf blue', ar: 'أزرق الخليج' }, color: '#1b6ca8' },
  // Arabic needs native review.
  { id: 'amber', name: { en: 'Amber', ar: 'كهرماني' }, color: '#ffbf00' },
  // Arabic needs native review.
  { id: 'pearl', name: { en: 'Pearl', ar: 'لؤلؤي' }, color: '#eae0c8' },
];
