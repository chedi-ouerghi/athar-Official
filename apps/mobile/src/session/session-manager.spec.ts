import type { SessionResponse } from '@athar/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http-client';
import { SessionManager, type SessionStorage } from './session-manager';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');

function session(token: string, expiresInMs: number): SessionResponse {
  return {
    accessToken: token,
    accessTokenExpiresAt: new Date(NOW + expiresInMs).toISOString(),
    refreshToken: `r-${token}`,
    refreshTokenExpiresAt: new Date(NOW + 86_400_000).toISOString(),
    account: { id: 'a1', email: 'a@athar.test', displayName: 'A', role: 'customer' },
  };
}

function memoryStorage(initial?: SessionResponse): SessionStorage & { value?: SessionResponse } {
  const storage: SessionStorage & { value?: SessionResponse } = {
    value: initial,
    read: async () => storage.value,
    write: async (next) => {
      storage.value = next;
    },
    clear: async () => {
      storage.value = undefined;
    },
  };

  return storage;
}

describe('SessionManager', () => {
  it('has no token when signed out', async () => {
    const manager = new SessionManager(memoryStorage(), vi.fn(), () => NOW);
    await manager.load();

    expect(await manager.accessToken()).toBeUndefined();
  });

  it('returns a live token without refreshing', async () => {
    const refresh = vi.fn();
    const manager = new SessionManager(memoryStorage(session('t1', 600_000)), refresh, () => NOW);
    await manager.load();

    expect(await manager.accessToken()).toBe('t1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shares one refresh between concurrent callers and stores the new session', async () => {
    const storage = memoryStorage(session('t1', 5_000));
    const refresh = vi.fn().mockResolvedValue(session('t2', 600_000));
    const manager = new SessionManager(storage, refresh, () => NOW);
    await manager.load();

    const tokens = await Promise.all([manager.accessToken(), manager.accessToken()]);

    expect(tokens).toStrictEqual(['t2', 't2']);
    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith('r-t1');
    expect(storage.value?.accessToken).toBe('t2');
  });

  it('signs out when the server refuses the refresh token', async () => {
    const storage = memoryStorage(session('t1', 5_000));
    const refresh = vi.fn().mockRejectedValue(new ApiError('http', 'no', 401, 'SESSION_EXPIRED'));
    const manager = new SessionManager(storage, refresh, () => NOW);
    await manager.load();

    expect(await manager.accessToken()).toBeUndefined();
    expect(storage.value).toBeUndefined();
  });

  it('stays signed in when the refresh could not reach the server', async () => {
    const refresh = vi.fn().mockRejectedValue(new ApiError('network', 'down'));
    const manager = new SessionManager(memoryStorage(session('t1', 5_000)), refresh, () => NOW);
    await manager.load();

    expect(await manager.accessToken()).toBe('t1');
    expect(manager.current).toBeDefined();
  });
});
