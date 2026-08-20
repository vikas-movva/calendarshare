/**
 * AllDayStrip — the horizontal all-day band above the timed columns.
 *
 * Set to the same grid template as the day columns so that multi-day all-day
 * chips span exactly their columns via `grid-column`. Each chip keeps one
 * consistent lane row across its whole span.
 */
import type { KeyboardEvent } from 'react';
import type { CalendarEvent } from '../types';
import type { AllDayBox } from '../core/layout/allday';
import type { RenderEventLayout } from './props';

export interface AllDayStripProps {
  /** All all-day boxes for the whole range. */
  boxes: AllDayBox[];
  /** Number of visible day columns. */
  dayCount: number;
  /** Fixed row height (px). Shrinks with the number of weeks. */
  height?: number;
  onActivate?: (event: CalendarEvent) => void;
  render?: (opts: { event: CalendarEvent; layout: RenderEventLayout }) => React.ReactNode;
}

export function AllDayStrip({
  boxes,
  dayCount,
  height,
  onActivate,
  render,
}: AllDayStripProps): React.ReactElement {
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))`,
    gridAutoRows: 'auto',
    gap: '1px',
    ...(height ? { height } : {}),
  };

  if (boxes.length === 0) {
    const emptyStyle: React.CSSProperties = height ? { minHeight: height } : {};
    return <div role="row" className="mc-allday" aria-hidden="true" style={emptyStyle} />;
  }

  return (
    <div role="rowgroup" className="mc-allday" style={gridStyle}>
      {boxes.map((b) => (
        <AllDayChip
          key={b.event.id}
          box={b}
          onActivate={onActivate}
          render={render}
        />
      ))}
    </div>
  );
}

interface ChipProps {
  box: AllDayBox;
  onActivate?: (event: CalendarEvent) => void;
  render?: (opts: { event: CalendarEvent; layout: RenderEventLayout }) => React.ReactNode;
}

function AllDayChip({ box, onActivate, render }: ChipProps): React.ReactElement | null {
  const event = box.event;
  const style: React.CSSProperties = {
    gridColumn: `${box.colStart + 1} / span ${box.colSpan}`,
    gridRow: box.lane + 1,
    background: event.color ?? undefined,
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box',
  };

  const activate = (): void => onActivate?.(event);
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  };

  const layout: RenderEventLayout = {
    kind: 'all-day',
    colStart: box.colStart,
    colSpan: box.colSpan,
    lane: box.lane,
    totalLanes: box.totalLanes,
  };

  if (render) {
    const rendered = render({ event, layout });
    if (rendered == null) return null; // caller asked to hide this chip
    return (
      <div
        style={style}
        role="button"
        tabIndex={0}
        aria-label={event.title}
        onClick={activate}
        onKeyDown={onKey}
      >
        {rendered}
      </div>
    );
  }

  return (
    <div
      style={style}
      role="button"
      tabIndex={0}
      aria-label={event.title}
      className="mc-allday__chip"
      onClick={activate}
      onKeyDown={onKey}
      title={event.description ?? event.title}
    >
      {box.colSpan > 1 ? '\u2192 ' : ''}
      {event.title}
    </div>
  );
}