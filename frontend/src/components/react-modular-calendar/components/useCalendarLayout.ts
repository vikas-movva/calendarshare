/**
 * `useCalendarLayout` — memoizes the expensive pure layout computation so it
 * only re-runs when its inputs change. The component tree reads the memoized
 * result; no layout work happens on unrelated re-renders.
 */
import { useMemo } from 'react';
import type { CalendarEvent, CalendarRange, CalendarZone } from '../types';
import {
  layoutEvents,
  type CalendarLayout,
  type EngineOptions,
} from '../core/engine';

/**
 * Version-signed layout deps so callers can intentionally invalidate.
 * Using an explicit integer lets parents coerce strong refs cheaply.
 */
export function useCalendarLayout(
  events: CalendarEvent[],
  range: CalendarRange,
  timezone: CalendarZone,
  options: EngineOptions = {},
): CalendarLayout {
  const { slotMinutes = 60, includeAllDay = true } = options;
  return useMemo(
    () => layoutEvents(events, range, timezone, { slotMinutes, includeAllDay }),
    // events is expected to be referentially stable; callers that mutate must
    // remap. Kept deps explicit and complete.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, range.start, range.end, timezone, slotMinutes, includeAllDay],
  );
}