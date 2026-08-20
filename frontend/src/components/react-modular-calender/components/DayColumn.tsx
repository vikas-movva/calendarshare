/**
 * DayColumn — one day's timed grid in the week grid: a day-of-month label, slot
 * backgrounds, and positioned event chips. `role="gridcell"` with an
 * `aria-label` of the date. A greyed (filler) day still renders its events but
 * is visually muted to mark it as outside the visible range.
 */
import type { CalendarEvent } from '../types';
import type { RenderEventLayout } from './props';
import { slotKey } from './keys';
import { EventChip } from './EventChip';
import type { DayLayout } from '../core/engine';

export interface DayColumnProps {
  day: DayLayout;
  /** Day-of-month label rendered at the top of the cell. */
  dayNumber?: React.ReactNode;
  /** Marks the cell as outside the visible range (greyed filler). */
  greyed?: boolean;
  /** Accessible label for the gridcell (defaults to the ISO date key). */
  dateLabel?: string;
  onActivate?: (event: CalendarEvent) => void;
  renderEvent?: (opts: { event: CalendarEvent; layout: RenderEventLayout }) => React.ReactNode;
}

export function DayColumn({
  day,
  dayNumber,
  greyed = false,
  dateLabel,
  onActivate,
  renderEvent,
}: DayColumnProps): React.ReactElement {
  const slotCount = day.slots.length;
  const className = `mc-calendar__column${greyed ? ' mc-calendar__column--grey' : ''}`;

  return (
    <div role="gridcell" aria-label={dateLabel ?? day.key} className={className}>
      <div className="mc-calendar__cellnum">{dayNumber ?? ''}</div>
      <div className="mc-grid" style={{ position: 'relative' }}>
        {slotCount > 0 &&
          day.slots.map((_, i) => (
            <div
              key={slotKey(day.index, i)}
              className="mc-grid__slot"
              style={{
                position: 'absolute',
                insetInline: 0,
                top: `${(i / slotCount) * 100}%`,
                height: `${100 / slotCount}%`,
              }}
            />
          ))}
        <div className="mc-grid__timed">
          {day.timed.map((box, boxIndex) => (
            <EventChip
              key={`${box.event.id}-${box.start.toISOString()}-${box.end.toISOString()}-${box.lane}-${boxIndex}`}
              event={box.event}
              dayIndex={day.index}
              dateKey={day.key}
              left={box.left}
              width={box.width}
              top={box.top}
              height={box.height}
              lane={box.lane}
              totalLanes={box.totalLanes}
              isFirstDay={box.isFirstDay}
              isLastDay={box.isLastDay}
              onActivate={onActivate}
              render={renderEvent}
            />
          ))}
        </div>
      </div>
    </div>
  );
}