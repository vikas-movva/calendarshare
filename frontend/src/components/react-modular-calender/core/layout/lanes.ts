/**
 * Lane assignment — the pure interval-layout core.
 *
 * Overlaps are resolved in two steps that together satisfy the core requirement
 * that an event's `totalLanes` equal the *maximum simultaneous overlap of its
 * overlap group* (never merely the event count):
 *
 *  1. Partition the day/range's intervals into **connected components** of the
 *     overlap graph (by transitively grouping intervals whose runs touch).
 *  2. Within each component, greedily assign each interval to the lowest free
 *     lane. Every member of the component then reports the component's final
 *     lane count, which — interior overlap graphs being perfect — equals the
 *     component's peak simultaneous occupancy.
 *
 * Intervals are `{ startMs, endMs, id }` (numeric), so the exact same algorithm
 * drives timed layout (ms scale) and all-day layout (discrete day-index scale).
 * The function is pure and trivially unit-testable.
 */

export interface LaneInterval {
  startMs: number;
  endMs: number;
  /** Stable tie-breaker for identical start/end. */
  id: string;
}

export interface LaneAssignment {
  /** Zero-based index into the *input* array this assignment corresponds to. */
  index: number;
  /** 0-based lane within its component. */
  lane: number;
  /** Lane count of this component (its max simultaneous overlap). */
  totalLanes: number;
  /** 0-based component index (in sorted order). */
  component: number;
}

/**
 * Assign lanes to a set of intervals. Returns one assignment per input
 * element, in the caller's input order (`index` mirrors input position).
 */
export function assignLanes(intervals: LaneInterval[]): LaneAssignment[] {
  if (intervals.length === 0) return [];

  const sorted = intervals
    .map((iv, index) => ({ iv, index }))
    .sort((a, b) => {
      if (a.iv.startMs !== b.iv.startMs) return a.iv.startMs - b.iv.startMs;
      if (a.iv.endMs !== b.iv.endMs) return a.iv.endMs - b.iv.endMs;
      return a.iv.id < b.iv.id ? -1 : a.iv.id > b.iv.id ? 1 : 0;
    });

  const laneByIndex = new Map<number, number>();
  const result: LaneAssignment[] = [];

  let members: number[] = [];
  let laneHeads: LaneInterval[] = [];
  let componentEnd = -Infinity;
  let componentIndex = 0;

  const flush = (): void => {
    const lanes = laneHeads.length;
    for (const idx of members) {
      result.push({
        index: idx,
        lane: laneByIndex.get(idx)!,
        totalLanes: lanes,
        component: componentIndex,
      });
    }
    members = [];
    laneHeads = [];
    componentEnd = -Infinity;
    componentIndex += 1;
  };

  for (const { iv, index } of sorted) {
    if (iv.startMs >= componentEnd) {
      if (componentEnd !== -Infinity) flush();
      // else: first interval, fresh component (members already empty).
    }

    let lane = -1;
    for (let i = 0; i < laneHeads.length; i++) {
      if (laneHeads[i]!.endMs <= iv.startMs) {
        lane = i;
        break;
      }
    }
    if (lane === -1) {
      lane = laneHeads.length;
      laneHeads.push(iv);
    } else {
      laneHeads[lane] = iv;
    }

    laneByIndex.set(index, lane);
    members.push(index);
    componentEnd = Math.max(componentEnd, iv.endMs);
  }

  if (members.length > 0) flush();

  result.sort((a, b) => a.index - b.index);
  return result;
}