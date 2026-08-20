/**
 * Unit tests for the week-oriented grid planner: padding into full 7-day weeks,
 * greyed filler flags, month-boundary navigation primitives, and per-week
 * splitting of the all-day layout.
 */
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import type { AllDayBox } from './layout/allday';
import type { CalendarEvent } from '../types';
import {
  addDays,
  addMonths,
  buildDisplayGrid,
  calendarDaysBetween,
  firstOfMonth,
  isMultiMonth,
  allDayForWeek,
} from './weekgrid';

const ZONE = 'America/Toronto';

function at(iso: string): Date {
  return DateTime.fromISO(iso, { zone: ZONE }).toJSDate();
}

function day(iso: string): Date {
  return DateTime.fromISO(`${iso}T00:00:00`, { zone: ZONE }).toJSDate();
}

function event(id: string): CalendarEvent {
  return { id, calendarId: 'cal', title: id, isAllDay: true, start: at('2024-08-19T00:00:00'), end: at('2024-08-19T00:00:00') };
}

function box(id: string, colStart: number, colSpan: number, lane = 0, totalLanes = 1): AllDayBox {
  return { event: event(id), colStart, colSpan, lane, totalLanes };
}

describe('buildDisplayGrid', () => {
  it('a single active day is kind single-day with one full-width cell', () => {
    const g = buildDisplayGrid(day('2024-08-19'), day('2024-08-19'), ZONE, 0);
    expect(g.kind).toBe('single-day');
    expect(g.daysCount).toBe(1);
    expect(g.day!.key).toBe('2024-08-19');
    expect(g.day!.inRange).toBe(true);
    expect(g.monthKeys).toEqual(['2024-08']);
  });

  it('a 3-day range spans one week containing it (Sun start)', () => {
    // 2024-08-19 (Mon) .. 2024-08-21 (Wed): the Sun 18 .. Sat 24 week.
    const g = buildDisplayGrid(day('2024-08-19'), day('2024-08-21'), ZONE, 0);
    expect(g.kind).toBe('weeks');
    expect(g.weekCount).toBe(1);
    const week = g.weeks![0]!;
    expect(week.map((d) => d.key)).toEqual([
      '2024-08-18', '2024-08-19', '2024-08-20', '2024-08-21',
      '2024-08-22', '2024-08-23', '2024-08-24',
    ]);
    // Mon/Tue before the Wed start and Sat after are greyed; Wed..Fri active.
    expect(week[0]!.inRange).toBe(false);
    expect(week[1]!.inRange).toBe(true); // Mon 19
    expect(week[2]!.inRange).toBe(true); // Tue 20
    expect(week[3]!.inRange).toBe(true); // Wed 21
    expect(week[4]!.inRange).toBe(false);
    expect(week[6]!.inRange).toBe(false);
  });

  it('a 7-day Sunday..Saturday range is exactly one week (Sun-start)', () => {
    const g = buildDisplayGrid(day('2024-08-18'), day('2024-08-24'), ZONE, 0);
    expect(g.kind).toBe('weeks');
    expect(g.weekCount).toBe(1);
    expect(g.weeks![0]![0]!.key).toBe('2024-08-18');
    expect(g.weeks![0]![6]!.key).toBe('2024-08-24');
  });

  it('an unaligned 7-day Mon..Sun range spans two Sun-start weeks', () => {
    // Mon 19 .. Sun 25 crosses the Sunday boundary, so two rows are rendered
    // and both active days still show (greyed fill around them).
    const g = buildDisplayGrid(day('2024-08-19'), day('2024-08-25'), ZONE, 0);
    expect(g.kind).toBe('weeks');
    expect(g.weekCount).toBe(2);
    expect(g.weeks!.flat().filter((d) => d.inRange).length).toBe(7);
  });

  it('an 8–14 day range spans two weeks with a Monday start', () => {
    // 2024-08-19..2024-08-30 (12 days). Monday-start week 1 = Aug 19..25.
    const g = buildDisplayGrid(day('2024-08-19'), day('2024-08-30'), ZONE, 1);
    expect(g.kind).toBe('weeks');
    expect(g.weekCount).toBe(2);
    expect(g.weeks![0]![0]!.key).toBe('2024-08-19'); // Monday
  });

  it('a full month is one month of weeks', () => {
    // August 2024: Aug 1..31 = 5 weeks Sunday start.
    const g = buildDisplayGrid(day('2024-08-01'), day('2024-08-31'), ZONE, 0);
    expect(g.kind).toBe('weeks');
    expect(g.daysCount).toBe(31);
    expect(g.weekCount).toBe(5);
    const active = g.weeks!.flat().filter((d) => d.inRange);
    expect(active.length).toBe(31);
  });

  it('a multi-month range yields one week per calendar week and spans 3 months', () => {
    // Aug 1 .. Oct 31 2024.
    const g = buildDisplayGrid(day('2024-08-01'), day('2024-10-31'), ZONE, 0);
    expect(g.kind).toBe('weeks');
    expect(g.daysCount).toBe(92);
    expect(g.weekCount).toBeGreaterThan(6); // long -> scrollable
    expect(g.monthKeys).toEqual(['2024-08', '2024-09', '2024-10']);
    expect(g.weeks!.flat().filter((d) => d.inRange).length).toBe(92);
  });
});

