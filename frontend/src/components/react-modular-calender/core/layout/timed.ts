/**
 * Timed-event layout.
 *
 * Consumes day-clipped segments, partitions each day's timed segments into
 * connectivity components, and assigns per-component lanes plus fractional
 * [left, width, top, height] boxes relative to the day column.
 */
import type { CalendarEvent } from '../../types';
import { assignLanes } from './lanes';

/** A day-clipped piece of a timed event (produced by segmentation). */
export interface TimedSegment {
  event: CalendarEvent;
  dayIndex: number;
  start: Date;
  end: Date;
  isFirstDay: boolean;
  isLastDay: boolean;
}

/** Position of a single timed event within its day. */
export interface TimedBox extends TimedSegment {
  /** Fractional left edge within the day column, 0–1. */
  left: number;
  /** Fractional width within the day column, 0–1. */
  width: number;
  /** Fractional top within the day's span, 0–1 (wall-clock based). */
  top: number;
  /** Fractional height within the day's span, 0–1. */
  height: number;
  /** Lane within the component. */
  lane: number;
  /** Component's max simultaneous overlap. */
  totalLanes: number;
}

/**
 * Lay out one calendar day's timed segments.
 *
 * @param segments    the day's timed segments (already day-clipped).
 * @param dayStartMs  local-midnight start of the day.
 * @param dayEndMs    exclusive start-of-next-day boundary.
 * @returns positional boxes in the same order as `segments`.
 */
export function layoutDayTimed(
  segments: TimedSegment[],
  dayStartMs: number,
  dayEndMs: number,
): TimedBox[] {
  if (segments.length === 0) return [];

  const dayDuration = dayEndMs - dayStartMs;

  const intervals = segments.map((s) => ({
    startMs: s.start.getTime(),
    endMs: s.end.getTime(),
    id: s.event.id,
  }));
  const assignments = assignLanes(intervals);

  const byIndex = new Map(assignments.map((a) => [a.index, a]));

  return segments.map((s, i) => {
    const a = byIndex.get(i)!;
    const top = (s.start.getTime() - dayStartMs) / dayDuration;
    const height = Math.max(
      Math.max((s.end.getTime() - s.start.getTime()) / dayDuration, MIN_HEIGHT),
      0,
    );
    return {
      event: s.event,
      dayIndex: s.dayIndex,
      start: s.start,
      end: s.end,
      isFirstDay: s.isFirstDay,
      isLastDay: s.isLastDay,
      left: a.lane / a.totalLanes,
      width: 1 / a.totalLanes,
      top,
      height,
      lane: a.lane,
      totalLanes: a.totalLanes,
    };
  });
}

/** Minimal visible fraction so zero-length events still render a sliver. */
const MIN_HEIGHT = 0.005;