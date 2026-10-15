import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShutdownCoordinator } from './shutdown-coordinator.service.js';
import { createTestConfig } from '../../test/create-test-config.js';

/**
 * `process.exit` is typed as returning `never` because it really does not
 * return. The stub does return, so its implementation has to be cast.
 */
type ExitFn = (code?: string | number | null) => never;

const exitStub = (() => undefined) as unknown as ExitFn;

describe('ShutdownCoordinator', () => {
  let coordinator: ShutdownCoordinator;

  const listenerCounts = () => ({
    SIGINT: process.listenerCount('SIGINT'),
    SIGTERM: process.listenerCount('SIGTERM'),
  });

  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation(exitStub);
    coordinator = new ShutdownCoordinator(createTestConfig({ SHUTDOWN_TIMEOUT_MS: '50' }));
  });

  afterEach(() => {
    coordinator.onModuleDestroy();
    vi.restoreAllMocks();
  });

  it('registers a handler for every termination signal on init', () => {
    const before = listenerCounts();

    coordinator.onModuleInit();

    const after = listenerCounts();

    expect(after.SIGINT).toBe(before.SIGINT + 1);
    expect(after.SIGTERM).toBe(before.SIGTERM + 1);
  });

  it('removes its handlers on destroy so listeners do not leak', () => {
    const before = listenerCounts();

    coordinator.onModuleInit();
    coordinator.onModuleDestroy();

    expect(listenerCounts()).toStrictEqual(before);
  });

  it('forces an exit when a termination signal is not followed by a clean shutdown', async () => {
    coordinator.onModuleInit();

    process.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('does not force an exit when the shutdown completes in time', async () => {
    coordinator.onModuleInit();

    process.emit('SIGINT', 'SIGINT');
    coordinator.onModuleDestroy();
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(process.exit).not.toHaveBeenCalled();
  });
});
