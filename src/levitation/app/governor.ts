/**
 * Adaptive quality: step down (fewer particles, lower resolution, no bloom)
 * when frames run long, step back up after a sustained quiet spell. Pure and
 * deterministic so it can be unit tested.
 */
export interface GovernorOptions {
  tiers: number;
  /** Frame time above which we consider stepping down (ms). */
  slowMs?: number;
  /** Frame time below which we consider stepping up (ms). */
  fastMs?: number;
  /** How long frames must stay slow before stepping down (ms). */
  slowHoldMs?: number;
  /** How long frames must stay fast before stepping up (ms). */
  fastHoldMs?: number;
  /** Maximum number of step-ups, so it never oscillates forever. */
  maxRecoveries?: number;
}

export class QualityGovernor {
  private averageMs = 16.7;
  private slowFor = 0;
  private fastFor = 0;
  private cooldown = 0;
  private recoveries = 0;
  private tierValue = 0;
  private readonly slowMs: number;
  private readonly fastMs: number;
  private readonly slowHoldMs: number;
  private readonly fastHoldMs: number;
  private readonly maxRecoveries: number;

  constructor(private readonly options: GovernorOptions) {
    this.slowMs = options.slowMs ?? 22;
    this.fastMs = options.fastMs ?? 14.5;
    this.slowHoldMs = options.slowHoldMs ?? 1500;
    this.fastHoldMs = options.fastHoldMs ?? 8000;
    this.maxRecoveries = options.maxRecoveries ?? 2;
  }

  get tier(): number {
    return this.tierValue;
  }

  get frameMs(): number {
    return this.averageMs;
  }

  /** Feed one frame interval. Returns the (possibly new) tier. */
  sample(frameMs: number): number {
    // Ignore stalls from tab switches, shader compiles or debugger pauses.
    if (!(frameMs > 0) || frameMs > 250) return this.tierValue;
    this.averageMs += (frameMs - this.averageMs) * 0.06;
    this.cooldown = Math.max(0, this.cooldown - frameMs);
    if (this.averageMs > this.slowMs) {
      this.slowFor += frameMs;
      this.fastFor = 0;
    } else if (this.averageMs < this.fastMs) {
      this.fastFor += frameMs;
      this.slowFor = 0;
    } else {
      this.slowFor = 0;
      this.fastFor = 0;
    }
    if (this.cooldown === 0 && this.slowFor > this.slowHoldMs && this.tierValue < this.options.tiers - 1) {
      this.tierValue += 1;
      this.slowFor = 0;
      this.cooldown = 2500;
      this.averageMs = this.slowMs - 1;
    } else if (
      this.cooldown === 0 &&
      this.fastFor > this.fastHoldMs &&
      this.tierValue > 0 &&
      this.recoveries < this.maxRecoveries
    ) {
      this.tierValue -= 1;
      this.recoveries += 1;
      this.fastFor = 0;
      this.cooldown = 6000;
    }
    return this.tierValue;
  }

  /** Pin to a tier (used by ?quality=high|low). */
  force(tier: number): void {
    this.tierValue = Math.max(0, Math.min(this.options.tiers - 1, tier));
  }
}
