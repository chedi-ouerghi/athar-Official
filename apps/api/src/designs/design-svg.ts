/**
 * Rendering a trajectory as an SVG picture, for reviewing designs by eye.
 *
 * The drawing follows the curve the table would trace (linear in polar space
 * between points), not the straight lines between them, so what is seen is what
 * would be drawn in the sand.
 */

import type { Trajectory } from '../device/trajectory.js';
import { sampleCurve } from './geometry.js';

/** Table radius is 1; the view leaves a margin around the rim. */
const VIEW = 1.06;

const PALETTE = {
  sand: '#f1e2c4',
  rim: '#9a7b4f',
  line: '#4a2f17',
  home: '#2e7d32',
} as const;

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** The SVG path data for a trajectory, to four decimals (a tenth of a thousandth of the radius). */
export function trajectoryPathData(trajectory: Trajectory): string {
  return sampleCurve(trajectory.points, 0.01)
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(4)} ${(-y).toFixed(4)}`)
    .join('');
}

/** The picture itself, as elements to place inside an `<svg>` whose view is centred on the table. */
function pictureElements(trajectory: Trajectory): string {
  return [
    `<rect x="${-VIEW}" y="${-VIEW}" width="${2 * VIEW}" height="${2 * VIEW}" fill="${PALETTE.sand}"/>`,
    `<circle cx="0" cy="0" r="1" fill="none" stroke="${PALETTE.rim}" stroke-width="0.01"/>`,
    `<path d="${trajectoryPathData(trajectory)}" fill="none" stroke="${PALETTE.line}" stroke-width="0.006" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<circle cx="0" cy="0" r="0.018" fill="${PALETTE.home}"/>`,
  ].join('\n  ');
}

/** One design as a standalone SVG. The y axis is flipped so angles run counter-clockwise, as on the table. */
export function renderDesignSvg(trajectory: Trajectory, title: string, pixels = 900): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}">
  <title>${escapeXml(title)}</title>
  ${pictureElements(trajectory)}
</svg>
`;
}

export interface SheetEntry {
  readonly title: string;
  readonly trajectory: Trajectory;
}

/** All designs on one page, two across, each labelled with its (English) title. */
export function renderContactSheet(entries: readonly SheetEntry[], cell = 600): string {
  const columns = 2;
  const label = 44;
  const rows = Math.ceil(entries.length / columns);
  const width = columns * cell;
  const height = rows * (cell + label);

  const cells = entries.map(({ title, trajectory }, index) => {
    const x = (index % columns) * cell;
    const y = Math.floor(index / columns) * (cell + label);

    return `<g transform="translate(${x} ${y})">
  <svg width="${cell}" height="${cell}" viewBox="${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}">
  ${pictureElements(trajectory)}
  </svg>
  <text x="${cell / 2}" y="${cell + 30}" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#333">${escapeXml(title)}</text>
</g>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#ffffff"/>
${cells.join('\n')}
</svg>
`;
}