describe('calendarDaysBetween', () => {
  it('counts inclusive days', () => {
    expect(calendarDaysBetween(day('2024-08-19'), day('2024-08-19'), ZONE)).toBe(1);
    expect(calendarDaysBetween(day('2024-08-19'), day('2024-08-20'), ZONE)).toBe(2);
  });

  it('counts across a DST boundary as whole calendar days', () => {
    expect(calendarDaysBetween(day('2024-03-09'), day('2024-03-11'), ZONE)).toBe(3);
    expect(calendarDaysBetween(day('2024-11-02'), day('2024-11-04'), ZONE)).toBe(3);
  });
});

describe('month navigation primitives', () => {
  it('firstOfMonth returns midnight of the 1st', () => {
    expect(firstOfMonth(day('2024-08-19'), ZONE).getTime()).toBe(day('2024-08-01').getTime());
  });

  it('addMonths shifts the 1st by whole months', () => {
    const sep1 = addMonths(day('2024-08-01'), 1, ZONE);
    expect(sep1.getTime()).toBe(day('2024-09-01').getTime());
    const jul1 = addMonths(day('2024-08-01'), -1, ZONE);
    expect(jul1.getTime()).toBe(day('2024-07-01').getTime());
    // across a year boundary
    const jan1 = addMonths(day('2024-12-01'), 1, ZONE);
    expect(jan1.getTime()).toBe(day('2025-01-01').getTime());
  });

  it('addDays shifts by whole calendar days', () => {
    expect(addDays(day('2024-08-01'), 30, ZONE).getTime()).toBe(day('2024-08-31').getTime());
    expect(addDays(day('2024-08-01'), -1, ZONE).getTime()).toBe(day('2024-07-31').getTime());
  });

  it('isMultiMonth detects ranges spanning more than one month', () => {
    expect(isMultiMonth(day('2024-08-01'), day('2024-08-31'), ZONE)).toBe(false);
    expect(isMultiMonth(day('2024-08-19'), day('2024-09-18'), ZONE)).toBe(true);
  });
});

describe('allDayForWeek', () => {
  it('passes a single-week box through with local columns', () => {
    const boxes = allDayForWeek([box('a', 0, 3)], 0, 7);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ colStart: 0, colSpan: 3 });
  });

  it('clips a multi-week box to each week it touches', () => {
    // A 2024-08-18..2024-08-31 all-day event = global cols 0..13 (span 14).
    const boxes = allDayForWeek([box('a', 0, 14)], 0, 7);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ colStart: 0, colSpan: 7 });
    const week2 = allDayForWeek([box('a', 0, 14)], 1, 7);
    expect(week2).toHaveLength(1);
    expect(week2[0]).toMatchObject({ colStart: 0, colSpan: 7 });
    const week3 = allDayForWeek([box('a', 0, 14)], 2, 7);
    expect(week3).toHaveLength(0); // only two full weeks covered
  });

  it('positions a box that starts mid-week', () => {
    const boxes = allDayForWeek([box('a', 4, 3)], 0, 7); // global cols 4..6
    expect(boxes[0]).toMatchObject({ colStart: 4, colSpan: 3 });
  });

  it('re-lanes overlapping boxes within a week with tight lane count', () => {
    // Two boxes covering the same week: global A cols 0..6, B cols 0..6.
    const boxes = allDayForWeek([box('a', 0, 7, 0, 1), box('b', 0, 7, 0, 1)], 0, 7);
    expect(boxes).toHaveLength(2);
    expect(new Set(boxes.map((b) => b.lane)).size).toBe(2);
    expect(boxes.every((b) => b.totalLanes === 2)).toBe(true);
  });

  it('skips weeks a box does not touch', () => {
    const boxes = allDayForWeek([box('a', 7, 7)], 0, 7); // global cols 7..13 -> week 1 only
    expect(boxes).toHaveLength(0);
  });
});