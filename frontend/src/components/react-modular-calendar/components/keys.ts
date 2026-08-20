/**
 * Stable, deterministic string keys for structural rendering.
 * Kept in one place so key shapes are consistent and reviewable.
 */

/** Unique key for a single event's chip on a specific day. */
export function eventKey(eventId: string, dayIndex: number): string {
  return `e:${eventId}@${dayIndex}`;
}

/** Unique key for an all-day chip (spans days, keyed by the event only). */
export function allDayKey(eventId: string): string {
  return `ad:${eventId}`;
}

/** Key for a time slot on a day. */
export function slotKey(dayIndex: number, slotIndex: number): string {
  return `slot:${dayIndex}:${slotIndex}`;
}