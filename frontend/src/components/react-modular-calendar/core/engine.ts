/**
 * Calendar engine.
 *
 * The single pure entry point that turns `(events, range, timezone)` into a
 * `CalendarLayout` — every day's timed slots, all-day boxes, and positioned
 * timed boxes. The view layer consumes this result and never re-runs layout.
 */
import type { CalendarEvent, CalendarRange, CalendarZone } from '../types';
import { dateKey, nextDayStart, toZone } from './dates';
import { buildDays, splitIntoDays } from './segments';
import { layoutAllDay, type AllDayBox } from './layout/allday';
import { layoutDayTimed, type TimedSegment } from './layout/timed';
import type { DayLayout, TimeSlot } from './layout/model';

export interface CalendarLayout {
  /** One entry per visible day, in order. */
  days: DayLayout[];
  /** All all-day event boxes (already column/lane positioned). */
  allDay: AllDayBox[];
  /** Total event-day segments produced. */
  segmentsTotal: number;
}

export interface EngineOptions {
  /** Minutes per timed-grid column (governs slot count; 0 disables the grid). */
  slotMinutes?: number;
  /** Whether to compute all-day boxes/strip. Default true. */
  includeAllDay?: boolean;
}

/**
 * Compute the full layout for a range. Pure and deterministic: identical
 * inputs always produce identical output.
 */
export function layoutEvents(
  events: CalendarEvent[],
  range: CalendarRange,
  timezone: CalendarZone,
  options: EngineOptions = {},
): CalendarLayout {
  const { slotMinutes = 60, includeAllDay = true } = options;
  const days = buildDays(range, timezone).boundaries;
  const dayCount = days.length - 1;

  // Partition segments into timed (per day) and all-day.
  const segments = splitIntoDays(events, range, timezone);
  const timedByDay = new Map<number, TimedSegment[]>();
  const allDaySegs: Array<{ event: CalendarEvent; dayIndex: number }> = [];

  for (const seg of segments) {
    if (seg.event.isAllDay) {
      allDaySegs.push({ event: seg.event, dayIndex: seg.dayIndex });
    } else {
      const list = timedByDay.get(seg.dayIndex) ?? [];
      list.push(seg);
      timedByDay.set(seg.dayIndex, list);
    }
  }

  // Build day records with their timed grid slots.
  const dayLayouts: DayLayout[] = [];
  for (let i = 0; i < dayCount; i++) {
    const start = days[i]!;
    const end = days[i + 1]!;
    dayLayouts.push({
      index: i,
      key: dateKey(start, timezone),
      start,
      end,
      slots: buildSlots(start, timezone, slotMinutes),
      allDay: [],
      timed: [],
    });
  }

  // Timed layout per day.
  for (const [dayIdx, segs] of timedByDay) {
    const day = dayLayouts[dayIdx];
    if (!day) continue;
    day.timed = layoutDayTimed(segs, day.start.getTime(), day.end.getTime());
  }

  // All-day layout across the whole strip.
  let allDayBoxes: AllDayBox[] = [];
  if (includeAllDay) {
    const res = layoutAllDay(allDaySegs);
    allDayBoxes = res.boxes;
    const perDayBoxes = distributeAllDay(allDayBoxes, dayCount);
    for (let d = 0; d < dayCount; d++) {
      dayLayouts[d]!.allDay = perDayBoxes[d] ?? [];
    }
  }

  return {
    days: dayLayouts,
    allDay: allDayBoxes,
    segmentsTotal: segments.length,
  };
}

/** Assign each all-day box to every day column it spans. */
function distributeAllDay(
  boxes: AllDayBox[],
  dayCount: number,
): Array<AllDayBox[]> {
  const byDay: Array<AllDayBox[]> = Array.from({ length: dayCount }, () => []);
  for (const b of boxes) {
    const end = Math.min(b.colStart + b.colSpan, dayCount);
    for (let d = b.colStart; d < end; d++) byDay[d]!.push(b);
  }
  return byDay;
}

/** Build the step-slot breakdown of a day (wall-clock based). */
function buildSlots(
  dayStart: Date,
  timezone: CalendarZone,
  stepMinutes: number,
): TimeSlot[] {
  if (!stepMinutes || stepMinutes <= 0) return [];
  const slots: TimeSlot[] = [];
  const endMs = nextDayStart(dayStart, timezone).getTime();
  let cursor = dayStart;
  let index = 0;
  while (cursor.getTime() < endMs) {
    const next = toZone(cursor, timezone).plus({ minutes: stepMinutes }).toJSDate();
    slots.push({
      index,
      minuteOfDay: index * stepMinutes,
      start: cursor,
      end: next,
    });
    cursor = next;
    index++;
  }
  return slots;
}

export type {
  CalendarEvent,
  CalendarRange,
  CalendarZone,
  AllDayBox,
  TimedSegment,
  DayLayout,
  TimeSlot,
};