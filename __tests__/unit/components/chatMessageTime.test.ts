import { formatTime } from '../../../src/components/ChatMessage/utils';

/**
 * A message shows the time on the wall next to the person reading it.
 *
 * Hermes ships without ICU in most React Native builds, so toLocaleTimeString answered in UTC: a
 * message written at 10:12 in Delhi read "4:42 AM" on the phone while the Mac beside it said 10:12.
 * These assert against the device's own zone rather than a hardcoded string, so they hold wherever
 * they run.
 */
describe('message timestamps', () => {
  const at = (hours: number, minutes: number): number => {
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
  };

  it('shows the local wall-clock time, not UTC', () => {
    expect(formatTime(at(10, 12))).toBe('10:12 AM');
    expect(formatTime(at(16, 5))).toBe('4:05 PM');
  });

  it('reads midnight and noon the way a person says them', () => {
    expect(formatTime(at(0, 7))).toBe('12:07 AM');
    expect(formatTime(at(12, 0))).toBe('12:00 PM');
  });

  it('does not depend on Intl being present', () => {
    const original = (globalThis as { Intl?: unknown }).Intl;
    // A build with ICU stripped: the formatter must still answer correctly.
    delete (globalThis as { Intl?: unknown }).Intl;
    try {
      expect(formatTime(at(10, 12))).toBe('10:12 AM');
    } finally {
      (globalThis as { Intl?: unknown }).Intl = original;
    }
  });
});
