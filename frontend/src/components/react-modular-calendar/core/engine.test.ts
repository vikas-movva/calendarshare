/**
 * End-to-end engine tests: `layoutEvents` produces the per-day layout across
 * ranges from 1 to 365 days, mixes multiple calendar sources, handles all-day
 * + timed events together, and stays sane for large input sets.
 */
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import type { CalendarEvent, CalendarRange, CalendarZone } from '../types';
import { layoutEvents } from './engine';

const ZONE: CalendarZone = 'America/Toronto';

function at(iso: string): Date {
  return DateTime.fromISO(iso, { zone: ZONE }).toJSDate();
}

function timed(id: string, startIso: string, endIso: string): CalendarEvent {
  return { id, calendarId: 'cal', title: id, isAllDay: false, start: at(startIso), end: at(endIso) };
}

function allDay(id: string, startIso: string, endIso: string): CalendarEvent {
  return {
    id,
    calendarId: 'cal',
    title: id,
    isAllDay: true,
    start: DateTime.fromISO(startIso, { zone: ZONE }).toJSDate(),
    end: DateTime.fromISO(endIso, { zone: ZONE }).plus({ days: 1 }).toJSDate(),
  };
}

function range(startIso: string, endIso: string): CalendarRange {
  return {
    start: at(`${startIso}T00:00:00`),
    end: DateTime.fromISO(`${endIso}T00:00:00`, { zone: ZONE }).plus({ days: 1 }).toJSDate(),
  };
}

describe('layoutEvents — ranges', () => {
  it('builds days for a 1-day range', () => {
    const layout = layoutEvents([], range('2024-08-18', '2024-08-18'), ZONE);
    expect(layout.days).toHaveLength(1);
    expect(layout.days[0]!.key).toBe('2024-08-18');
    expect(layout.days[0]!.slots).toHaveLength(24);
  });

  it('builds days for a week-long range', () => {
    const layout = layoutEvents([], range('2024-08-18', '2024-08-24'), ZONE);
    expect(layout.days).toHaveLength(7);
    expect(layout.days.map((d) => d.key)).toContain('2024-08-24');
  });

  it('builds days for a month-long range', () => {
    const layout = layoutEvents([], range('2024-08-01', '2024-08-31'), ZONE);
    expect(layout.days).toHaveLength(31);
  });

  it('builds days for a full 365-day range (non-leap year)', () => {
    const layout = layoutEvents([], range('2023-01-01', '2023-12-31'), ZONE);
    expect(layout.days).toHaveLength(365);
    expect(layout.days[0]!.key).toBe('2023-01-01');
    expect(layout.days[364]!.key).toBe('2023-12-31');
  });

  it('builds 366 days for a leap year', () => {
    const layout = layoutEvents([], range('2024-01-01', '2024-12-31'), ZONE);
    expect(layout.days).toHaveLength(366);
    expect(layout.days[365]!.key).toBe('2024-12-31');
  });

  it('honours a slotMinutes override on the timed grid', () => {
    const layout = layoutEvents([], range('2024-08-18', '2024-08-18'), ZONE, {
      slotMinutes: 30,
    });
    expect(layout.days[0]!.slots).toHaveLength(48);
  });

  it('disables the grid when slotMinutes is 0', () => {
    const layout = layoutEvents([], range('2024-08-18', '2024-08-18'), ZONE, {
      slotMinutes: 0,
    });
    expect(layout.days[0]!.slots).toHaveLength(0);
  });
});

describe('layoutEvents — timed events end to end', () => {
  it('assigns timed-event boxes to the correct day', () => {
    const ev = timed('a', '2024-08-18T09:00:00', '2024-08-18T11:00:00');
    const layout = layoutEvents([ev], range('2024-08-18', '2024-08-18'), ZONE);
    expect(layout.days[0]!.timed).toHaveLength(1);
    const box = layout.days[0]!.timed[0]!;
    expect(box.event.id).toBe('a');
    expect(box.left).toBe(0);
    expect(box.width).toBe(1);
  });

  it('places each day-specific segment in its own day', () => {
    const ev = timed('a', '2024-08-18T22:00:00', '2024-08-20T02:00:00');
    const layout = layoutEvents([ev], range('2024-08-18', '2024-08-20'), ZONE);
    expect(layout.days[0]!.timed).toHaveLength(1);
    expect(layout.days[1]!.timed).toHaveLength(1);
    expect(layout.days[2]!.timed).toHaveLength(1);
    expect(layout.segmentsTotal).toBe(3);
  });

  it('combines events from multiple source calendars in one view', () => {
    const a = { ...timed('a', '2024-08-18T09:00:00', '2024-08-18T10:00:00'), calendarId: 'calA' };
    const b = { ...timed('b', '2024-08-18T10:30:00', '2024-08-18T11:30:00'), calendarId: 'calB' };
    const layout = layoutEvents([a, b], range('2024-08-18', '2024-08-18'), ZONE);
    expect(layout.days[0]!.timed).toHaveLength(2);
    const ids = layout.days[0]!.timed.map((x) => x.event.calendarId).sort();
    expect(ids).toEqual(['calA', 'calB']);
  });

  it('matches each calendar source to every one of its overlapping events', () => {
    const source = { id: 'calA', name: 'A' };
    const a = { ...timed('a', '2024-08-18T09:00:00', '2024-08-18T10:00:00'), calendarId: 'calA', source };
    const b = { ...timed('b', '2024-08-18T09:30:00', '2024-08-18T10:30:00'), calendarId: 'calA', source };
    const layout = layoutEvents([a, b], range('2024-08-18', '2024-08-18'), ZONE);
    const boxes = layout.days[0]!.timed;
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box.event.source?.name).toBe('A');
    }
  });
});

