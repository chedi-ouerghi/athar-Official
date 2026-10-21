import { describe, expect, it } from 'vitest';
import { hexColorSchema, lightSchema, setLightRequestSchema } from '../src/index.js';

describe('hexColorSchema', () => {
  it('normalises to lowercase #rrggbb', () => {
    expect(hexColorSchema.parse(' #FFAA00 ')).toBe('#ffaa00');
  });

  it.each(['ffaa00', '#fa0', '#gggggg', '#ffaa0011', ''])('rejects %j', (value) => {
    expect(hexColorSchema.safeParse(value).success).toBe(false);
  });
});

describe('lightSchema', () => {
  it('accepts off and on without further fields', () => {
    expect(lightSchema.parse({ mode: 'off' })).toStrictEqual({ mode: 'off' });
    expect(lightSchema.parse({ mode: 'on' })).toStrictEqual({ mode: 'on' });
  });

  it('colour defaults to full brightness and normalises the hex', () => {
    expect(lightSchema.parse({ mode: 'color', color: '#00FF7F' })).toStrictEqual({
      mode: 'color',
      color: '#00ff7f',
      brightness: 100,
    });
  });

  it('rejects a colour without a colour, and a brightness out of range', () => {
    expect(lightSchema.safeParse({ mode: 'color' }).success).toBe(false);
    expect(lightSchema.safeParse({ mode: 'color', color: '#000000', brightness: 0 }).success).toBe(
      false,
    );
    expect(
      lightSchema.safeParse({ mode: 'color', color: '#000000', brightness: 101 }).success,
    ).toBe(false);
    expect(
      lightSchema.safeParse({ mode: 'color', color: '#000000', brightness: 50.5 }).success,
    ).toBe(false);
  });

  it('a preset names a catalogue ambience', () => {
    expect(setLightRequestSchema.parse({ mode: 'preset', ambienceId: 'warm-dusk' })).toStrictEqual({
      mode: 'preset',
      ambienceId: 'warm-dusk',
    });
    expect(lightSchema.safeParse({ mode: 'preset', ambienceId: 'Not A Slug' }).success).toBe(false);
  });

  it('rejects an unknown mode', () => {
    expect(lightSchema.safeParse({ mode: 'strobe' }).success).toBe(false);
  });
});
