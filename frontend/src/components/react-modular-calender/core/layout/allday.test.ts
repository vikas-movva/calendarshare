/**
 * Unit tests for all-day event layout.
 *
 * All-day events are laid out on a discrete day axis, keeping one consistent
 * lane row across a multi-day span. `dayRows` reports each day's row tally.
 */
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import type { CalendarEvent, CalendarZone } from '../../types';
import { layoutAllDay } from './allday';

const ZONE: CalendarZone = 'America/Toronto';

/** All-day event covering inclusive whole dates `yyyy-MM-dd`..`yyyy-MM-dd`. */
function ad(id: string, start: string, end: string): CalendarEvent {
  return {
    id,
    calendarId: 'cal',
    title: id,
    isAllDay: true,
    start: DateTime.fromISO(start, { zone: ZONE }).toJSDate(),
    end: DateTime.fromISO(end, { zone: ZONE }).plus({ days: 1 }).toJSDate(),
  };
}

function segments(events: CalendarEvent[], dayIndices: number[][]): Array<{ event: CalendarEvent; dayIndex: number }> {
  const out: Array<{ event: CalendarEvent; dayIndex: number }> = [];
  events.forEach((e, i) => {
    for (const d of dayIndices[i]!) out.push({ event: e, dayIndex: d });
  });
  return out;
}

describe('layoutAllDay', () => {
  it('returns empty boxes and no rows for no input', () => {
    expect(layoutAllDay([])).toEqual({ boxes: [], dayRows: [] });
  });

  it('lays a single-day all-day event into one column', () => {
    const { boxes } = layoutAllDay(segments([ad('a', '2024-08-18', '2024-08-18')], [[5]]));
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ colStart: 5, colSpan: 1, lane: 0, totalLanes: 1 });
  });

  it('spans a multi-day all-day event across consecutive columns', () => {
    const { boxes, dayRows } = layoutAllDay(
      segments([ad('a', '2024-08-18', '2024-08-20')], [[5, 6, 7]]),
    );
    expect(boxes[0]).toMatchObject({ colStart: 5, colSpan: 3, lane: 0, totalLanes: 1 });
    // one row each covered day
    expect(dayRows.slice(5, 8)).toEqual([1, 1, 1]);
  });

  it('stacks three overlapping all-day events into three lanes', () => {
    const { boxes } = layoutAllDay(
      segments(
        [ad('a', '2024-08-18', '2024-08-18'), ad('b', '2024-08-18', '2024-08-18'), ad('c', '2024-08-18', '2024-08-18')],
        [[5], [5], [5]],
      ),
    );
    expect(boxes.map((b) => b.totalLanes)).toEqual([3, 3, 3]);
    expect(new Set(boxes.map((b) => b.lane)).size).toBe(3);
  });

  it('gives each day its max row tally', () => {
    // A rows for day 5-6; B, C overlap day 5 only => day5 needs 3 rows.
    const { dayRows } = layoutAllDay(
      segments(
        [ad('a', '2024-08-18', '2024-08-19'), ad('b', '2024-08-18', '2024-08-18'), ad('c', '2024-08-18', '2024-08-18')],
        [[5, 6], [5], [5]],
      ),
    );
    expect(dayRows[5]).toBe(3);
    expect(dayRows[6]).toBe(1);
  });

  it('two separate groups on different days are independent', () => {
    const { boxes } = layoutAllDay(
      segments(
        [ad('a', '2024-08-18', '2024-08-18'), ad('b', '2024-08-19', '2024-08-19')],
        [[5], [6]],
      ),
    );
    expect(boxes[0]!.totalLanes).toBe(1);
    expect(boxes[1]!.totalLanes).toBe(1);
    expect(boxes[0]!.colStart).toBe(5);
    expect(boxes[1]!.colStart).toBe(6);
  });
});