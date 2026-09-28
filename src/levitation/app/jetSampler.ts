/**
 * Adapts the model's jet functions for the scene: sampleJet per particle, and
 * small lookup tables for the half-width and centreline speed, which are
 * queried many thousands of times per frame.
 */
import { jetCentrelineSpeed, jetHalfWidth, sampleJet, type FanConfig, type Vec3 } from "../model";
import type { JetFieldSampler, Vec3Like } from "../scene/airParticles";
import type { JetProfile } from "../scene/jetEnvelope";

const SAMPLES = 160;

export type JetSampler = JetFieldSampler & JetProfile;

export function createJetSampler(fan: FanConfig, maxHeightM: number): JetSampler {
  const top = Math.max(0.5, maxHeightM);
  const step = top / (SAMPLES - 1);
  const widths = new Float32Array(SAMPLES);
  const speeds = new Float32Array(SAMPLES);
  const outlet = Math.max(fan.outletSpeedMps, 1e-3);
  for (let i = 0; i < SAMPLES; i += 1) {
    const h = i * step;
    widths[i] = jetHalfWidth(fan, h);
    speeds[i] = jetCentrelineSpeed(fan, h) / outlet;
  }
  const lookup = (table: Float32Array, h: number): number => {
    if (!(h > 0)) return table[0];
    const x = h / step;
    const i = Math.floor(x);
    if (i >= SAMPLES - 1) return table[SAMPLES - 1];
    const f = x - i;
    return table[i] + (table[i + 1] - table[i]) * f;
  };
  return {
    sample(p: Vec3Like, timeS: number, out: Vec3Like): void {
      sampleJet(fan, p as Vec3, timeS, out as Vec3);
    },
    halfWidth(h: number): number {
      return h > top ? jetHalfWidth(fan, h) : lookup(widths, h);
    },
    relativeSpeed(h: number): number {
      return h > top ? jetCentrelineSpeed(fan, h) / outlet : lookup(speeds, h);
    },
  };
}
