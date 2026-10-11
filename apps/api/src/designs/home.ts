/**
 * Where every design starts and ends.
 *
 * Designs begin and end at the same radius, so any design can follow any other,
 * and the same design can repeat, without a jump between drawings. The value is
 * **not decided**: it depends on the mechanics of the table (where the ball can
 * rest), which are not chosen yet (docs/architecture.md, "Trajectory").
 *
 * It is the centre for now, for a practical reason: at the centre the angle is
 * meaningless, so chaining is continuous whatever angle the previous drawing
 * stopped at. At the rim the end angle of one design would have to equal the
 * start angle of the next.
 *
 * Every design is validated against this value at startup, and the generators
 * are drawn as out-and-back paths that return to the centre. Choosing the rim
 * means redrawing the generators, not only changing this number.
 */
export const HOME_RHO = 0;

/** How far a design's first or last point may be from {@link HOME_RHO}. */
export const HOME_RHO_TOLERANCE = 1e-6;
