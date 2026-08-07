export interface MotionQueryState {
  matches?: boolean;
}

export interface MotionSample {
  timeS: number;
  deltaS: number;
}

/** Read the platform preference without assuming matchMedia exists in tests. */
export function prefersReducedMotion(
  query: MotionQueryState | null | undefined,
): boolean {
  return query?.matches === true;
}

/** Freeze decorative time-based movement while preserving live state updates. */
export function sampleMotion(
  timeS: number,
  deltaS: number,
  reducedMotion: boolean,
): MotionSample {
  if (reducedMotion) {
    return { timeS: 0, deltaS: 0 };
  }
  return {
    timeS: Number.isFinite(timeS) ? Math.max(0, timeS) : 0,
    deltaS: Number.isFinite(deltaS) ? Math.max(0, deltaS) : 0,
  };
}
