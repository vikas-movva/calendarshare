/**
 * Unit tests for timed-event layout within a single day.
 *
 * Verifies the positional boxes the engine hands to the view layer: fractional
 * `left`/`width`/`top`/`height`, lane assignment, and that multi-day/multi-segment
 * handling respects day clipping (each segment positions within its own day).
 */
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import type { CalendarEvent, CalendarZone } from '../../types';
import { layoutDayTimed, type TimedSegment } from './timed';

const ZONE: CalendarZone = 'UTC';

/** Build a wall-clock Date for a given `HH:MM` on a base day (UTC). */
function atTime(hour: number, minute: number): Date {
  return DateTime.fromObject(
    { year: 2024, month: 1, day: 10, hour, minute },
    { zone: ZONE },
  ).toJSDate();
}

/** Day spine for 2024-01-10 in UTC. */
const DAY_START = atTime(0, 0);
const DAY_END = DateTime.fromObject(
  { year: 2024, month: 1, day: 11 },
  { zone: ZONE },
).toJSDate();
const DAY_MS = DAY_END.getTime() - DAY_START.getTime();

function ev(id: string, hour: number, min: number, endHour: number, endMin: number): CalendarEvent {
  return {
    id,
    calendarId: 'cal',
    title: id,
    isAllDay: false,
    start: atTime(hour, min),
    end: atTime(endHour, endMin),
  };
}

/** Wrap events as day-clipped segments (assumed to live on day 0). */
function segs(events: CalendarEvent[]): TimedSegment[] {
  return events.map((e) => ({
    event: e,
    dayIndex: 0,
    start: e.start,
    end: e.end,
    isFirstDay: true,
    isLastDay: true,
  }));
}

/** Read the nth box from a layout with a non-null assertion for tests. */
function pick<T>(arr: T[], i: number): T {
  return arr[i]!;
}

describe('layoutDayTimed', () => {
  it('returns empty for no segments', () => {
    expect(layoutDayTimed([], DAY_START.getTime(), DAY_END.getTime())).toEqual([]);
  });

  it('positions a single event across the full column width', () => {
    const b = pick(layoutDayTimed(segs([ev('a', 9, 0, 11, 0)]), DAY_START.getTime(), DAY_END.getTime()), 0);
    expect(b.left).toBe(0);
    expect(b.width).toBe(1);
    expect(b.top).toBeCloseTo(9 / 24, 5);
    expect(b.height).toBeCloseTo(2 / 24, 5);
    expect(b.totalLanes).toBe(1);
  });

  it('places two non-overlapping events at their own vertical bands', () => {
    const boxes = layoutDayTimed(
      segs([ev('a', 9, 0, 10, 0), ev('b', 14, 0, 16, 0)]),
      DAY_START.getTime(),
      DAY_END.getTime(),
    );
    const a = pick(boxes, 0);
    const b = pick(boxes, 1);
    expect(a.top).toBeCloseTo(9 / 24, 5);
    expect(b.top).toBeCloseTo(14 / 24, 5);
    expect(a.width).toBe(1);
    expect(b.width).toBe(1);
  });

  it('narrows two overlapping events into two lanes of half width each', () => {
    const boxes = layoutDayTimed(
      segs([ev('a', 9, 0, 11, 0), ev('b', 10, 0, 12, 0)]),
      DAY_START.getTime(),
      DAY_END.getTime(),
    );
    const a = pick(boxes, 0);
    const b = pick(boxes, 1);
    expect(a.width).toBeCloseTo(0.5, 5);
    expect(b.width).toBeCloseTo(0.5, 5);
    expect(a.left).toBe(0);
    expect(b.left).toBeCloseTo(0.5, 5);
    expect(new Set([a.lane, b.lane]).size).toBe(2);
  });

  it('three overlapping events produce third-width columns in lanes 0,1,2', () => {
    const boxes = layoutDayTimed(
      segs([ev('a', 9, 0, 11, 0), ev('b', 10, 0, 11, 30), ev('c', 10, 30, 12, 0)]),
      DAY_START.getTime(),
      DAY_END.getTime(),
    );
    const a = pick(boxes, 0);
    const b = pick(boxes, 1);
    const cc = pick(boxes, 2);
    const widths = [a.width, b.width, cc.width];
    widths.forEach((w) => expect(w).toBeCloseTo(1 / 3, 5));
    const lefts = [a.left, b.left, cc.left];
    expect(new Set(lefts.map((x) => Math.round(x * 1000))).size).toBe(3);
    expect([a.totalLanes, b.totalLanes, cc.totalLanes]).toEqual([3, 3, 3]);
  });

  it('nested events use only two lanes', () => {
    const boxes = layoutDayTimed(
      // A encloses both B and C, but B and C do not overlap each other,
      // so the maximum simultaneous overlap is 2, never 3.
      segs([ev('a', 8, 0, 18, 0), ev('b', 9, 0, 11, 0), ev('c', 14, 0, 16, 0)]),
      DAY_START.getTime(),
      DAY_END.getTime(),
    );
    const a = pick(boxes, 0);
    const b = pick(boxes, 1);
    const c = pick(boxes, 2);
    expect(a.totalLanes).toBe(2);
    expect(b.totalLanes).toBe(2);
    expect(c.totalLanes).toBe(2);
    expect(new Set([a.lane, b.lane, c.lane]).size).toBe(2);
  });

  it('clips a zero-length event to a minimal visible height', () => {
    // end === start
    const z = { ...ev('z', 10, 0, 10, 0), end: atTime(10, 0) };
    const box = pick(layoutDayTimed(segs([z]), DAY_START.getTime(), DAY_END.getTime()), 0);
    expect(box.height).toBeGreaterThan(0);
  });

  it('a segment crossing into the next day is day-clipped to 22:00-24:00', () => {
    // Engine segmentation clips the 22:00->02:00 event to [22:00, 24:00) on
    // this day before handing it to the layout; the segment is already clipped.
    const late = ev('late', 22, 0, 23, 0);
    const segment: TimedSegment = {
      event: late,
      dayIndex: 0,
      start: atTime(22, 0),
      end: DAY_END, // day-clipped: local midnight of the next day
      isFirstDay: true,
      isLastDay: false,
    };
    const box = pick(layoutDayTimed([segment], DAY_START.getTime(), DAY_END.getTime()), 0);
    expect(box.top).toBeCloseTo(22 / 24, 5);
    expect(box.height).toBeCloseTo(2 / 24, 5); // 22:00 -> 24:00
    expect(box.isFirstDay).toBe(true);
    expect(box.isLastDay).toBe(false);
  });

  it('computes height relative to the day span, not the event duration', () => {
    const a = pick(layoutDayTimed(segs([ev('a', 0, 0, 12, 0)]), DAY_START.getTime(), DAY_END.getTime()), 0);
    expect(a.top).toBe(0);
    expect(a.height).toBeCloseTo(0.5, 5);
    void DAY_MS;
  });
});