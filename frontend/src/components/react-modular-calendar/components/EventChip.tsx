/**
 * EventChip — a single positioned timed-event element.
 *
 * View-only: it renders a box from a computed layout and surfaces activation
 * via `onActivate` (keyboard-safe) rather than any hardcoded mutation.
 */
import type { KeyboardEvent } from 'react';
import type { CalendarEvent } from '../types';
import type { RenderEventLayout } from './props';

export interface EventChipProps {
  event: CalendarEvent;
  dayIndex: number;
  dateKey: string;
  left: number;
  width: number;
  top: number;
  height: number;
  lane: number;
  totalLanes: number;
  /** Whether this segment is the event's first day (renders title/arrow). */
  isFirstDay: boolean;
  isLastDay: boolean;
  onActivate?: (event: CalendarEvent) => void;
  /** Custom renderer; falls back to a plain label. */
  render?: (opts: { event: CalendarEvent; layout: RenderEventLayout }) => React.ReactNode;
}

const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

export function EventChip({
  event,
  dayIndex,
  dateKey,
  left,
  width,
  top,
  height,
  lane,
  totalLanes,
  isFirstDay,
  isLastDay,
  onActivate,
  render,
}: EventChipProps): React.ReactElement | null {
  const style: React.CSSProperties = {
    left: `${left * 100}%`,
    width: `calc(${width * 100}% - 2px)`,
    top: `${top * 100}%`,
    height: `calc(${height * 100}% - 2px)`,
    background: event.color ?? undefined,
  };

  const activate = (): void => onActivate?.(event);
  const onKey = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  };

  const layout: RenderEventLayout = {
    kind: 'timed',
    dateKey,
    dayIndex,
    left,
    width,
    top,
    height,
    lane,
    totalLanes,
  };

  if (render) {
    const rendered = render({ event, layout });
    if (rendered == null) return null; // caller asked to hide this chip
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={event.title}
        data-mc-event-id={event.id}
        onClick={activate}
        onKeyDown={onKey}
        style={style}
        className="mc-timed mc-timed--custom"
      >
        {rendered}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={event.title}
      data-mc-event-id={event.id}
      onClick={activate}
      onKeyDown={onKey}
      style={style}
      className={`mc-timed${isFirstDay ? ' mc-timed--first' : ''}${isLastDay ? ' mc-timed--last' : ''}`}
      title={event.description ?? event.title}
    >
      {isFirstDay && <span className="mc-timed__time">{TIME_FMT.format(event.start)} · </span>}
      {event.title}
    </div>
  );
}