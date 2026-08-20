/**
 * Date/time core.
 *
 * All day-boundary and positioning math for the calendar runs through here,
 * always converted into a Luxon `DateTime` in the calendar's IANA timezone.
 * This is the single place DST and midnight-boundary subtleties are resolved.
 */
import { DateTime } from 'luxon';
import type { CalendarZone } from '../types';

/** Convert an instant into a wall-clock `DateTime` for the zone. */
export function toZone(instant: Date, zone: CalendarZone): DateTime {
  return DateTime.fromJSDate(instant, { zone });
}

/**
 * Convert an absolute instant to the start instant of its calendar day in
 * `zone` (local midnight). Handles DST: a day that is 23 or 25 hours long still
 * produces its true local midnight.
 */
export function dayStart(instant: Date, zone: CalendarZone): Date {
  return toZone(instant, zone).startOf('day').toJSDate();
}

/** Local midnight at the start of the next calendar day (exclusive boundary). */
export function nextDayStart(instant: Date, zone: CalendarZone): Date {
  // startOf('day').plus({ days: 1 }) is DST-safe: Luxon resolves calendar math.
  return toZone(instant, zone)
    .startOf('day')
    .plus({ days: 1 })
    .toJSDate();
}

/** ISO date key (yyyy-MM-dd) for an instant in the zone. */
export function dateKey(instant: Date, zone: CalendarZone): string {
  return toZone(instant, zone).toISODate() ?? '';
}

/**
 * The minute-of-day (0–1439) of an instant, in the zone's wall clock. Used to
 * place a timed event on the vertical axis.
 */
export function minuteOfDay(instant: Date, zone: CalendarZone): number {
  const dt = toZone(instant, zone);
  return dt.hour * 60 + dt.minute + dt.second / 60;
}

// Re-exported convenience for tests and downstream consumers.
export { DateTime };