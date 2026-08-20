/**
 * React props for the top-level {@link Calendar} component and its public
 * extension points (custom headers, custom event rendering).
 */
import type {
  CalendarEvent,
  CalendarView,
  CalendarZone,
  EventClickHandler,
} from '../types';

export interface CalendarProps {
  /** Normalized events to render. The calendar is strictly view-only. */
  events: CalendarEvent[];

  /** First visible day, at local midnight in `timezone`. */
  startDate: Date;

  /** Last visible day, at local midnight in `timezone` (inclusive). */
  endDate: Date;

  /** IANA zone the calendar renders days and positions events in. */
  timezone: CalendarZone;

  /** Minutes per timed-grid column. Default 60; 0 hides the time grid. */
  slotMinutes?: number;

  /**
   * Week-origin for the 7-day rows. 0 = Sunday (Google default). Default 0.
   */
  weekStart?: 0 | 1 | 2 | 3 | 4 | 5 | 6;

  /** Accessibility label for the whole calendar (format the range yourself). */
  ariaLabel?: string;

  /**
   * Accessible label for each day column; receives its ISO date key and the
   * local-midnight start `Date`.
   */
  dayAriaLabel?: (opts: { dateKey: string; date: Date; timezone: CalendarZone }) => string;

  /** Fired when the user activates an event (click or Enter/Space). */
  onEventClick?: EventClickHandler;

  /** Custom header renderer for a single day column. */
  renderDayHeader?: (opts: {
    date: Date;
    timezone: CalendarZone;
    isToday: boolean;
  }) => React.ReactNode;

  /** Custom renderer for any event chip (timed or all-day). Return `null` to hide. */
  renderEvent?: (opts: {
    event: CalendarEvent;
    layout: RenderEventLayout;
  }) => React.ReactNode;

  /** Informational view marker (layout itself is still range-driven). */
  view?: CalendarView;
}

/**
 * Discriminated union of per-event layout handed to `renderEvent`. Narrow on
 * `kind` to render timed vs all-day events differently.
 */
export type RenderEventLayout =
  | {
      kind: 'timed';
      dayIndex: number;
      dateKey: string;
      left: number;
      width: number;
      top: number;
      height: number;
      lane: number;
      totalLanes: number;
    }
  | {
      kind: 'all-day';
      colStart: number;
      colSpan: number;
      lane: number;
      totalLanes: number;
    };

export type { CalendarEvent, CalendarZone, EventClickHandler };