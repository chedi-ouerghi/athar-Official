/**
 * The physical shape and size of a table, as configured by an admin.
 *
 * Designs and freehand paths stay in the normalised `polar-theta-rho/v1`
 * convention (see `polar-path.ts`); the controller adapts them to the table. So
 * that the API, the app and the controller agree on what a normalised point
 * means on a table that is not round, this module is the one definition of the
 * mapping:
 *
 * ```
 * x = (widthMm  / 2) * rho * cos(theta)
 * y = (heightMm / 2) * rho * sin(theta)
 * ```
 *
 * with the origin at the centre of the table, x along its width and y along its
 * height. `rho = 1` is the edge of the ellipse inscribed in the table: the disc
 * for a round or square table, a stretched one for a rectangle or an oval. The
 * corners of a square or rectangle are outside that ellipse and are not drawn.
 *
 * Pure data in, data out: no framework, no I/O.
 */

import { z } from 'zod';

export const TABLE_SHAPES = ['round', 'square', 'rectangle', 'oval'] as const;
export const tableShapeSchema = z.enum(TABLE_SHAPES);
export type TableShape = z.infer<typeof tableShapeSchema>;

/** Smallest and largest side accepted, in millimetres. Catches a typo such as 8 for 800. */
export const TABLE_DIMENSION_MIN_MM = 100;
export const TABLE_DIMENSION_MAX_MM = 10_000;

const dimensionSchema = z.number().int().min(TABLE_DIMENSION_MIN_MM).max(TABLE_DIMENSION_MAX_MM);

/** Shapes whose two dimensions are one and the same length. */
const EQUAL_SIDES: ReadonlySet<TableShape> = new Set(['round', 'square']);

/**
 * Shape and size of a table. `widthMm` is the X dimension and `heightMm` the Y
 * one. A round table has one dimension, its diameter, stored in both; a square
 * one its side. A rectangle or an oval has two different ones: equal ones would
 * make it a square or a round table.
 */
export const tableGeometrySchema = z
  .object({
    shape: tableShapeSchema,
    widthMm: dimensionSchema,
    heightMm: dimensionSchema,
  })
  .superRefine((geometry, context) => {
    const equal = geometry.widthMm === geometry.heightMm;

    if (EQUAL_SIDES.has(geometry.shape) && !equal) {
      context.addIssue({
        code: 'custom',
        path: ['heightMm'],
        message: `A ${geometry.shape} table has the same width and height.`,
      });
    }

    if (!EQUAL_SIDES.has(geometry.shape) && equal) {
      context.addIssue({
        code: 'custom',
        path: ['heightMm'],
        message: `A ${geometry.shape} table needs a width and a height that differ: with equal ones it is a ${geometry.shape === 'oval' ? 'round' : 'square'} table.`,
      });
    }
  });
export type TableGeometry = z.infer<typeof tableGeometrySchema>;

/**
 * What a table registered before its size was configured is taken to be. A
 * placeholder, not a measurement: the admin is expected to set the real size.
 */
export const DEFAULT_TABLE_GEOMETRY: TableGeometry = {
  shape: 'round',
  widthMm: 600,
  heightMm: 600,
};

/** One point in millimetres from the centre of the table. */
export type TablePointMm = readonly [x: number, y: number];

/** Where a normalised polar point lands on a table of this size, in millimetres. */
export function polarToTableMm(
  theta: number,
  rho: number,
  geometry: Pick<TableGeometry, 'widthMm' | 'heightMm'>,
): TablePointMm {
  return [
    (geometry.widthMm / 2) * rho * Math.cos(theta),
    (geometry.heightMm / 2) * rho * Math.sin(theta),
  ];
}

/**
 * The table's proportions with the longer side at 1, for drawing it to scale:
 * `{ x: 1, y: 0.5 }` is a table twice as wide as it is tall.
 */
export function tableProportions(geometry: Pick<TableGeometry, 'widthMm' | 'heightMm'>): {
  readonly x: number;
  readonly y: number;
} {
  const longest = Math.max(geometry.widthMm, geometry.heightMm);

  return { x: geometry.widthMm / longest, y: geometry.heightMm / longest };
}
