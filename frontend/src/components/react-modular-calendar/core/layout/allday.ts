/**
 * All-day layout.
 *
 * All-day events are rendered in a horizontal strip above the timed grid. Each
 * event is modelled as a single interval over the discrete day axis — from the
 * first to the last visible day it covers — so a multi-day all-day event keeps
 * one consistent lane row across its whole span. Overlapping all-day events are
 * stacked into lanes; each day reports how many lanes it needs.
 */
import type { CalendarEvent } from '../../types';
import { assignLanes } from './lanes';

/** Position of a single all-day event across the strip. */
export interface AllDayBox {
  event: CalendarEvent;
  /** 0-based first visible day column it occupies. */
  colStart: number;
  /** Number of consecutive day columns it occupies. */
  colSpan: number;
  /** Lane row within the strip. */
  lane: number;
  /** Lane count of its component (group's max simultaneous overlap). */
  totalLanes: number;
}

export interface AllDayLayoutResult {
  boxes: AllDayBox[];
  /** Per-day lane tallies (rows each day's strip needs). */
  dayRows: number[];
}

/**
 * Lay out all all-day events over a range once.
 *
 * @param daySegments grouped all-day segments (one per event-day); `dayIndex`
 *   is the day's offset from the range start.
 */
export function layoutAllDay(
  daySegments: Array<{ event: CalendarEvent; dayIndex: number }>,
): AllDayLayoutResult {
  // Aggregate segments into per-event day coverage.
  const byEvent = new Map<string, { event: CalendarEvent; jours: Set<number> }>();
  for (const s of daySegments) {
    let row = byEvent.get(s.event.id);
    if (!row) {
      row = { event: s.event, jours: new Set() };
      byEvent.set(s.event.id, row);
    }
    row.jours.add(s.dayIndex);
  }

  // Interval per event on the discrete day axis: [minDay, maxDay+1).
  const intervals = Array.from(byEvent.values()).map((e) => {
    let min = Infinity;
    let max = -Infinity;
    for (const d of e.jours) {
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return {
      startMs: min,
      endMs: max + 1,
      id: e.event.id,
      event: e.event,
      minDay: min,
      maxDay: max,
    };
  });

  const assignments = assignLanes(intervals);
  const boxes: AllDayBox[] = assignments.map((a) => {
    const iv = intervals[a.index]!;
    return {
      event: iv.event,
      colStart: iv.minDay,
      colSpan: iv.maxDay - iv.minDay + 1,
      lane: a.lane,
      totalLanes: a.totalLanes,
    };
  });

  // Per-day rows = number of all-day events actually covering that day. Every
  // all-day event covering the same day overlaps the others (they each span the
  // full day), so they occupy distinct lanes and this count equals the row
  // tally the day's strip needs — not the whole component's peak overlap.
  const dayRows: number[] = [];
  for (const b of boxes) {
    for (let d = b.colStart; d < b.colStart + b.colSpan; d++) {
      dayRows[d] = (dayRows[d] ?? 0) + 1;
    }
  }

  return { boxes, dayRows };
}