import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { apiError, TABLE_ID, table } from '../../test-fixtures';
import { renderWithApp, stubClient } from '../../test-utils';
import { LightControl } from './LightControl';

const swatch = (hex: string) => screen.getByTestId(`light-swatch-${hex}`);
const selected = (hex: string) => swatch(hex).props.accessibilityState?.selected === true;

function setup(setLight: (...args: never[]) => Promise<unknown>) {
  const send = jest.fn(setLight);

  renderWithApp(<LightControl tableId={TABLE_ID} />, stubClient({ setLight: send as never }));

  return send;
}

describe('LightControl', () => {
  it('shows the colour at once, while the command is still on its way', async () => {
    const send = setup(() => new Promise(() => undefined));

    fireEvent.press(swatch('#ff9500'));

    expect(selected('#ff9500')).toBe(true);
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith(TABLE_ID, {
        mode: 'color',
        color: '#ff9500',
        brightness: 100,
      });
    });
  });

  it('sends the typed hex colour once it is complete, and says when it is not valid', async () => {
    const send = setup(() => Promise.resolve(table()));

    fireEvent.changeText(screen.getByTestId('light-hex'), '#12');
    expect(screen.getByTestId('light-hex-invalid')).toBeTruthy();
    expect(send).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('light-hex'), '#12AB9F');
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith(TABLE_ID, {
        mode: 'color',
        color: '#12ab9f',
        brightness: 100,
      });
    });
  });

  it('keeps the chosen colour when the brightness changes', async () => {
    const send = setup(() => Promise.resolve(table()));

    fireEvent.press(swatch('#34c759'));
    fireEvent.press(screen.getByTestId('light-dimmer'));

    await waitFor(() => {
      expect(send).toHaveBeenLastCalledWith(TABLE_ID, {
        mode: 'color',
        color: '#34c759',
        brightness: 90,
      });
    });
    expect(screen.getByTestId('light-brightness').props.children).toBe('Brightness: 90%');
  });

  it('goes back to what the table last confirmed when a command fails, and says why', async () => {
    const send = setup(() => Promise.resolve(table()));

    fireEvent.press(swatch('#34c759'));
    await waitFor(() => {
      expect(send).toHaveBeenCalledTimes(1);
    });

    send.mockRejectedValueOnce(apiError('TABLE_OFFLINE', 409));
    fireEvent.press(swatch('#ff3b30'));

    expect(await screen.findByTestId('light-error')).toBeTruthy();
    expect(selected('#ff3b30')).toBe(false);
    expect(selected('#34c759')).toBe(true);
  });
});
