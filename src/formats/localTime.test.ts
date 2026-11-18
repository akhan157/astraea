import { describe, expect, it } from 'vitest';
import { formatLocalTimestamp, localizeIsoTimestamps } from './localTime';

describe('local timestamps', () => {
  it('names the zone and its UTC offset', () => {
    expect(formatLocalTimestamp('2026-11-17T23:08:00Z', { timeZone: 'America/Los_Angeles' })).toBe('Nov 17, 2026, 3:08 PM PST (UTC−08:00)');
    expect(formatLocalTimestamp('2026-07-01T12:00:00Z', { timeZone: 'America/New_York' })).toBe('Jul 1, 2026, 8:00 AM EDT (UTC−04:00)');
    expect(formatLocalTimestamp('2026-07-01T12:00:00Z', { timeZone: 'UTC' })).toBe('Jul 1, 2026, 12:00 PM UTC');
    expect(formatLocalTimestamp('2026-07-01T12:00:00Z', { timeZone: 'Asia/Kolkata' })).toBe('Jul 1, 2026, 5:30 PM UTC+05:30');
  });

  it('says when a time is unreadable instead of showing Invalid Date', () => {
    expect(formatLocalTimestamp('not a time')).toBe('unreadable time (not a time)');
  });

  it('rewrites ISO instants inside display text', () => {
    expect(localizeIsoTimestamps('open-meteo v2 · valid 2026-11-18T05:00:00.000Z · fetched 2026-11-17T23:08:00Z', { timeZone: 'America/Los_Angeles' }))
      .toBe('open-meteo v2 · valid Nov 17, 2026, 9:00 PM PST (UTC−08:00) · fetched Nov 17, 2026, 3:08 PM PST (UTC−08:00)');
  });
});
