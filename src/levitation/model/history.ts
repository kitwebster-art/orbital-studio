/**
 * Orbital Levitation Lab: a short rolling record of simulation states, so the
 * app can show where a latency-delayed projection would have been drawn.
 */

import type { ForceBreakdown, SimState, Vec3 } from './types';
import { quatClone, slerp, v3clone } from './math';

function cloneForces(f: ForceBreakdown): ForceBreakdown {
  return {
    weight: v3clone(f.weight),
    buoyancy: v3clone(f.buoyancy),
    jet: v3clone(f.jet),
    centering: v3clone(f.centering),
    shedding: v3clone(f.shedding),
    turbulence: v3clone(f.turbulence),
    total: v3clone(f.total),
  };
}

export function cloneSimState(s: SimState): SimState {
  return {
    ...s,
    position: v3clone(s.position),
    velocity: v3clone(s.velocity),
    orientation: quatClone(s.orientation),
    angularVelocity: v3clone(s.angularVelocity),
    forces: cloneForces(s.forces),
  };
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

const MAX_ENTRIES = 8192;

export class StateHistory {
  readonly capacitySeconds: number;
  private entries: SimState[] = [];

  constructor(capacitySeconds = 2) {
    this.capacitySeconds = Number.isFinite(capacitySeconds) && capacitySeconds > 0 ? capacitySeconds : 2;
  }

  get length(): number {
    return this.entries.length;
  }

  /** Oldest and newest stored times, or null when empty. */
  get span(): { start: number; end: number } | null {
    if (this.entries.length === 0) return null;
    return { start: this.entries[0].timeS, end: this.entries[this.entries.length - 1].timeS };
  }

  push(s: SimState): void {
    const last = this.entries[this.entries.length - 1];
    if (last && s.timeS < last.timeS) this.entries.length = 0;
    if (last && s.timeS === last.timeS) this.entries.pop();
    this.entries.push(cloneSimState(s));
    const cutoff = s.timeS - this.capacitySeconds;
    let drop = 0;
    // Keep one entry at or before the cutoff so the full window stays sampleable.
    while (drop < this.entries.length - 2 && this.entries[drop + 1].timeS <= cutoff) drop += 1;
    if (this.entries.length - drop > MAX_ENTRIES) drop = this.entries.length - MAX_ENTRIES;
    if (drop > 0) this.entries.splice(0, drop);
  }

  latest(): SimState | null {
    const last = this.entries[this.entries.length - 1];
    return last ? cloneSimState(last) : null;
  }

  /**
   * State at `timeS`: linear interpolation of position, velocity and angular
   * velocity, slerp of orientation. Times outside the stored window clamp to
   * the oldest or newest entry. Null only when empty.
   */
  sampleAt(timeS: number): SimState | null {
    const list = this.entries;
    const n = list.length;
    if (n === 0) return null;
    if (!(timeS > list[0].timeS)) return cloneSimState(list[0]);
    if (timeS >= list[n - 1].timeS) return cloneSimState(list[n - 1]);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (list[mid].timeS <= timeS) lo = mid;
      else hi = mid;
    }
    const a = list[lo];
    const b = list[hi];
    const span = b.timeS - a.timeS;
    const t = span > 0 ? (timeS - a.timeS) / span : 0;
    const near = t < 0.5 ? a : b;
    return {
      ...near,
      timeS,
      position: lerpVec(a.position, b.position, t),
      velocity: lerpVec(a.velocity, b.velocity, t),
      orientation: slerp(a.orientation, b.orientation, t),
      angularVelocity: lerpVec(a.angularVelocity, b.angularVelocity, t),
      forces: cloneForces(near.forces),
      effectiveSpeedMps: a.effectiveSpeedMps + (b.effectiveSpeedMps - a.effectiveSpeedMps) * t,
      heightM: a.heightM + (b.heightM - a.heightM) * t,
      lateralOffsetM: a.lateralOffsetM + (b.lateralOffsetM - a.lateralOffsetM) * t,
      tiltDeg: a.tiltDeg + (b.tiltDeg - a.tiltDeg) * t,
      spinRps: a.spinRps + (b.spinRps - a.spinRps) * t,
      squash: a.squash + (b.squash - a.squash) * t,
      wobble: a.wobble + (b.wobble - a.wobble) * t,
    };
  }

  clear(): void {
    this.entries.length = 0;
  }
}
