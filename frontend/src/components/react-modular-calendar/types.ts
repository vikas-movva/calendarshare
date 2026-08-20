/**
 * Public types for the modular calendar.
 *
 * These types form the contract between the calendar and the rest of the
 * application. Nothing in here knows about Google Calendar, Outlook, or any
 * other backend.
 */

/** Unique id of the calendar/source an event belongs to. */
export type CalendarSourceId = string;

/** IANA timezone name (e.g. "America/Toronto"). */
export type CalendarZone = string;

/**
 * A normalized calendar event, independent of any backend provider.
 *
 * Times are plain JS `Date` (absolute instants). All day-boundary math is done
 * in the calendar's configured timezone by the engine — a `Date` constructed
 * with local time will be shifted correctly, never silently dropped onto the
 * wrong day by a UTC/local conversion.
 */
export interface CalendarEvent {
  /** Stable id, unique across all events handed to the calendar. */
  id: string;

  /** Which source/calendar this event came from. */
  calendarId: CalendarSourceId;

  /** Human-readable title. */
  title: string;

  /** Event start as an absolute instant. Inclusive. */
  start: Date;

  /** Event end as an absolute instant. Exclusive. */
  end: Date;

  /** Whether this is an all-day event (no specific time of day). */
  isAllDay: boolean;

  /** Optional display color. Falls back to the source's color. */
  color?: string;

  location?: string;
  description?: string;

  /** Optional rendering hint; the caller may render differently per source. */
  source?: {
    id: CalendarSourceId;
    name?: string;
    color?: string;
  };

  /** Free-form app/extensibility data, never interpreted by the calendar. */
  metadata?: Record<string, unknown>;
}

/** Displayable color metadata for a single source/calendar. */
export interface CalendarSource {
  id: CalendarSourceId;
  name?: string;
  color?: string;
}

/** Callback fired when the user activates (clicks or keys) an event. */
export type EventClickHandler = (event: CalendarEvent) => void;

/**
 * Internal engine range consumed by the layout engine.
 *
 * Both are zone-local midnights. `start` is the first visible day's midnight;
 * `end` is an *exclusive* boundary — the midnight of the day *after* the last
 * visible day. The top-level `<Calendar>` normalizes its inclusive
 * `startDate`/`endDate` props into this shape.
 */
export interface CalendarRange {
  /** First visible day, at local midnight in the calendar zone. */
  start: Date;
  /**
   * Exclusive closing boundary: midnight of the day after the last visible
   * day. `[start, end)` spans exactly the visible days.
   */
  end: Date;
}

/**
 * A single calendar view. The engine only needs a date range to lay out a
 * view; `view` is metadata that drives labeling/wrapping decisions.
 */
export type CalendarView = 'day' | 'multi-day' | 'week' | 'month';

/** Minutes per timed-grid column along the vertical axis. Defaults to 60. */
export type CalendarSlotSize = number;