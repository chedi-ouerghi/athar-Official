import type { TableGeometry } from '@athar/contracts';
import type { Locale } from './locale';
import type { TranslationKey, TranslationParams } from './translate';

/**
 * A table's shape and size as a translation key and its parameters: "Round table,
 * 800 mm across", "Rectangular table, 1,200 × 800 mm". A round table has one
 * measure (its diameter) and a square one too (its side); the others give X, the
 * width, then Y, the height.
 *
 * Digits are written the way the language writes them, through the platform's
 * number formatting.
 */
export function describeGeometry(
  geometry: Pick<TableGeometry, 'shape' | 'widthMm' | 'heightMm'>,
  locale: Locale,
): { key: Extract<TranslationKey, `table.shape.${string}`>; params: TranslationParams } {
  const format = (value: number) => new Intl.NumberFormat(locale).format(value);

  switch (geometry.shape) {
    case 'round':
      return { key: 'table.shape.round', params: { diameter: format(geometry.widthMm) } };
    case 'square':
      return { key: 'table.shape.square', params: { side: format(geometry.widthMm) } };
    case 'rectangle':
      return {
        key: 'table.shape.rectangle',
        params: { width: format(geometry.widthMm), height: format(geometry.heightMm) },
      };
    case 'oval':
      return {
        key: 'table.shape.oval',
        params: { width: format(geometry.widthMm), height: format(geometry.heightMm) },
      };
  }
}
