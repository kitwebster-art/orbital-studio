import { describe, expect, it } from 'vitest';
import {
  LevitationSimulation,
  PRESETS,
  analyseDesign,
  eulerTilt,
  jetHalfWidth,
  normaliseDesign,
  shapeProperties,
  type DesignConfig,
} from './index';

function preset(id: string): DesignConfig {
  const found = PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(id);
  return found.design;
}

function run(sim: LevitationSimulation, seconds: number, each?: (t: number) => void): void {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i += 1) {
    sim.step(1 / 60);
    each?.(sim.state.timeS);
  }
}

describe('LevitationSimulation', () => {
  it('lifts every hovering preset off the fan and settles near the analysed height within 20 s', () => {
    for (const p of PRESETS) {
      const analysis = analyseDesign(p.design);
      if (analysis.verdict !== 'stable-hover' && analysis.verdict !== 'wobbly-hover') continue;
      const target = analysis.equilibriumHeightM ?? 0;
      const sim = new LevitationSimulation(p.design, 1);
      expect(sim.state.status, p.id).toBe('on-fan');
      const reach = analysis.properties.footprintRadiusM + jetHalfWidth(p.design.fan, target);
      let sum = 0;
      let n = 0;
      let maxOffset = 0;
      run(sim, 20, (t) => {
        const s = sim.state;
        if (t > 12) {
          sum += s.heightM;
          n += 1;
        }
        if (t > 3) maxOffset = Math.max(maxOffset, s.lateralOffsetM);
        expect(s.status, p.id).not.toBe('escaped');
      });
      const mean = sum / n;
      expect(Math.abs(mean - target) / target, `${p.id}: sim ${mean.toFixed(2)} m vs analysis ${target.toFixed(2)} m`).toBeLessThan(0.15);
      expect(maxOffset, `${p.id} stays in the jet`).toBeLessThan(reach);
      expect(['hovering', 'rising', 'falling']).toContain(sim.state.status);
    }
  });

  it('lets the Mobius ribbon tumble or escape, as the analysis predicts', () => {
    const sim = new LevitationSimulation(preset('ribbon'), 1);
    let maxTilt = 0;
    let escaped = false;
    run(sim, 20, () => {
      maxTilt = Math.max(maxTilt, sim.state.tiltDeg);
      if (sim.state.status === 'escaped') escaped = true;
    });
    expect(maxTilt > 90 || escaped).toBe(true);
  });

  it('never calls the fluttering ribbon hovering and says when it tumbles', () => {
    const sim = new LevitationSimulation(preset('ribbon'), 1);
    const seen = new Map<string, number>();
    run(sim, 40, () => seen.set(sim.state.status, (seen.get(sim.state.status) ?? 0) + 1));
    const frames = [...seen.values()].reduce((a, b) => a + b, 0);
    expect(seen.get('tumbling') ?? 0).toBeGreaterThan(0);
    // "Hovering" is a claim that the jet is holding it. Allow a sliver for the lift-off moment only.
    expect((seen.get('hovering') ?? 0) / frames).toBeLessThan(0.03);
  });

  it('keeps a fast-spinning halo from tipping under the same torque impulse (gyroscope)', () => {
    const design = preset('halo');
    const inertia = shapeProperties(design).inertiaBody;
    // Enough angular impulse to tip a still halo by tens of degrees.
    const kick = { x: inertia.x * 4, y: 0, z: 0 };
    const tiltAfterKick = (spinRps: number): number => {
      const sim = new LevitationSimulation(design, 3);
      sim.reset({ atEquilibrium: true, spinRps });
      sim.applyImpulse({ x: 0, y: 0, z: 0 }, kick);
      let maxTilt = 0;
      run(sim, 0.6, () => {
        maxTilt = Math.max(maxTilt, sim.state.tiltDeg);
      });
      return maxTilt;
    };
    const still = tiltAfterKick(0);
    const spinning = tiltAfterKick(6);
    expect(still).toBeGreaterThan(20);
    expect(spinning).toBeLessThan(still * 0.35);
    // The spin itself is measured about the body axis.
    const sim = new LevitationSimulation(design, 3);
    sim.reset({ atEquilibrium: true, spinRps: 2 });
    sim.step(1 / 60);
    expect(sim.state.spinRps).toBeGreaterThan(1.8);
  });

  it('is deterministic for a seed and varies between seeds', () => {
    const a = new LevitationSimulation(preset('home-60cm'), 7);
    const b = new LevitationSimulation(preset('home-60cm'), 7);
    const c = new LevitationSimulation(preset('home-60cm'), 8);
    run(a, 5);
    run(b, 5);
    run(c, 5);
    expect(a.state.position).toEqual(b.state.position);
    expect(a.state.orientation).toEqual(b.state.orientation);
    expect(a.state.position).not.toEqual(c.state.position);
    // Frame timing does not change the trajectory: fixed internal substeps.
    const d = new LevitationSimulation(preset('home-60cm'), 7);
    for (let i = 0; i < 150; i += 1) d.step(1 / 30);
    expect(d.state.timeS).toBeCloseTo(a.state.timeS, 9);
    expect(d.state.position.y).toBeCloseTo(a.state.position.y, 9);
    a.reset();
    expect(a.state.timeS).toBe(0);
    run(a, 5);
    expect(a.state.position).toEqual(b.state.position);
  });

  it('clamps long frames and reports a consistent state', () => {
    const sim = new LevitationSimulation(preset('shuttle'), 1);
    sim.step(5);
    expect(sim.state.timeS).toBeCloseTo(0.1, 6);
    sim.step(Number.NaN);
    sim.step(-1);
    expect(sim.state.timeS).toBeCloseTo(0.1, 6);
    run(sim, 6);
    const s = sim.state;
    expect(s.heightM).toBeCloseTo(s.position.y, 9);
    expect(s.lateralOffsetM).toBeCloseTo(Math.hypot(s.position.x, s.position.z), 9);
    expect(s.tiltDeg).toBeCloseTo((eulerTilt(s.orientation) * 180) / Math.PI, 6);
    expect(Math.hypot(s.orientation.x, s.orientation.y, s.orientation.z, s.orientation.w)).toBeCloseTo(1, 9);
    const f = s.forces;
    for (const axis of ['x', 'y', 'z'] as const) {
      const sum = f.weight[axis] + f.buoyancy[axis] + f.jet[axis] + f.centering[axis] + f.shedding[axis] + f.turbulence[axis];
      expect(f.total[axis]).toBeCloseTo(sum, 9);
    }
    expect(f.weight.y).toBeLessThan(0);
    expect(s.effectiveSpeedMps).toBeGreaterThan(0);
  });

  it('squashes and wobbles elastic skins only', () => {
    const latex = new LevitationSimulation(preset('twin'), 1);
    run(latex, 5);
    expect(latex.state.squash).toBeGreaterThan(0);
    expect(latex.state.squash).toBeLessThanOrEqual(0.25);
    expect(latex.state.wobble).toBeGreaterThan(0);
    const eps = new LevitationSimulation(preset('geode'), 1);
    run(eps, 5);
    expect(eps.state.squash).toBe(0);
    expect(eps.state.wobble).toBe(0);
  });

  it('keeps the pose when only the fan changes and resets when the body changes', () => {
    const sim = new LevitationSimulation(preset('orbital-3m'), 1);
    run(sim, 6);
    const before = sim.state.position.y;
    expect(before).toBeGreaterThan(2);
    sim.setDesign({ ...sim.design, fan: { ...sim.design.fan, outletSpeedMps: 16, turbulence: 0.6 }, ceilingM: 8 });
    expect(sim.state.position.y).toBeCloseTo(before, 6);
    expect(sim.design.fan.outletSpeedMps).toBe(16);
    sim.setDesign({ ...sim.design, sizeM: 2.5 });
    expect(sim.state.timeS).toBe(0);
    expect(sim.state.status).toBe('on-fan');
    expect(sim.state.position.y).toBeCloseTo(1.25, 2);
  });

  it('starts at the analysed hover height on request', () => {
    const design = preset('geode');
    const target = analyseDesign(design).equilibriumHeightM ?? 0;
    const sim = new LevitationSimulation(design, 2);
    sim.reset({ atEquilibrium: true });
    expect(sim.state.position.y).toBeCloseTo(target, 6);
    run(sim, 3);
    expect(Math.abs(sim.state.position.y - target) / target).toBeLessThan(0.15);
    // A design with no equilibrium falls back to resting on the fan.
    const heavy = new LevitationSimulation({ ...design, fan: { ...design.fan, outletSpeedMps: 2 } }, 2);
    heavy.reset({ atEquilibrium: true });
    expect(heavy.state.status).toBe('on-fan');
  });

  it('reports the boundary statuses', () => {
    const heavy = new LevitationSimulation({ ...preset('twin'), fan: { ...preset('twin').fan, outletSpeedMps: 3 } }, 1);
    run(heavy, 3);
    expect(heavy.state.status).toBe('on-fan');
    const blown = new LevitationSimulation({ ...preset('geode'), fan: { ...preset('geode').fan, outletSpeedMps: 12 } }, 1);
    run(blown, 8);
    expect(blown.state.status).toBe('at-ceiling');
    const helium = normaliseDesign({ shapeId: 'orb', sizeM: 1.5, materialId: 'tpu-nylon', heliumFraction: 1, fan: { diameterM: 0.4, outletSpeedMps: 0.5, type: 'axial', turbulence: 0 }, ceilingM: 8 });
    const floating = new LevitationSimulation(helium, 1);
    run(floating, 1);
    expect(floating.state.status).toBe('buoyant-drift');
    expect(floating.state.velocity.y).toBeGreaterThan(0);
  });

  it('records a rolling history', () => {
    const sim = new LevitationSimulation(preset('home-60cm'), 1);
    run(sim, 3);
    expect(sim.history.length).toBeGreaterThan(100);
    const latest = sim.history.latest();
    expect(latest?.timeS).toBeCloseTo(sim.state.timeS, 9);
    const mid = sim.history.sampleAt(sim.state.timeS - 0.5);
    expect(mid?.timeS).toBeCloseTo(sim.state.timeS - 0.5, 9);
    const span = sim.history.span;
    expect(span).not.toBeNull();
    expect((span?.end ?? 0) - (span?.start ?? 0)).toBeLessThanOrEqual(2 + 1 / 60 + 1e-9);
  });

  it('steps 60 frames in well under 15 ms', () => {
    for (const p of PRESETS) {
      const sim = new LevitationSimulation(p.design, 1);
      run(sim, 2);
      const t0 = performance.now();
      for (let i = 0; i < 60; i += 1) sim.step(1 / 60);
      expect(performance.now() - t0, p.id).toBeLessThan(15);
    }
  });
});