describe('layoutEvents — all-day end to end', () => {
  it('populates all-day boxes across the strip', () => {
    const e = allDay('ad', '2024-08-18', '2024-08-20');
    const layout = layoutEvents([e], range('2024-08-18', '2024-08-20'), ZONE);
    expect(layout.allDay).toHaveLength(1);
    expect(layout.allDay[0]).toMatchObject({ colStart: 0, colSpan: 3 });
  });

  it('can skip all-day computation when requested', () => {
    const e = allDay('ad', '2024-08-18', '2024-08-20');
    const layout = layoutEvents([e], range('2024-08-18', '2024-08-20'), ZONE, {
      includeAllDay: false,
    });
    expect(layout.allDay).toHaveLength(0);
    expect(layout.days[0]!.allDay).toHaveLength(0);
  });

  it('keeps timed and all-day events separate', () => {
    const t = timed('t', '2024-08-18T10:00:00', '2024-08-18T12:00:00');
    const a = allDay('a', '2024-08-18', '2024-08-18');
    const layout = layoutEvents([t, a], range('2024-08-18', '2024-08-18'), ZONE);
    expect(layout.days[0]!.timed).toHaveLength(1);
    expect(layout.days[0]!.allDay).toHaveLength(1);
  });
});

describe('layoutEvents — timezone awareness', () => {
  it('renders a late-evening Toronto event on the correct day in its zone', () => {
    const e = timed('late', '2024-08-18T23:30:00', '2024-08-19T00:30:00');
    const layout = layoutEvents([e], range('2024-08-18', '2024-08-19'), ZONE);
    // 23:30 Toronto belongs to the 18th; segment splits across midnight.
    expect(layout.days[0]!.timed).toHaveLength(1);
    expect(layout.days[1]!.timed).toHaveLength(1);
  });

  it('shifts the same instant to a different day in another zone', () => {
    // Same absolute instant, but viewed in UTC vs Toronto (UTC-4 summer).
    const instant = DateTime.fromISO('2024-08-18T23:30:00', { zone: ZONE }).toJSDate();
    const eastLayout = layoutEvents(
      [{ id: 'e', calendarId: 'c', title: 'e', isAllDay: false, start: instant, end: DateTime.fromISO('2024-08-19T00:30:00', { zone: ZONE }).toJSDate() }],
      range('2024-08-18', '2024-08-19'),
      ZONE,
    );
    const utcLayout = layoutEvents(
      [{ id: 'e', calendarId: 'c', title: 'e', isAllDay: false, start: instant, end: DateTime.fromISO('2024-08-19T00:30:00', { zone: ZONE }).toJSDate() }],
      range('2024-08-18', '2024-08-19'),
      'UTC',
    );
    // In UTC the start instant is 03:30 on the 19th, so day 0 has no segment.
    expect(eastLayout.days[0]!.timed.length).toBeGreaterThan(0);
    expect(utcLayout.days[0]!.timed).toHaveLength(0);
  });
});

describe('layoutEvents — edge cases and scale', () => {
  it('handles an empty event list', () => {
    const layout = layoutEvents([], range('2024-08-18', '2024-08-20'), ZONE);
    expect(layout.days).toHaveLength(3);
    expect(layout.allDay).toHaveLength(0);
    expect(layout.segmentsTotal).toBe(0);
  });

  it('handles an empty (single-point) range', () => {
    const layout = layoutEvents([], range('2024-08-18', '2024-08-18'), ZONE);
    expect(layout.days).toHaveLength(1);
  });

  it('still returns a deterministic day list for an inverted range', () => {
    // end before start: buildDays's while-loop yields at least the start day
    const layout = layoutEvents([], range('2024-08-20', '2024-08-18'), ZONE);
    expect(Array.isArray(layout.days)).toBe(true);
  });

  it('lays out a very large event set quickly enough to be deterministic', () => {
    const events: CalendarEvent[] = Array.from({ length: 2000 }, (_x, i) => {
      const day = (i % 30) + 1;
      return timed(`e${i}`, `2024-08-${String(day).padStart(2, '0')}T09:00:00`, `2024-08-${String(day).padStart(2, '0')}T10:00:00`);
    });
    const layout = layoutEvents(events, range('2024-08-01', '2024-08-31'), ZONE);
    const total = layout.days.reduce((sum, d) => sum + d.timed.length, 0);
    expect(total).toBe(2000);
    expect(layout.segmentsTotal).toBe(2000);
  });
});