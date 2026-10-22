import { describe, expect, it } from 'vitest';
import { trajectoryProblems } from '../design-collection.js';
import { HOME_RHO } from '../home.js';
import { generateRake } from './rake.js';

describe('the rake generator', () => {
  const rake = generateRake();

  it('passes the same trajectory checks as a catalogue design', () => {
    expect(trajectoryProblems(rake)).toStrictEqual([]);
  });

  it('winds outward from home to near the rim, then returns home', () => {
    const rhos = rake.points.map(([, rho]) => rho);
    const outermost = rhos.indexOf(Math.max(...rhos));

    expect(rhos[0]).toBe(HOME_RHO);
    expect(rhos.at(-1)).toBe(HOME_RHO);
    expect(Math.max(...rhos)).toBeGreaterThan(0.9);
    expect(Math.max(...rhos)).toBeLessThan(0.99);
    // Outward all the way to the rim: rho never falls on the spiral.
    expect(rhos.slice(1, outermost + 1).every((rho, i) => rho >= (rhos[i] ?? 0))).toBe(true);
  });
});
