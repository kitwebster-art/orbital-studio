import { describe, expect, it } from 'vitest';
import {
  RHO_AIR,
  fanDerived,
  jetCentrelineSpeed,
  jetHalfWidth,
  jetMomentumFlux,
  sampleJet,
  type FanConfig,
} from './index';

const plug: FanConfig = { diameterM: 0.8, outletSpeedMps: 15, type: 'plug-flowgrid', turbulence: 0.3 };
const axial: FanConfig = { diameterM: 0.4, outletSpeedMps: 5, type: 'axial', turbulence: 0.5 };

/** rho * integral of u_y^2 and integral of u_y over a large disc at height h. */
function fluxes(fan: FanConfig, h: number): { momentum: number; volume: number } {
  const R = 4 * jetHalfWidth(fan, h) + 0.2 * fan.diameterM;
  const nr = 240;
  const nt = 24;
  const p = { x: 0, y: h, z: 0 };
  const out = { x: 0, y: 0, z: 0 };
  let momentum = 0;
  let volume = 0;
  for (let i = 0; i < nr; i += 1) {
    const r = ((i + 0.5) / nr) * R;
    const dA = (2 * Math.PI * r * (R / nr)) / nt;
    for (let j = 0; j < nt; j += 1) {
      const th = (2 * Math.PI * j) / nt;
      p.x = r * Math.cos(th);
      p.z = r * Math.sin(th);
      sampleJet(fan, p, 0, out);
      momentum += RHO_AIR * out.y * out.y * dA;
      volume += out.y * dA;
    }
  }
  return { momentum, volume };
}

