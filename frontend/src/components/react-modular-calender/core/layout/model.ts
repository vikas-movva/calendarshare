/**
 * Layout model — the pure data the engine produces and the view layer consumes.
 *
 * Components never run scheduling algorithms; they consume these boxes.
 */
import type { AllDayBox } from './allday';
import type { TimedBox } from './timed';

/** A single visual time-grid row of a day (usually one hour). */
export interface TimeSlot {
  index: number;
  /** Wall-clock minute-of-day at the top of the slot (0–1439). */
  minuteOfDay: number;
  start: Date;
  end: Date;
}

/** Layout data for a single calendar day within the range. */
export interface DayLayout {
  /** Day index within the range (0-based). */
  index: number;
  /** Calendar-zone date label, ISO yyyy-MM-dd. */
  key: string;
  /** Local-midnight start of the day. */
  start: Date;
  /** Start of the next calendar day (exclusive boundary). */
  end: Date;
  /** Timed-grid rows (usually by hour; empty if the grid is disabled). */
  slots: TimeSlot[];
  /** All-day boxes covering this day. */
  allDay: AllDayBox[];
  /** Positioned timed boxes on this day. */
  timed: TimedBox[];
}