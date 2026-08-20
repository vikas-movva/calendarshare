/**
 * Calendar — the top-level, view-only calendar component.
 *
 * The number of rows shown is derived from the active `[startDate, endDate]`
 * range (see `buildDisplayGrid`): a single day is a full-width day column, a
 * few days render as the week(s) that contain them, and a long range (beyond a
 * month) renders one week per calendar week. The schedule for the laid-out
 * range is produced by the pure engine over the padded grid range, so greyed
 * filler cells still render their events. Day-row height scales with the number
 * of weeks shown so the visible portion stays ~a month tall; ranges longer than
 * a month are wrapped in a vertically scrollable container.
 *
 * The component is strictly read-only — nothing it renders mutates events or
 * the supplied range.
 */
import { useMemo } from 'react';
import type { CalendarEvent } from '../types';
import { buildDisplayGrid } from '../core/weekgrid';
import { useCalendarLayout } from './useCalendarLayout';
import { CalendarGrid } from './CalendarGrid';
import type { CalendarProps } from './props';
import './calendar.css';

/** Reference rows considered "one month" — used to size row height + scrolling. */
const MONTH_ROWS = 6;
/** Total month height budget before it is split across the visible rows. */
const MONTH_HEIGHT = 50; // vh — hosts can override via --mc-month-height

export function Calendar({
  events,
  startDate,
  endDate,
  timezone,
  slotMinutes = 60,
  weekStart = 0,
  ariaLabel,
  dayAriaLabel,
  onEventClick,
  renderDayHeader,
  renderEvent,
  view,
}: CalendarProps): React.ReactElement {
  const display = useMemo(
    () => buildDisplayGrid(startDate, endDate, timezone, weekStart),
    [startDate, endDate, timezone, weekStart],
  );

  // Single-day view wraps a full day tp its own row; weeks-cap to a month.
  const weekCount = display.kind === 'weeks' ? display.weekCount! : 1;
  const visibleRows = Math.min(weekCount, MONTH_ROWS);
  const weekRowHeight = `calc(var(--mc-month-height, ${MONTH_HEIGHT}vh) / ${visibleRows})`;
  const scrollable = display.kind === 'weeks' && display.weekCount! > MONTH_ROWS;
  const alldayRowHeight = Math.min(56, Math.max(14, Math.round(56 / visibleRows)));

  const layout = useCalendarLayout(events, display.range, timezone, { slotMinutes });

  const label =
    ariaLabel ?? `${display.activeStart.toDateString()} – ${display.activeEnd.toDateString()}`;

  return (
    <div
      role="grid"
      aria-label={label}
      className="mc-calendar"
      data-view={view}
      style={{
        ['--mc-month-height' as string]: `${MONTH_HEIGHT}vh`,
        ['--mc-week-h' as string]: weekRowHeight,
      }}
    >
      <CalendarGrid
        layout={layout}
        display={display}
        timezone={timezone}
        alldayHeight={alldayRowHeight}
        scrollable={scrollable}
        onActivate={onEventClick}
        renderDayHeader={renderDayHeader}
        renderEvent={renderEvent}
        dateLabel={dayAriaLabel}
      />
    </div>
  );
}

export type { CalendarEvent }; // re-export for convenience