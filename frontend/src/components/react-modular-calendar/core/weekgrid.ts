/**
 * Display-grid planning.
 *
 * Turns the active `[startDate, endDate]` range into what the calendar renders.
 * The number of week rows is derived from the range length:
 *   - 1 day  → a single full-width day (kind `'single-day'`);
 *   - 2..7   → the 1 week whose rows contain the range;
 *   - 8..14  → 2 weeks; and so on, with a full `'months'`-span producing one
 *     week per calendar week of the range.
 * Grayed filler days (leading/trailing of adjacent weeks, and any in-range
 * weeks' days outside the active range) are marked `inRange = false`.
 * Also provides the month-shift navigation primitives and per-week splitting of
 * the all-day layout.
 *
 * All math stays in Luxon in the calendar zone so weeks and months are exact
 * regardless of DST.
 */
import type { CalendarRange, CalendarZone } from '../types';
import { dateKey, dayStart, nextDayStart, toZone } from './dates';
import { assignLanes } from './layout/lanes';
import type { AllDayBox } from './layout/allday';

/** Week start: 0 = Sunday … 6 = Saturday. */
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** One day cell: either the single-day view or an entry in a week row. */
export interface WeekGridDay {
  /** Zone-local midnight start of the day. */
  start: Date;
  /** Exclusive end (midnight of the next day). */
  end: Date;
  /** ISO date key yyyy-MM-dd. */
  key: string;
  /** Day of month (1–31) for the cell label. */
  date: number;
  /** yyyy-MM month grouping key. */
  monthKey: string;
  /** True when this day is part of the active range (not greyed filler). */
  inRange: boolean;
}

/** How the calendar displays the active range. */
export type DisplayGridKind = 'single-day' | 'weeks';

export interface DisplayGrid {
  kind: DisplayGridKind;
  /** First active day (zone-local midnight). */
  activeStart: Date;
  /** Last active day (zone-local midnight). */
  activeEnd: Date;
  /** Number of active calendar days (≥ 1). */
  daysCount: number;
  /** The padded range `[start, end)` covering everything that is laid out. */
  range: CalendarRange;
  /** Present when `kind === 'single-day'`: the one full-width day. */
  day?: WeekGridDay;
  /** Present when `kind === 'weeks'`: consecutive week rows (each length 7). */
  weeks?: WeekGridDay[][];
  /** Present when `kind === 'weeks'`: number of week rows. */
  weekCount?: number;
  /** Months spanned by the active range, in order (for a header label). */
  monthKeys: string[];
}

/** Whole calendar days from `start` to `end` (inclusive) in the zone. */
export function calendarDaysBetween(
  start: Date,
  end: Date,
  zone: CalendarZone,
): number {
  const s = toZone(dayStart(start, zone), zone);
  const e = toZone(dayStart(end, zone), zone);
  if (e < s) return 0;
  const days = e.diff(s, 'days').days; // .9997/1/1.0003 across DST → round
  return Math.round(days) + 1;
}

/**
 * Build the display grid for an active `[startDate, endDate]` range.
 *
 * - `daysCount === 1` → `kind: 'single-day'` (one full-width day cell).
 * - otherwise → `kind: 'weeks'` with the consecutive week rows that contain
 *   the range (greyed filler fills out the first/last week). A long range
 *   (e.g. several months) yields one week per calendar week; the caller decides
 *   whether to scroll it.
 *
 * A cell is `inRange` when it falls within the active range. The padded
 * `range` (full weeks) is fed to the layout engine so greyed cells still render
 * any events that fall on them.
 */
