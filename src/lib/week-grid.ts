/**
 * Geometry for the Agenda's Week grid (Phase 113). Pure, so it can be tested
 * without a browser.
 */

/** How long a block is drawn when nothing says otherwise. */
export const DEFAULT_DURATION_MIN = 60;

const DAY_MIN = 24 * 60;

/** "08:30" or "08:30:00" -> 510. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export interface TimedSpan {
  key: string;
  /** Minutes from midnight. */
  start: number;
  /** Exclusive. */
  end: number;
}

export interface LanePlacement {
  /** Which side-by-side slot, from 0. */
  lane: number;
  /** How many slots its overlap cluster needs — the block's width is 1/lanes. */
  lanes: number;
}

/** A span of the default length, clipped to the day. */
export function spanAt(key: string, time: string, duration = DEFAULT_DURATION_MIN): TimedSpan {
  const start = Math.min(minutesOf(time), DAY_MIN - 1);
  return { key, start, end: Math.min(start + duration, DAY_MIN) };
}

/**
 * Side-by-side slots for overlapping blocks, the way a calendar app lays out
 * a busy morning: blocks that overlap (directly or through a chain of
 * others) form a cluster, each block takes the first slot free at its start,
 * and every block in a cluster is drawn at the width of the cluster's
 * widest moment. Blocks that touch end-to-start do not overlap.
 */
export function layoutLanes(spans: TimedSpan[]): Map<string, LanePlacement> {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed = new Map<string, LanePlacement>();

  let cluster: { key: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const close = () => {
    for (const item of cluster) placed.set(item.key, { lane: item.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const span of sorted) {
    if (span.start >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= span.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(span.end);
    } else {
      laneEnds[lane] = span.end;
    }
    cluster.push({ key: span.key, lane });
    clusterEnd = Math.max(clusterEnd, span.end);
  }
  close();
  return placed;
}
