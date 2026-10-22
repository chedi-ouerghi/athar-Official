import type { ReactNode } from 'react';

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/** Whether `text` holds any Arabic letter. */
export function isArabic(text: string): boolean {
  return ARABIC.test(text);
}

/**
 * Whether the text a component is about to show holds any Arabic. The decorations of
 * the Latin look (capitals, tracking, the serif) would break the joins between
 * Arabic letters, so they are applied only when this is false.
 */
export function containsArabic(children: ReactNode): boolean {
  if (typeof children === 'string') {
    return isArabic(children);
  }

  return Array.isArray(children)
    ? children.some((child: ReactNode) => containsArabic(child))
    : false;
}
