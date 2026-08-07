import type { PerformanceSnapshot } from "./performanceMonitor";

export const RENDER_QUALITY_MODES = [
  "adaptive",
  "high",
  "balanced",
  "low",
] as const;
export type RenderQualityMode = (typeof RENDER_QUALITY_MODES)[number];

export const RENDER_QUALITY_TIERS = ["high", "balanced", "low"] as const;
export type RenderQualityTier = (typeof RENDER_QUALITY_TIERS)[number];

export type RenderQualityStatus = "warming" | "stable" | "over-budget";

export interface RenderQualityProfile {
  id: RenderQualityTier;
  label: string;
  maxPixelRatio: number;
  shadows: boolean;
  description: string;
}

export interface RenderQualitySnapshot {
  requested: RenderQualityMode;
  effective: RenderQualityTier;
  status: RenderQualityStatus;
  p95FrameTimeMs: number;
  targetFrameTimeMs: number;
  transitions: number;
}

export const RENDER_QUALITY_PROFILES: Readonly<
  Record<RenderQualityTier, RenderQualityProfile>
> = Object.freeze({
  high: Object.freeze({
    id: "high",
    label: "High",
    maxPixelRatio: 2,
    shadows: true,
    description: "Full preview pixel density and soft room shadows.",
  }),
  balanced: Object.freeze({
    id: "balanced",
    label: "Balanced",
    maxPixelRatio: 1.25,
    shadows: true,
    description: "Lower preview pixel density while retaining room shadows.",
  }),
  low: Object.freeze({
    id: "low",
    label: "Low",
    maxPixelRatio: 1,
    shadows: false,
    description: "Authoring fallback with shadows disabled for a lighter preview.",
  }),
});

const DOWNGRADE_AFTER_S = 1.5;
const UPGRADE_AFTER_S = 8;
const TARGET_FRAME_TIME_MS = 1_000 / 60;

function isRenderQualityMode(value: unknown): value is RenderQualityMode {
  return (
    value === "adaptive" ||
    value === "high" ||
    value === "balanced" ||
    value === "low"
  );
}

function isRenderQualityTier(value: unknown): value is RenderQualityTier {
  return value === "high" || value === "balanced" || value === "low";
}

export function normaliseRenderQualityMode(value: unknown): RenderQualityMode {
  return isRenderQualityMode(value) ? value : "adaptive";
}

export function getRenderQualityProfile(
  tier: RenderQualityTier,
): RenderQualityProfile {
  return RENDER_QUALITY_PROFILES[tier];
}

function nextLowerTier(tier: RenderQualityTier): RenderQualityTier {
  return tier === "high" ? "balanced" : "low";
}

function nextHigherTier(tier: RenderQualityTier): RenderQualityTier {
  return tier === "low" ? "balanced" : "high";
}

function statusFor(metrics: PerformanceSnapshot): RenderQualityStatus {
  if (metrics.frameTimeMs <= 0) {
    return "warming";
  }
  return metrics.p95FrameTimeMs > metrics.targetFrameTimeMs * 2
    ? "over-budget"
    : "stable";
}

/**
 * Renderer-edge policy. It deliberately knows nothing about Three.js, cameras,
 * projectors, audio, or hardware. Adaptive changes are time-gated to avoid a
 * visible quality oscillation when a browser briefly stalls.
 */
export class RenderQualityGovernor {
  private requested: RenderQualityMode = "adaptive";
  private effective: RenderQualityTier = "balanced";
  private overBudgetS = 0;
  private stableS = 0;
  private transitions = 0;

  public setMode(value: RenderQualityMode): RenderQualitySnapshot {
    this.requested = normaliseRenderQualityMode(value);
    this.overBudgetS = 0;
    this.stableS = 0;
    if (isRenderQualityTier(this.requested)) {
      if (this.effective !== this.requested) {
        this.effective = this.requested;
        this.transitions += 1;
      }
    }
    return this.snapshot();
  }

  public update(
    metrics: PerformanceSnapshot,
    deltaS: number,
  ): RenderQualitySnapshot {
    if (!Number.isFinite(deltaS) || deltaS < 0) {
      throw new Error("deltaS must be a finite non-negative number");
    }

    if (this.requested === "adaptive") {
      const status = statusFor(metrics);
      if (status === "over-budget") {
        this.overBudgetS += deltaS;
        this.stableS = 0;
        if (this.overBudgetS >= DOWNGRADE_AFTER_S && this.effective !== "low") {
          this.effective = nextLowerTier(this.effective);
          this.overBudgetS = 0;
          this.transitions += 1;
        }
      } else if (status === "stable") {
        this.stableS += deltaS;
        this.overBudgetS = 0;
        if (this.stableS >= UPGRADE_AFTER_S && this.effective !== "high") {
          this.effective = nextHigherTier(this.effective);
          this.stableS = 0;
          this.transitions += 1;
        }
      } else {
        this.overBudgetS = 0;
        this.stableS = 0;
      }
    }

    return this.snapshot(metrics);
  }

  public snapshot(metrics?: PerformanceSnapshot): RenderQualitySnapshot {
    return {
      requested: this.requested,
      effective: this.effective,
      status: metrics ? statusFor(metrics) : "warming",
      p95FrameTimeMs: metrics?.p95FrameTimeMs ?? 0,
      targetFrameTimeMs: metrics?.targetFrameTimeMs ?? TARGET_FRAME_TIME_MS,
      transitions: this.transitions,
    };
  }
}