export function buildDisplayGrid(
  startDate: Date,
  endDate: Date,
  zone: CalendarZone,
  weekStart: WeekStartDay = 0,
): DisplayGrid {
  const s = toZone(dayStart(startDate, zone), zone).startOf('day');
  const e0 = toZone(dayStart(endDate, zone), zone).startOf('day');
  const e = e0 < s ? s : e0;

  const daysCount = calendarDaysBetween(s.toJSDate(), e.toJSDate(), zone);
  const sMs = s.toMillis();
  const eMs = e.toMillis();

  const makeCell = (cursor: typeof s): WeekGridDay => {
    const start = cursor.toJSDate();
    return {
      start,
      end: nextDayStart(start, zone),
      key: dateKey(start, zone),
      date: cursor.day,
      monthKey: cursor.toFormat('yyyy-MM'),
      inRange: cursor.toMillis() >= sMs && cursor.toMillis() <= eMs,
    };
  };

  const monthKeys = Array.from(
    new Set(
      Array.from({ length: daysCount }, (_, i) => s.plus({ days: i }).toFormat('yyyy-MM')),
    ),
  );

  // Single active day → one full-width day.
  if (daysCount === 1) {
    const day = makeCell(s);
    return {
      kind: 'single-day',
      activeStart: s.toJSDate(),
      activeEnd: e.toJSDate(),
      daysCount,
      monthKeys,
      day,
      range: { start: day.start, end: day.end },
    };
  }

  // Multi-day → consecutive full weeks containing the range.
  const leading = (s.weekday % 7 - weekStart + 7) % 7;
  const trailing = 6 - ((e.weekday % 7 - weekStart + 7) % 7);
  const firstCell = s.minus({ days: leading });
  const endCursor = e.plus({ days: trailing + 1 }); // exclusive

  const weeks: WeekGridDay[][] = [];
  let row: WeekGridDay[] = [];
  let cursor = firstCell;
  while (cursor < endCursor) {
    row.push(makeCell(cursor));
    if (row.length === 7) {
      weeks.push(row);
      row = [];
    }
    cursor = cursor.plus({ days: 1 });
  }
  if (row.length > 0) weeks.push(row); // defensive; leading+trailing keep 7-aligned

  const firstDayStart = weeks[0]![0]!.start;
  const lastDayStart = weeks[weeks.length - 1]![weeks[weeks.length - 1]!.length - 1]!.start;

  return {
    kind: 'weeks',
    activeStart: s.toJSDate(),
    activeEnd: e.toJSDate(),
    daysCount,
    monthKeys,
    weeks,
    weekCount: weeks.length,
    range: { start: firstDayStart, end: nextDayStart(lastDayStart, zone) },
  };
}

/** True if the inclusive range touches more than one calendar month. */
export function isMultiMonth(
  startDate: Date,
  endDate: Date,
  zone: CalendarZone,
): boolean {
  return (
    toZone(dayStart(startDate, zone), zone).toFormat('yyyy-MM') !==
    toZone(dayStart(endDate, zone), zone).toFormat('yyyy-MM')
  );
}

/** Zone-local midnight of the 1st day of the month containing `date`. */
export function firstOfMonth(date: Date, zone: CalendarZone): Date {
  return toZone(dayStart(date, zone), zone).startOf('month').toJSDate();
}

/**
 * The 1st day of the month offset `n` months from the month containing a date
 * whose day is already the 1st. `n` may be positive (next) or negative (prev).
 */
export function addMonths(firstOfMonthDate: Date, n: number, zone: CalendarZone): Date {
  return toZone(dayStart(firstOfMonthDate, zone), zone)
    .plus({ months: n })
    .startOf('month')
    .toJSDate();
}

/** Advance/pull back `date` by `n` whole calendar days in the zone. */
export function addDays(date: Date, n: number, zone: CalendarZone): Date {
  return toZone(dayStart(date, zone), zone).plus({ days: n }).toJSDate();
}

/**
 * Split the global all-day layout into a single week's boxes, repositioned to
 * that week's 0–6 local columns and re-laned so the week's strip has no gaps.
 * A multi-week all-day event yields one box per week it touches.
 */
export function allDayForWeek(
  allBoxes: AllDayBox[],
  weekIndex: number,
  daysPerWeek = 7,
): AllDayBox[] {
  const weekStart = weekIndex * daysPerWeek;
  const weekEnd = weekStart + daysPerWeek - 1;

  const candidates: AllDayBox[] = [];
  const intervals: Array<{ startMs: number; endMs: number; id: string }> = [];

  for (const b of allBoxes) {
    const boxEndGlobal = b.colStart + b.colSpan - 1;
    if (boxEndGlobal < weekStart || b.colStart > weekEnd) continue;
    const localStart = Math.max(b.colStart, weekStart) - weekStart;
    const localEnd = Math.min(boxEndGlobal, weekEnd) - weekStart;
    candidates.push({ ...b, colStart: localStart, colSpan: localEnd - localStart + 1 });
    intervals.push({ startMs: localStart, endMs: localStart + (localEnd - localStart) + 1, id: `${b.event.id}-w${weekIndex}` });
  }

  const assignments = assignLanes(intervals);
  const laneByInput = new Map<number, { lane: number; totalLanes: number }>(
    assignments.map((a) => [a.index, { lane: a.lane, totalLanes: a.totalLanes }]),
  );

  return candidates.map((b, i) => {
    const ll = laneByInput.get(i)!;
    return { ...b, lane: ll.lane, totalLanes: ll.totalLanes };
  });
}