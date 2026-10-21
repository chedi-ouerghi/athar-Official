import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { apiError, TABLE_ID } from '../../test-fixtures';
import { renderWithApp, stubClient } from '../../test-utils';
import { PairScreen } from './PairScreen';

const TOKEN = 'A'.repeat(43);

function setup(pairTable: () => Promise<unknown>) {
  const handlers = {
    onPaired: jest.fn<(tableId: string) => void>(),
    onScanAnother: jest.fn<() => void>(),
  };
  const pair = jest.fn(pairTable);

  renderWithApp(
    <PairScreen tableId={TABLE_ID} token={TOKEN} {...handlers} />,
    stubClient({ pairTable: pair as never }),
  );

  return { ...handlers, pair };
}

describe('PairScreen', () => {
  it('shows loading, redeems the token once, then opens the table', async () => {
    const { pair, onPaired } = setup(() =>
      Promise.resolve({ tableId: TABLE_ID, role: 'owner', expiresAt: null }),
    );

    expect(screen.getByTestId('pair-loading')).toBeTruthy();
    await waitFor(() => {
      expect(onPaired).toHaveBeenCalledWith(TABLE_ID);
    });
    expect(pair).toHaveBeenCalledTimes(1);
    expect(pair).toHaveBeenCalledWith({ tableId: TABLE_ID, token: TOKEN });
  });

  const refusals: [Parameters<typeof apiError>[0], string][] = [
    [
      'PAIRING_TOKEN_INVALID',
      'This code is no longer valid. Ask the table owner for a new invitation.',
    ],
    [
      'TABLE_ALREADY_CLAIMED',
      'This table already belongs to someone else. Ask its owner to invite you.',
    ],
  ];

  it.each(refusals)(
    'explains %s in plain words and does not open the table',
    async (code, message) => {
      const { onPaired } = setup(() => Promise.reject(apiError(code, 400)));

      expect(await screen.findByText(message)).toBeTruthy();
      expect(onPaired).not.toHaveBeenCalled();
    },
  );

  it('tries again only when the user asks', async () => {
    const calls = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(apiError('PAIRING_TOKEN_INVALID', 400))
      .mockResolvedValueOnce({ tableId: TABLE_ID, role: 'guest', expiresAt: null });
    const { onPaired } = setup(calls);

    fireEvent.press(await screen.findByTestId('pair-error-retry'));

    await waitFor(() => {
      expect(onPaired).toHaveBeenCalledWith(TABLE_ID);
    });
    expect(calls).toHaveBeenCalledTimes(2);
  });
});
