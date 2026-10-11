/**
 * Rendering a table link as printable QR code files.
 *
 * Print settings (docs/architecture.md, "QR generation CLI"):
 * - error-correction level **Q**, about 25% recoverable, so a scuffed or partly
 *   covered sticker still scans;
 * - a quiet zone of 4 modules, the QR standard's minimum;
 * - black on white;
 * - an SVG for print production and a PNG of at least 1024 pixels.
 */

import QRCode from 'qrcode';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const QR_ERROR_CORRECTION = 'Q';
export const QR_QUIET_ZONE_MODULES = 4;
export const QR_MIN_PNG_PIXELS = 1024;

const COLORS = { dark: '#000000', light: '#ffffff' } as const;

export interface QrFiles {
  readonly svgPath: string;
  readonly pngPath: string;
  /** Width and height of the PNG, in pixels. */
  readonly pngPixels: number;
}

/** Write `<tableId>.svg` and `<tableId>.png` for `link` into `outputDirectory`. */
export async function writeQrFiles(
  link: string,
  tableId: string,
  outputDirectory: string,
): Promise<QrFiles> {
  await mkdir(outputDirectory, { recursive: true });

  const options = {
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: QR_QUIET_ZONE_MODULES,
    color: COLORS,
  } as const;

  // The PNG is drawn at a whole number of pixels per module. Rounding that
  // number up is what guarantees the image is at least the requested size.
  const modules = QRCode.create(link, { errorCorrectionLevel: QR_ERROR_CORRECTION }).modules.size;
  const totalModules = modules + 2 * QR_QUIET_ZONE_MODULES;
  const scale = Math.ceil(QR_MIN_PNG_PIXELS / totalModules);

  const svg = await QRCode.toString(link, { ...options, type: 'svg' });
  const png = await QRCode.toBuffer(link, { ...options, type: 'png', scale });

  const svgPath = join(outputDirectory, `${tableId}.svg`);
  const pngPath = join(outputDirectory, `${tableId}.png`);

  await writeFile(svgPath, svg, 'utf8');
  await writeFile(pngPath, png);

  return { svgPath, pngPath, pngPixels: scale * totalModules };
}
