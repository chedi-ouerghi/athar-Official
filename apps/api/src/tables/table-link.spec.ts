import { describe, expect, it } from 'vitest';
import { buildTableLink } from './table-link.js';

describe('buildTableLink', () => {
  it('builds <origin>/t/<tableId> from the configured origin', () => {
    expect(buildTableLink('https://app.athar.example', 'k7q3x9m2d8r5t6w4')).toBe(
      'https://app.athar.example/t/k7q3x9m2d8r5t6w4',
    );
  });

  it('keeps a port and an http origin in development', () => {
    expect(buildTableLink('http://192.168.1.20:3000', 'table-001')).toBe(
      'http://192.168.1.20:3000/t/table-001',
    );
  });

  it('falls back to the athar:// scheme when no origin is configured', () => {
    expect(buildTableLink(undefined, 'table-001')).toBe('athar://t/table-001');
  });

  it('contains the table id and nothing else: no token, query or fragment', () => {
    for (const base of ['https://app.athar.example', undefined]) {
      const link = buildTableLink(base, 'table-001');

      expect(link).not.toMatch(/[?#]/);
      expect(link.endsWith('/t/table-001')).toBe(true);
    }
  });
});
