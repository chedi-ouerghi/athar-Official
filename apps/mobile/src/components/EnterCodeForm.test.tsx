import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithI18n } from '../test-utils';
import { EnterCodeForm } from './EnterCodeForm';

const ID = 'k7q3x9m2d8r5t6w4';
const TOKEN = 'A'.repeat(43);

function setup(text: string) {
  const onPairing = jest.fn<(link: { tableId: string; token: string }) => void>();
  renderWithI18n(<EnterCodeForm allowedHosts={['app.athar.example']} onPairing={onPairing} />);

  fireEvent.changeText(screen.getByTestId('code-input'), text);
  fireEvent.press(screen.getByTestId('code-submit'));

  return { onPairing };
}

describe('EnterCodeForm', () => {
  it('hands a pasted pairing link to onPairing, as the scanner does', () => {
    const { onPairing } = setup(`athar://pair?tableId=${ID}&token=${TOKEN}`);

    expect(onPairing).toHaveBeenCalledWith({ tableId: ID, token: TOKEN });
    expect(screen.queryByTestId('code-invalid')).toBeNull();
  });

  it('accepts a link from an allowed host', () => {
    const { onPairing } = setup(`https://app.athar.example/pair?tableId=${ID}&token=${TOKEN}`);

    expect(onPairing).toHaveBeenCalledTimes(1);
  });

  it('rejects a bare table id: a name proves nothing', () => {
    const { onPairing } = setup(ID);

    expect(screen.getByTestId('code-invalid')).toBeTruthy();
    expect(onPairing).not.toHaveBeenCalled();
  });

  it('rejects a link from another host', () => {
    const { onPairing } = setup(`https://evil.example/pair?tableId=${ID}&token=${TOKEN}`);

    expect(screen.getByTestId('code-invalid')).toBeTruthy();
    expect(onPairing).not.toHaveBeenCalled();
  });
});
