/**
 * Unit tests for the date/time core: day boundaries, midnight handling, DST,
 * and timezone conversions.
 */
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { dayStart, nextDayStart, dateKey, minuteOfDay, toZone } from './dates';

const ZONE = 'America/Toronto';

/** Build a Date at a given wall-clock time in a zone. */
function at(zone: string, iso: string): Date {
  return DateTime.fromISO(iso, { zone }).toJSDate();
}

describe('dayStart / nextDayStart', () => {
  it('returns local midnight for an instant within the day', () => {
    const d = at(ZONE, '2024-08-18T15:30:00');
    expect(dayStart(d, ZONE).getTime()).toBe(at(ZONE, '2024-08-18T00:00:00').getTime());
  });

  it('nextDayStart lands on the following local midnight', () => {
    const d = at(ZONE, '2024-08-18T15:30:00');
    expect(nextDayStart(d, ZONE).getTime()).toBe(at(ZONE, '2024-08-19T00:00:00').getTime());
  });

  it('handles the spring-forward DST day (23-hour day)', () => {
    // America/Toronto: 2024-03-10 DST begins at 02:00 local (01:00 -> 03:00).
    const d = at(ZONE, '2024-03-10T12:00:00');
    const start = dayStart(d, ZONE);
    const next = nextDayStart(start, ZONE);
    // still exactly 24h wall-clock apart in local terms:
    expect(next.getTime() - start.getTime()).toBe(23 * 3600 * 1000);
    expect(toZone(next, ZONE).toISODate()).toBe('2024-03-11');
  });

  it('handles the fall-back DST day (25-hour day)', () => {
    // America/Toronto: 2024-11-03 DST ends at 02:00 -> 01:00.
    const d = at(ZONE, '2024-11-03T12:00:00');
    const start = dayStart(d, ZONE);
    const next = nextDayStart(start, ZONE);
    expect(next.getTime() - start.getTime()).toBe(25 * 3600 * 1000);
    expect(toZone(next, ZONE).toISODate()).toBe('2024-11-04');
  });

  it('produces the same midnight for every instant in that day (no drift)', () => {
    for (const iso of ['2024-08-18T00:00:00', '2024-08-18T10:30:00', '2024-08-18T23:59:59']) {
      expect(dayStart(at(ZONE, iso), ZONE).getTime()).toBe(
        at(ZONE, '2024-08-18T00:00:00').getTime(),
      );
    }
  });
});

describe('dateKey', () => {
  it('formats the zone-local ISO date, not UTC', () => {
    // 2024-08-18 23:30 in Toronto is 2024-08-19 03:30 UTC.
    const d = at(ZONE, '2024-08-18T23:30:00');
    expect(dateKey(d, ZONE)).toBe('2024-08-18');
    expect(dateKey(d, 'UTC')).toBe('2024-08-19');
  });

  it('does not shift a late-evening event onto the next day in its zone', () => {
    const d = at(ZONE, '2024-01-31T23:45:00');
    expect(dateKey(d, ZONE)).toBe('2024-01-31');
  });
});

describe('minuteOfDay', () => {
  it('computes wall-clock minutes from midnight', () => {
    expect(minuteOfDay(at(ZONE, '2024-08-18T09:30:00'), ZONE)).toBe(9 * 60 + 30);
    expect(minuteOfDay(at(ZONE, '2024-08-18T00:00:00'), ZONE)).toBe(0);
    expect(minuteOfDay(at(ZONE, '2024-08-18T23:59:00'), ZONE)).toBe(23 * 60 + 59);
  });

  it('differs across zones for the same instant', () => {
    const instant = at('UTC', '2024-08-18T12:00:00');
    // Toronto (UTC-4 in summer) wall-clock is 08:00
    expect(minuteOfDay(instant, ZONE)).toBe(8 * 60);
    expect(minuteOfDay(instant, 'UTC')).toBe(12 * 60);
  });
});

describe('DST-safe day boundaries across zones', () => {
  it('keeps midnight boundaries correct in a UTC+X zone', () => {
    const z = 'Asia/Tokyo';
    const d = at(z, '2024-08-18T23:59:00');
    expect(nextDayStart(dayStart(d, z), z).getTime() - dayStart(d, z).getTime()).toBe(
      24 * 3600 * 1000,
    );
  });
});