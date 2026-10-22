import { describe, expect, it } from 'vitest';
import { FakeClock } from '../device/fake-clock.js';
import { PAIRING_TTL_MS, PairingStore } from './pairing-store.js';

describe('PairingStore', () => {
  it('pairs one session with one table, for 15 minutes from the last pairing', () => {
    const clock = new FakeClock();
    const store = new PairingStore(clock);

    expect(store.pair('s1', 'table-001')).toStrictEqual({
      tableId: 'table-001',
      expiresAt: new Date(clock.now() + PAIRING_TTL_MS).toISOString(),
    });
    expect(store.isPaired('s1', 'table-001')).toBe(true);
    expect(store.isPaired('s2', 'table-001')).toBe(false);
    expect(store.isPaired('s1', 'table-002')).toBe(false);

    clock.advanceSeconds(14 * 60);
    store.pair('s1', 'table-001');
    clock.advanceSeconds(14 * 60);
    expect(store.isPaired('s1', 'table-001')).toBe(true);

    clock.advanceSeconds(60);
    expect(store.isPaired('s1', 'table-001')).toBe(false);
  });

  it('unpairs', () => {
    const store = new PairingStore(new FakeClock());
    store.pair('s1', 'table-001');

    store.unpair('s1', 'table-001');

    expect(store.isPaired('s1', 'table-001')).toBe(false);
  });

  it('forgets expired pairings when it pairs again', () => {
    const clock = new FakeClock();
    const store = new PairingStore(clock);
    store.pair('s1', 'table-001');
    store.pair('s2', 'table-001');
    clock.advanceSeconds(15 * 60);

    store.pair('s3', 'table-001');

    expect((store as unknown as { expiries: Map<string, number> }).expiries.size).toBe(1);
  });
});
