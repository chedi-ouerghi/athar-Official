import { describe, expect, it } from 'vitest';
import { parseTableCode } from './parse-table-code';

const options = { allowedHosts: ['app.athar.example'] };
const ID = 'k7q3x9m2d8r5t6w4';

describe('parseTableCode', () => {
  it('accepts a bare table id, ignoring case and surrounding space', () => {
    expect(parseTableCode(ID, options)).toStrictEqual({ tableId: ID });
    expect(parseTableCode(`  ${ID.toUpperCase()} `, options)).toStrictEqual({ tableId: ID });
  });

  it('accepts both link forms through the link parser', () => {
    expect(parseTableCode(`athar://t/${ID}`, options).tableId).toBe(ID);
    expect(parseTableCode(`https://app.athar.example/t/${ID}`, options).tableId).toBe(ID);
  });

  it('applies the host allow-list to pasted links', () => {
    expect(parseTableCode(`https://evil.example/t/${ID}`, options).error).toBe('host-not-allowed');
  });

  it('refuses anything that is not a valid id', () => {
    for (const bad of ['ab', 'has space', 'under_score', 'a'.repeat(41), '../etc']) {
      expect(parseTableCode(bad, options).error, bad).toBe('invalid-table-id');
    }
  });

  it('reports empty input', () => {
    expect(parseTableCode('   ', options).error).toBe('empty');
  });
});
