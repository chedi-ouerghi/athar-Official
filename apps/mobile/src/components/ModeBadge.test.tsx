import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { renderWithI18n } from '../test-utils';
import { ModeBadge } from './ModeBadge';

describe('ModeBadge', () => {
  it('says Simulation for a simulated table or job', () => {
    renderWithI18n(<ModeBadge mode="simulation" />);

    expect(screen.getByText('Simulation')).toBeTruthy();
    expect(screen.queryByText('Real table')).toBeNull();
  });

  it('says Real table only for the exact value "hardware"', () => {
    renderWithI18n(<ModeBadge mode="hardware" />);

    expect(screen.getByText('Real table')).toBeTruthy();
    expect(screen.queryByText('Simulation')).toBeNull();
  });

  it.each([undefined, null, '', 'Hardware', 'real', 'simulated', 0, {}])(
    'fails closed and says Unknown mode for %p, never nothing',
    (mode) => {
      renderWithI18n(<ModeBadge mode={mode} testID="badge" />);

      expect(screen.getByTestId('badge')).toBeTruthy();
      expect(screen.getByText('Unknown mode')).toBeTruthy();
      expect(screen.queryByText('Real table')).toBeNull();
      expect(screen.queryByText('Simulation')).toBeNull();
    },
  );

  it('is written in the selected language', () => {
    renderWithI18n(<ModeBadge mode="simulation" />, { locale: 'ar' });

    expect(screen.getByText('محاكاة')).toBeTruthy();
    expect(screen.queryByText('Simulation')).toBeNull();
  });

  it('is announced as one piece of text', () => {
    renderWithI18n(<ModeBadge mode="simulation" testID="badge" />);

    expect(screen.getByTestId('badge').props.accessible).toBe(true);
  });
});
