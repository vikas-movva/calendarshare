/**
 * Unit tests for the lane-assignment core.
 *
 * These target the interval-layout algorithm directly: overlap groups,
 * nesting, chains, tie-breaking, identical intervals, and — critically — that
 * `totalLanes` equals the *maximum simultaneous overlap* of an event's group,
 * never merely the number of events.
 */
import { describe, expect, it } from 'vitest';
import { assignLanes, type LaneInterval } from './lanes';

interface Assigned {
  lane: number;
  totalLanes: number;
  component: number;
}

/**
 * Run `assignLanes` over an interval spec and map each result back to its
 * input `id` (assignments come back in the caller's input order via `index`).
 */
function layout(items: LaneInterval[]): Record<string, Assigned> {
  const res = assignLanes(items);
  const out: Record<string, Assigned> = {};
  res.forEach((r) => {
    out[items[r.index]!.id] = { lane: r.lane, totalLanes: r.totalLanes, component: r.component };
  });
  return out;
}

/** Convenience: build a labelled interval list. */
function ivs(spec: Array<[string, number, number]>): LaneInterval[] {
  return spec.map(([id, s, e]) => ({ startMs: s, endMs: e, id }));
}

describe('assignLanes', () => {
  it('returns an empty result for no intervals', () => {
    expect(assignLanes([])).toEqual([]);
  });

  it('assigns a single interval to lane 0 with totalLanes 1', () => {
    const res = layout(ivs([['a', 0, 10]]));
    expect(res.a).toMatchObject({ lane: 0, totalLanes: 1, component: 0 });
  });

  it('keeps two non-overlapping intervals on the same lane', () => {
    const res = layout(ivs([['a', 0, 5], ['b', 5, 10]]));
    expect(res.a!.lane).toBe(0);
    expect(res.b!.lane).toBe(0);
    expect(res.a!.totalLanes).toBe(1);
    expect(res.b!.totalLanes).toBe(1);
    expect(res.a!.component).not.toBe(res.b!.component);
  });

  it('treats a touch boundary (end === start) as non-overlapping', () => {
    const res = layout(ivs([['a', 0, 5], ['b', 5, 9]]));
    expect(res.b!.component).not.toBe(res.a!.component);
    expect(res.b!.lane).toBe(0);
  });

  describe('overlap groups and maximum simultaneous overlap', () => {
    it('totalLanes equals peak simultaneous overlap (3-group)', () => {
      const res = layout(ivs([['a', 0, 12], ['b', 2, 6], ['c', 3, 9]]));
      expect(res.a!.totalLanes).toBe(3);
      expect(res.b!.totalLanes).toBe(3);
      expect(res.c!.totalLanes).toBe(3);
      expect(new Set(Object.values(res).map((r) => r!.component)).size).toBe(1);
    });

    it('two overlapping events use 2 lanes and share a component', () => {
      const res = layout(ivs([['a', 0, 10], ['b', 5, 15]]));
      expect(res.a!.totalLanes).toBe(2);
      expect(res.b!.totalLanes).toBe(2);
      expect(res.a!.component).toBe(res.b!.component);
      expect(new Set([res.a!.lane, res.b!.lane]).size).toBe(2);
    });

    it('three overlapping events occupy lanes 0,1,2', () => {
      const res = layout(ivs([['a', 0, 10], ['b', 1, 11], ['c', 2, 12]]));
      const lanes = [res.a!.lane, res.b!.lane, res.c!.lane].sort((x, y) => x - y);
      expect(lanes).toEqual([0, 1, 2]);
      expect([res.a!.totalLanes, res.b!.totalLanes, res.c!.totalLanes]).toEqual([3, 3, 3]);
    });

    it('nested events get 2 lanes, not 3 (enclosed not overlapping each other)', () => {
      // A encloses both B and C, but B and C do not overlap each other.
      const res = layout(ivs([['a', 0, 100], ['b', 10, 20], ['c', 30, 40]]));
      expect(res.a!.totalLanes).toBe(2);
      expect(res.b!.totalLanes).toBe(2);
      expect(res.c!.totalLanes).toBe(2);
      expect(new Set([res.a!.lane, res.b!.lane, res.c!.lane]).size).toBe(2);
    });

    it('handles a long chain where each overlaps only its neighbours (peak 2)', () => {
      const res = layout(ivs([
        ['a', 0, 6], ['b', 4, 10], ['c', 8, 14], ['d', 12, 18], ['e', 16, 22],
      ]));
      const comps = new Set(Object.values(res).map((r) => r!.component));
      expect(comps.size).toBe(1);
      expect(new Set(Object.values(res).map((r) => r!.totalLanes))).toEqual(new Set([2]));
      expect(new Set(Object.values(res).map((r) => r!.lane))).toEqual(new Set([0, 1]));
    });

    it('keeps the peak as component size when the middle is busiest', () => {
      // A(0-10) B(2-5) C(5-8) D(3-9): one component; peak overlap is 3 in [3,5).
      const res = layout(ivs([
        ['a', 0, 10], ['b', 2, 5], ['c', 5, 8], ['d', 3, 9],
      ]));
      expect(new Set(Object.values(res).map((r) => r!.component)).size).toBe(1);
      expect(new Set(Object.values(res).map((r) => r!.totalLanes))).toEqual(new Set([3]));
    });

    it('separates two disjoint groups into distinct components with own sizes', () => {
      const res = layout(ivs([
        ['a', 0, 4], ['b', 1, 5], // peak 2
        ['c', 50, 52], ['d', 50, 53], ['e', 50, 54], // peak 3
      ]));
      expect(res.a!.totalLanes).toBe(2);
      expect(res.b!.totalLanes).toBe(2);
      expect(res.a!.component).toBe(res.b!.component);
      expect(res.c!.totalLanes).toBe(3);
      expect(res.d!.totalLanes).toBe(3);
      expect(res.e!.totalLanes).toBe(3);
      expect(res.a!.component).not.toBe(res.c!.component);
    });
  });

  describe('ties and degenerate timings', () => {
    it('identical start/end times still get distinct lanes', () => {
      const res = layout(ivs([['a', 10, 20], ['b', 10, 20], ['c', 10, 20]]));
      expect([res.a!.lane, res.b!.lane, res.c!.lane].sort((x, y) => x - y)).toEqual([0, 1, 2]);
      expect(res.a!.totalLanes).toBe(3);
    });

    it('identical start times, different ends', () => {
      const res = layout(ivs([['a', 0, 20], ['b', 0, 10], ['c', 0, 5]]));
      expect([res.a!.lane, res.b!.lane, res.c!.lane].sort((x, y) => x - y)).toEqual([0, 1, 2]);
      expect(Object.values(res).every((x) => x.totalLanes === 3)).toBe(true);
    });

    it('identical end times, different starts', () => {
      const res = layout(ivs([['a', 0, 10], ['b', 5, 10], ['c', 8, 10]]));
      expect(Object.values(res).every((x) => x.totalLanes === 3)).toBe(true);
    });

    it('zero-length events overlapping at an interior instant still lane', () => {
      // a zero-length event sitting strictly inside b's span overlaps it.
      const res = layout(ivs([['a', 5, 5], ['b', 4, 6]]));
      expect(res.a!.totalLanes).toBe(2);
      expect(res.b!.totalLanes).toBe(2);
      expect(new Set([res.a!.lane, res.b!.lane]).size).toBe(2);
    });

    it('preserves zero-length events at the component tail', () => {
      // b ends at a's start; a has zero positive duration. Both end at 5, so a
      // (a zero-width point) and b (4..5) do not strike a positive overlap.
      const res = layout(ivs([['b', 4, 5], ['a', 5, 5]]));
      // end-exclusive model: no shared interior -> separate components, lane 0
      expect(res.a!.lane).toBe(0);
      expect(res.b!.lane).toBe(0);
      expect(res.a!.component).not.toBe(res.b!.component);
    });
  });

  it('is deterministic regardless of input order', () => {
    // y starts earlier than x, so it always grabs the first free lane.
    const a = layout(ivs([['x', 10, 20], ['y', 0, 30]]));
    const b = layout(ivs([['y', 0, 30], ['x', 10, 20]]));
    expect(a.y!.lane).toBe(0);
    expect(b.y!.lane).toBe(0);
    expect(a.x!.lane).toBe(1);
    expect(b.x!.lane).toBe(1);
    expect(a.y!.component).toBe(a.x!.component);
    expect(b.y!.component).toBe(b.x!.component);
  });
});