describe('fan jet', () => {
  it('derives fan quantities from the outlet', () => {
    const d = fanDerived(plug);
    const area = (Math.PI * 0.8 * 0.8) / 4;
    expect(d.outletAreaM2).toBeCloseTo(area, 6);
    expect(d.flowM3s).toBeCloseTo(15 * area, 6);
    expect(d.momentumFluxN).toBeCloseTo(RHO_AIR * 15 * area * 15, 6);
    expect(d.airPowerW).toBeCloseTo(0.5 * RHO_AIR * 15 * area * 225, 6);
    expect(d.electricalPowerW).toBeCloseTo(d.airPowerW / 0.55, 6);
    expect(d.approxRpm).toBeCloseTo((15 / (0.33 * Math.PI * 0.8)) * 60, 6);
    expect(d.coreLengthM).toBeCloseTo(5.5 * 0.8, 6);
    expect(d.swirlRatio).toBeCloseTo(0.08, 6);
    expect(d.turbulenceIntensity).toBeCloseTo(0.08 * (0.5 + 1.5 * 0.3), 6);
    expect(fanDerived(axial).coreLengthM).toBeCloseTo(4 * 0.4, 6);
    expect(fanDerived({ ...axial, type: 'axial-straightened' }).swirlRatio).toBeCloseTo(0.05, 6);
  });

  it('holds the outlet speed through the core and decays continuously beyond it', () => {
    const Lc = 5.5 * 0.8;
    expect(jetCentrelineSpeed(plug, 0)).toBeCloseTo(15, 6);
    expect(jetCentrelineSpeed(plug, 0.9 * Lc)).toBeCloseTo(15, 6);
    const below = jetCentrelineSpeed(plug, Lc - 1e-6);
    const above = jetCentrelineSpeed(plug, Lc + 1e-6);
    expect(Math.abs(below - above)).toBeLessThan(1e-3);
    expect(Math.abs(jetHalfWidth(plug, Lc - 1e-6) - jetHalfWidth(plug, Lc + 1e-6))).toBeLessThan(1e-4);
    let previous = Infinity;
    for (let h = Lc; h < 40 * 0.8; h += 0.25) {
      const u = jetCentrelineSpeed(plug, h);
      expect(u).toBeLessThanOrEqual(previous + 1e-9);
      previous = u;
    }
    // Far field approaches U0 * Lc / h (within 20%).
    const far = 30 * 0.8;
    expect(jetCentrelineSpeed(plug, far) / ((15 * Lc) / far)).toBeGreaterThan(0.8);
    expect(jetCentrelineSpeed(plug, far) / ((15 * Lc) / far)).toBeLessThan(1.2);
    // Half-width starts at the outlet radius and spreads at about 0.094 + 0.03 * swirl.
    expect(jetHalfWidth(plug, 0)).toBeCloseTo(0.4, 6);
    const slope = (jetHalfWidth(plug, 20) - jetHalfWidth(plug, 10)) / 10;
    expect(slope).toBeCloseTo(0.094 + 0.03 * 0.08, 4);
  });

  it('conserves momentum flux with height and entrains air', () => {
    for (const fan of [plug, axial]) {
      const heights = [0.001, 1, 3, 5.5, 10, 20].map((k) => k * fan.diameterM);
      const results = heights.map((h) => fluxes(fan, h));
      const m0 = results[0].momentum;
      for (const r of results) expect(Math.abs(r.momentum / m0 - 1)).toBeLessThan(0.05);
      // Analytic momentum flux of the profile model agrees with the numerical one.
      expect(Math.abs(jetMomentumFlux(fan) / m0 - 1)).toBeLessThan(0.03);
      // Roughly the nominal rho Q U0 (the outlet profile is a slightly rounded top hat).
      expect(m0 / fanDerived(fan).momentumFluxN).toBeGreaterThan(0.8);
      expect(m0 / fanDerived(fan).momentumFluxN).toBeLessThan(1.0);
      // Continuity: the outlet carries the fan's flow; entrainment only adds to it.
      expect(Math.abs(results[0].volume / fanDerived(fan).flowM3s - 1)).toBeLessThan(0.03);
      for (let i = 1; i < results.length; i += 1) {
        expect(results[i].volume).toBeGreaterThanOrEqual(results[i - 1].volume * 0.999);
      }
    }
  });

  it('samples swirl, entrainment and nothing below the outlet, without allocating', () => {
    const out = { x: 9, y: 9, z: 9 };
    expect(sampleJet(axial, { x: 0.1, y: -0.01, z: 0 }, 0, out)).toBe(out);
    expect(out).toEqual({ x: 0, y: 0, z: 0 });
    const r = 0.15;
    const v = sampleJet(axial, { x: r, y: 0.3, z: 0 }, 0, { x: 0, y: 0, z: 0 });
    expect(v.y).toBeGreaterThan(0);
    // Right-handed swirl about +Y: at +X the air moves toward -Z.
    expect(v.z).toBeLessThan(0);
    // Entrainment draws air toward the axis.
    expect(v.x).toBeLessThan(0);
    const straight = sampleJet({ ...axial, type: 'axial-straightened' }, { x: r, y: 0.3, z: 0 });
    expect(Math.abs(straight.z)).toBeLessThan(Math.abs(v.z));
    const far = sampleJet(axial, { x: 3, y: 0.5, z: 0 });
    expect(Math.hypot(far.x, far.y, far.z)).toBeLessThan(1e-6);
    // The axis wanders slowly with time, but only by a few percent of the outlet.
    const a = sampleJet(plug, { x: 0.3, y: 3, z: 0 }, 0);
    const b = sampleJet(plug, { x: 0.3, y: 3, z: 0 }, 4);
    expect(a.y).not.toBeCloseTo(b.y, 6);
    expect(Math.abs(a.y - b.y) / a.y).toBeLessThan(0.25);
  });

  it('is fast enough for 12k particles per frame', () => {
    const p = { x: 0, y: 0, z: 0 };
    const out = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 12000; i += 1) sampleJet(plug, p, 0, out);
    const t0 = performance.now();
    for (let i = 0; i < 12000; i += 1) {
      p.x = ((i % 100) - 50) * 0.02;
      p.y = (i / 12000) * 8;
      p.z = 0.05;
      sampleJet(plug, p, 1.5, out);
    }
    expect(performance.now() - t0).toBeLessThan(12);
  });
});
