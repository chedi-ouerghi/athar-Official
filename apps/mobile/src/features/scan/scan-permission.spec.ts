import { describe, expect, it } from 'vitest';
import { classifyScanView } from './scan-permission';

describe('classifyScanView', () => {
  it('waits for the permission state', () => {
    expect(classifyScanView(null)).toBe('checking');
  });

  it('scans when the permission is granted', () => {
    expect(classifyScanView({ granted: true, status: 'granted', canAskAgain: true })).toBe(
      'granted',
    );
  });

  it('explains and asks before the first request', () => {
    expect(classifyScanView({ granted: false, status: 'undetermined', canAskAgain: true })).toBe(
      'ask',
    );
  });

  it('falls back to the typed code once it is denied, asking again or not', () => {
    expect(classifyScanView({ granted: false, status: 'denied', canAskAgain: true })).toBe(
      'denied',
    );
    expect(classifyScanView({ granted: false, status: 'denied', canAskAgain: false })).toBe(
      'denied',
    );
  });
});
