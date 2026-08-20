/**
 * @modular-calendar/core — public entry point.
 *
 * Re-exports the component, its types, and the pure engine functions so
 * consumers can either render `<Calendar>` or reuse the layout engine (e.g. for
 * SSR, tests, custom renderers).
 */
export { Calendar } from './components/Calendar';
export type { CalendarProps, RenderEventLayout } from './components/props';

export type {
  CalendarEvent,
  CalendarRange,
  CalendarSource,
  CalendarView,
  CalendarZone,
  EventClickHandler,
} from './types';

export {
  layoutEvents,
  type CalendarLayout,
  type EngineOptions,
  type DayLayout,
  type TimeSlot,
} from './core/engine';
export { assignLanes, type LaneAssignment } from './core/layout/lanes';
export type { TimedBox } from './core/layout/timed';
export type { AllDayBox } from './core/layout/allday';

export {
  buildDays,
  splitIntoDays,
  type DaySegment,
} from './core/segments';
export {
  dayStart,
  nextDayStart,
  toZone,
  dateKey,
  minuteOfDay,
  DateTime,
} from './core/dates';

export {
  buildDisplayGrid,
  allDayForWeek,
  isMultiMonth,
  firstOfMonth,
  addMonths,
  addDays,
  calendarDaysBetween,
  type DisplayGrid,
  type DisplayGridKind,
  type WeekGridDay,
  type WeekStartDay,
} from './core/weekgrid';