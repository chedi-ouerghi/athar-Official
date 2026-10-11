import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithI18n } from '../test-utils';
import { Button, SYNC_PRESS_COOLDOWN_MS } from './Button';

/** A promise the test settles by hand. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('Button', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows its label and calls onPress when pressed', () => {
    const onPress = jest.fn<() => void>();
    renderWithI18n(<Button label="Start" onPress={onPress} testID="b" />);

    fireEvent.press(screen.getByTestId('b'));

    expect(screen.getByText('Start')).toBeTruthy();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores a second tap that arrives before the screen has changed', () => {
    const onPress = jest.fn<() => void>();
    renderWithI18n(<Button label="Start" onPress={onPress} testID="b" />);

    fireEvent.press(screen.getByTestId('b'));
    fireEvent.press(screen.getByTestId('b'));
    fireEvent.press(screen.getByTestId('b'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('accepts another press once the cooldown after a synchronous handler has passed', () => {
    const onPress = jest.fn<() => void>();
    renderWithI18n(<Button label="Start" onPress={onPress} testID="b" />);

    fireEvent.press(screen.getByTestId('b'));
    act(() => {
      jest.advanceTimersByTime(SYNC_PRESS_COOLDOWN_MS);
    });
    fireEvent.press(screen.getByTestId('b'));

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('stays busy while an asynchronous handler runs, and then accepts presses again', async () => {
    const work = deferred();
    const onPress = jest.fn(() => work.promise);
    renderWithI18n(<Button label="Start" onPress={onPress} testID="b" />);

    fireEvent.press(screen.getByTestId('b'));

    expect(screen.getByTestId('b').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
    expect(screen.getByTestId('b-spinner')).toBeTruthy();

    fireEvent.press(screen.getByTestId('b'));
    expect(onPress).toHaveBeenCalledTimes(1);

    await act(async () => {
      work.resolve();
      for (let tick = 0; tick < 5; tick += 1) {
        await Promise.resolve();
      }
    });

    expect(screen.getByTestId('b').props.accessibilityState).toMatchObject({ busy: false });
    expect(screen.queryByTestId('b-spinner')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('b'));
      for (let tick = 0; tick < 5; tick += 1) {
        await Promise.resolve();
      }
    });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('becomes usable again when the asynchronous handler fails', async () => {
    const onPress = jest.fn(() => Promise.reject(new Error('nope')));
    renderWithI18n(<Button label="Start" onPress={onPress} testID="b" />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('b'));
      // Let the rejection settle inside act, so the button's update is flushed.
      for (let tick = 0; tick < 5; tick += 1) {
        await Promise.resolve();
      }
    });

    expect(screen.getByTestId('b').props.accessibilityState).toMatchObject({ busy: false });
  });

  it('does nothing when disabled', () => {
    const onPress = jest.fn<() => void>();
    renderWithI18n(<Button label="Start" onPress={onPress} disabled testID="b" />);

    fireEvent.press(screen.getByTestId('b'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('b').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('shows a spinner and ignores presses while loading', () => {
    const onPress = jest.fn<() => void>();
    renderWithI18n(<Button label="Start" onPress={onPress} loading testID="b" />);

    fireEvent.press(screen.getByTestId('b'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('b-spinner')).toBeTruthy();
    expect(screen.getByTestId('b').props.accessibilityState).toMatchObject({ busy: true });
  });

  it('keeps its label for screen readers while loading', () => {
    renderWithI18n(<Button label="Start" onPress={jest.fn<() => void>()} loading testID="b" />);

    expect(screen.getByTestId('b').props.accessibilityLabel).toBe('Start');
    expect(screen.getByTestId('b').props.accessibilityRole).toBe('button');
  });

  it('lets an error from a synchronous handler through, and is not left locked', () => {
    let first = true;
    const onPress = jest.fn(() => {
      if (first) {
        first = false;
        throw new Error('boom');
      }
    });
    renderWithI18n(<Button label="Start" onPress={onPress} testID="b" />);

    expect(() => fireEvent.press(screen.getByTestId('b'))).toThrow('boom');
    fireEvent.press(screen.getByTestId('b'));

    expect(onPress).toHaveBeenCalledTimes(2);
  });
});
