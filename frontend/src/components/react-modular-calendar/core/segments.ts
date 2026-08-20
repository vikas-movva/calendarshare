/**
 * Day segmentation.
 *
 * Splits events into per-day, range-clipped segments. Each segment knows its
 * day index, its clipped [start, end) within that day, and whether it is the
 * first/last day of the event within the visible range. All math is done in the
 * calendar zone so DST and midnight boundaries are exact.
 */
import type { CalendarEvent, CalendarRange, CalendarZone } from '../types';
import { dayStart, nextDayStart } from './dates';

/**
 * A single event's presence on one calendar day, as produced by segmentation.
 * The layout modules extend this with positional fields.
 */
export interface DaySegment {
  event: CalendarEvent;
  /** Offset of this day from the range's first day (0-based). */
  dayIndex: number;
  /** Day-clipped, range-clipped start instant. */
  start: Date;
  /** Day-clipped, range-clipped end instant. */
  end: Date;
  /** True when the segment starts exactly at the event's true start. */
  isFirstDay: boolean;
  /** True when the segment ends exactly at the event's true end. */
  isLastDay: boolean;
}

/** The day boundaries `[start_i, end_i)` over a range, including the closing edge. */
export interface DayBoundaries {
  /** region boundaries: boundaries[i] = start of day i; boundaries[n] = exclusive end. */
  boundaries: Date[];
}

/**
 * Build the ordered list of calendar-day start instants covering `[range.start,
 * range.end)`, each at local midnight in `zone`. DST-safe.
 *
 * The result includes the exclusive closing boundary (start of the day after
 * the last visible day) as its final element, so `boundaries.length - 1` is
 * exactly the number of visible days. `boundaries[0]` is the day containing
 * `range.start`; `boundaries[n]` is the first day strictly after `range.end`.
 */
export function buildDays(range: CalendarRange, zone: CalendarZone): DayBoundaries {
  // "start of the day after the last visible day" — the exclusive closing edge.
  const endDayMs = dayStart(range.end, zone).getTime();
  const days: Date[] = [];
  let cursor = dayStart(range.start, zone);
  // Include every midnights up to and including the closing boundary.
  do {
    days.push(cursor);
    cursor = nextDayStart(cursor, zone);
  } while (cursor.getTime() <= endDayMs);
  return { boundaries: days };
}

/**
 * For every event, produce one segment per calendar day it touches, clipped to
 * both the event's true span and the visible range. `dayIndex` is the day's
 * offset from `range.start`. Deterministically ordered (day, then event id).
 */
export function splitIntoDays(
  events: CalendarEvent[],
  range: CalendarRange,
  zone: CalendarZone,
): DaySegment[] {
  const days = buildDays(range, zone).boundaries;
  const segments: DaySegment[] = [];

  for (const event of events) {
    pushSegments(event, days, range, segments);
  }

  segments.sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    return a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0;
  });

  return segments;
}

function pushSegments(
  event: CalendarEvent,
  days: Date[],
  range: CalendarRange,
  out: DaySegment[],
): void {
  const eventStartMs = event.start.getTime();
  const eventEndMs = event.end.getTime();
  const clippedStart = Math.max(eventStartMs, range.start.getTime());
  const clippedEnd = Math.min(eventEndMs, range.end.getTime());

  if (clippedStart >= clippedEnd) return; // fully outside the range

  // Binary-search for the day that contains clippedStart.
  // days[i] <= clippedStart < days[i+1].
  let lo = 0;
  let hi = days.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid]!.getTime() <= clippedStart) lo = mid;
    else hi = mid;
  }

  for (let d = lo; d < days.length - 1; d++) {
    const dayStartMs = days[d]!.getTime();
    const dayEndMs = days[d + 1]!.getTime();
    const segStart = Math.max(clippedStart, dayStartMs);
    const segEnd = Math.min(clippedEnd, dayEndMs);
    if (segStart >= segEnd) continue;

    out.push({
      event,
      dayIndex: d,
      start: new Date(segStart),
      end: new Date(segEnd),
      isFirstDay: segStart === eventStartMs,
      isLastDay: segEnd === eventEndMs,
    });

    if (clippedEnd <= dayEndMs) break;
  }
}