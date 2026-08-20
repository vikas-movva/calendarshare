/**
 * CalendarGrid — turns the display grid into rows.
 *
 * A single-day range renders as one full-width day column. A multi-day range
 * renders a fixed weekday header row plus, per week, an all-day strip and the 7
 * day columns. When the range spans more than a month the week rows are wrapped
 * in a vertically scrollable body (header stays fixed) so the rest of the range
 * can be scrolled into view.
 */
import type { CalendarEvent, CalendarZone } from '../types';
import type { CalendarLayout } from '../core/engine';
import { allDayForWeek, type DisplayGrid, type WeekGridDay } from '../core/weekgrid';
import { dateKey } from '../core/dates';
import type { RenderEventLayout } from './props';
import { AllDayStrip } from './AllDayStrip';
import { DayColumn } from './DayColumn';

export interface CalendarGridProps {
  layout: CalendarLayout;
  /** The display grid computed from the active range. */
  display: DisplayGrid;
  timezone: CalendarZone;
  /** Height (px) for each week's all-day strip. */
  alldayHeight: number;
  /** When true, long ranges scroll within a fixed-height body. */
  scrollable: boolean;
  onActivate?: (event: CalendarEvent) => void;
  renderDayHeader?: (opts: {
    date: Date;
    timezone: CalendarZone;
    isToday: boolean;
  }) => React.ReactNode;
  renderEvent?: (opts: { event: CalendarEvent; layout: RenderEventLayout }) => React.ReactNode;
  /** Per-day accessible cell label; defaults to the ISO date key. */
  dateLabel?: (opts: { dateKey: string; date: Date; timezone: CalendarZone }) => string;
}

const DAY_HEADER_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const WEEKS_COLUMNS = 7;

export function CalendarGrid({
  layout,
  display,
  timezone,
  alldayHeight,
  scrollable,
  onActivate,
  renderDayHeader,
  renderEvent,
  dateLabel,
}: CalendarGridProps): React.ReactElement {
  const todayKey = dateKey(new Date(), timezone);

  const dayCell = (gridDay: WeekGridDay, globalIndex: number) => {
    const day = layout.days[globalIndex];
    if (!day) return null;
    const isToday = day.key === todayKey;
    const header = renderDayHeader
      ? renderDayHeader({ date: day.start, timezone, isToday })
      : gridDay.date;
    return (
      <DayColumn
        key={day.key}
        day={day}
        dayNumber={header}
        greyed={!gridDay.inRange}
        dateLabel={
          dateLabel
            ? dateLabel({ dateKey: day.key, date: day.start, timezone })
            : undefined
        }
        onActivate={onActivate}
        renderEvent={renderEvent}
      />
    );
  };

  // ---- Single active day: one full-width day column. ----
  if (display.kind === 'single-day') {
    return (
      <div role="rowgroup" className="mc-calendar__days">
        <div role="row" style={singleDayStyle()}>
          {display.day && dayCell(display.day, 0)}
        </div>
      </div>
    );
  }

  // ---- Multi-day: fixed header + week rows (scrollable when long). ----
  const weeks = display.weeks!;
  const weekdayLabels = Array.from({ length: WEEKS_COLUMNS }, (_, k) =>
    DAY_HEADER_FMT.format(weeks[0]![k]!.start),
  );

  const body = (
    <div
      className="mc-calendar__body"
      style={
        scrollable
          ? { maxHeight: 'var(--mc-month-height, 50vh)', overflowY: 'auto' }
          : undefined
      }
    >
      {weeks.map((week, wi) => (
        <div key={wi} className="mc-calendar__week">
          <AllDayStrip
            boxes={allDayForWeek(layout.allDay, wi, WEEKS_COLUMNS)}
            dayCount={WEEKS_COLUMNS}
            height={alldayHeight}
            onActivate={onActivate}
            render={renderEvent}
          />
          <div role="row" style={columnsGrid(WEEKS_COLUMNS)}>
            {week.map((gd, k) => dayCell(gd, wi * WEEKS_COLUMNS + k))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div role="rowgroup" className="mc-calendar__days">
      <div role="row" className="mc-calendar__head" style={columnsGrid(WEEKS_COLUMNS)}>
        {weekdayLabels.map((label, k) => (
          <div key={k} role="columnheader" className="mc-calendar__head-cell">
            {label}
          </div>
        ))}
      </div>
      {body}
    </div>
  );
}

function singleDayStyle(): React.CSSProperties {
  return { display: 'grid', gridTemplateColumns: '1fr' };
}

/** A week's rows share the same 7-column template so columns align. */
function columnsGrid(dayCount: number): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))`,
    gap: '1px',
  };
}