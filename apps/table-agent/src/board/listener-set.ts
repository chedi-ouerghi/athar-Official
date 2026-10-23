import type { Unsubscribe } from './board-port.js';

/** Minimal typed pub/sub: add a listener, get an unsubscribe function, emit to all. */
export class ListenerSet<T> {
  private readonly listeners = new Set<(value: T) => void>();

  add(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }
}
