/**
 * Unit tests for day segmentation: how events are split and clipped into
 * per-day segments across a visible range.
 */
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import type { CalendarEvent, CalendarRange, CalendarZone } from '../types';
import { buildDays, splitIntoDays } from './segments';

const ZONE: CalendarZone = 'America/Toronto';

function at(iso: string): Date {
  return DateTime.fromISO(iso, { zone: ZONE }).toJSDate();
}

function event(id: string, startIso: string, endIso: string): CalendarEvent {
  return {
    id,
    calendarId: 'cal',
    title: id,
    isAllDay: false,
    start: at(startIso),
    end: at(endIso),
  };
}

function rng(startIso: string, endIso: string): CalendarRange {
  return {
    start: at(`${startIso}T00:00:00`),
    end: DateTime.fromISO(`${endIso}T00:00:00`, { zone: ZONE }).plus({ days: 1 }).toJSDate(),
  };
}

const RANGE = rng('2024-08-18', '2024-08-20'); // 3 days

describe('buildDays', () => {
  it('produces one boundary per day plus the closing exclusive edge', () => {
    const { boundaries } = buildDays(RANGE, ZONE);
    // 3 days -> 4 boundaries
    expect(boundaries).toHaveLength(4);
    expect(boundaries[0]!.getTime()).toBe(at('2024-08-18T00:00:00').getTime());
    expect(boundaries[3]!.getTime()).toBe(at('2024-08-21T00:00:00').getTime());
  });

  it('handles a single-day range', () => {
    const { boundaries } = buildDays(rng('2024-08-18', '2024-08-18'), ZONE);
    expect(boundaries).toHaveLength(2);
  });
});

describe('splitIntoDays', () => {
  it('returns empty for no events', () => {
    expect(splitIntoDays([], RANGE, ZONE)).toEqual([]);
  });

  it('keeps a single-day event as one segment with isFirstDay/isLastDay', () => {
    const segs = splitIntoDays([event('a', '2024-08-18T09:00:00', '2024-08-18T10:00:00')], RANGE, ZONE);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ dayIndex: 0, isFirstDay: true, isLastDay: true });
  });

  it('splits an event crossing midnight into one segment per day', () => {
    const segs = splitIntoDays(
      [event('a', '2024-08-18T22:00:00', '2024-08-19T02:00:00')],
      RANGE,
      ZONE,
    );
    expect(segs).toHaveLength(2);
    const [d0, d1] = segs;
    expect(d0).toMatchObject({ dayIndex: 0, isFirstDay: true, isLastDay: false });
    expect(d0!.start.getTime()).toBe(at('2024-08-18T22:00:00').getTime());
    expect(d0!.end.getTime()).toBe(at('2024-08-19T00:00:00').getTime());
    expect(d1).toMatchObject({ dayIndex: 1, isFirstDay: false, isLastDay: true });
    expect(d1!.start.getTime()).toBe(at('2024-08-19T00:00:00').getTime());
    expect(d1!.end.getTime()).toBe(at('2024-08-19T02:00:00').getTime());
  });

  it('splits an event spanning multiple days into a segment per day', () => {
    const segs = splitIntoDays(
      [event('a', '2024-08-18T22:00:00', '2024-08-20T02:00:00')],
      RANGE,
      ZONE,
    );
    expect(segs.map((s) => s.dayIndex)).toEqual([0, 1, 2]);
    expect(segs[0]!.isFirstDay).toBe(true);
    expect(segs[0]!.isLastDay).toBe(false);
    expect(segs[2]!.isFirstDay).toBe(false);
    expect(segs[2]!.isLastDay).toBe(true);
  });

  it('clips an event that begins before the visible range', () => {
    const segs = splitIntoDays(
      [event('a', '2024-08-10T00:00:00', '2024-08-18T10:00:00')],
      RANGE,
      ZONE,
    );
    // only its presence on the first visible day counts
    expect(segs).toHaveLength(1);
    expect(segs[0]!.dayIndex).toBe(0);
    expect(segs[0]!.start.getTime()).toBe(at('2024-08-18T00:00:00').getTime());
    expect(segs[0]!.isFirstDay).toBe(false); // clipped, not true start
  });

  it('clips an event that ends after the visible range', () => {
    const segs = splitIntoDays(
      [event('a', '2024-08-20T10:00:00', '2024-09-01T00:00:00')],
      RANGE,
      ZONE,
    );
    expect(segs).toHaveLength(1);
    expect(segs[0]!.dayIndex).toBe(2);
    expect(segs[0]!.end.getTime()).toBe(at('2024-08-21T00:00:00').getTime());
    expect(segs[0]!.isLastDay).toBe(false);
  });

  it('an event spanning the entire range clips to it on both ends', () => {
    const segs = splitIntoDays(
      [event('a', '2024-08-05T00:00:00', '2024-09-05T00:00:00')],
      RANGE,
      ZONE,
    );
    expect(segs.map((s) => s.dayIndex)).toEqual([0, 1, 2]);
    expect(segs[0]!.start.getTime()).toBe(at('2024-08-18T00:00:00').getTime());
    expect(segs[2]!.end.getTime()).toBe(at('2024-08-21T00:00:00').getTime());
    expect(segs[0]!.isFirstDay).toBe(false);
    expect(segs[2]!.isLastDay).toBe(false);
  });

  it('drops events entirely outside the range', () => {
    const segs = splitIntoDays(
      [event('a', '2024-09-01T09:00:00', '2024-09-01T10:00:00')],
      RANGE,
      ZONE,
    );
    expect(segs).toHaveLength(0);
  });

  it('sorts segments deterministically by day then event id', () => {
    const segs = splitIntoDays(
      [event('b', '2024-08-19T01:00:00', '2024-08-19T02:00:00'), event('a', '2024-08-18T09:00:00', '2024-08-18T10:00:00')],
      RANGE,
      ZONE,
    );
    expect(segs.map((s) => s.event.id)).toEqual(['a', 'b']);
  });
});