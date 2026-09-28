import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  analyseDesign,
  levitationEnvelope,
  normaliseDesign,
  shapeProperties,
  type DesignConfig,
  type Verdict,
} from './index';

function preset(id: string): DesignConfig {
  const found = PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(id);
  return found.design;
}

const EXPECTED: Record<string, { verdict: Verdict; height?: [number, number] }> = {
  'orbital-3m': { verdict: 'stable-hover', height: [2, 3] },
  'home-60cm': { verdict: 'stable-hover', height: [1.2, 2.2] },
  halo: { verdict: 'stable-hover', height: [2, 3.5] },
  shuttle: { verdict: 'stable-hover', height: [1.5, 3.2] },
  medusa: { verdict: 'stable-hover', height: [2.5, 4.5] },
  geode: { verdict: 'stable-hover', height: [2, 3.5] },
  twin: { verdict: 'wobbly-hover', height: [0.9, 1.8] },
  ribbon: { verdict: 'unstable-tumble' },
};

describe('analyseDesign', () => {
  it('gives every preset its intended outcome', () => {
    for (const p of PRESETS) {
      const a = analyseDesign(p.design);
      const expected = EXPECTED[p.id];
      expect(a.verdict, p.id).toBe(expected.verdict);
      if (expected.height) {
        expect(a.equilibriumHeightM, p.id).not.toBeNull();
        expect(a.equilibriumHeightM ?? 0, p.id).toBeGreaterThan(expected.height[0]);
        expect(a.equilibriumHeightM ?? 0, p.id).toBeLessThan(expected.height[1]);
        expect(a.liftMargin, p.id).toBeGreaterThan(1);
        expect(a.swayAmplitudeM, p.id).not.toBeNull();
        expect(a.verticalHz ?? 0, p.id).toBeGreaterThan(0);
      }
      expect(a.minimumOutletSpeedMps ?? Infinity, p.id).toBeLessThan(p.design.fan.outletSpeedMps);
      expect(a.verdictLabel.length).toBeGreaterThan(3);
      expect(a.summary.length).toBeGreaterThan(10);
      expect(a.reasons.length).toBeGreaterThan(2);
      for (const text of [a.summary, a.verdictLabel, ...a.reasons]) expect(text).not.toContain('—');
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
      expect(a.projectionScore).toBeGreaterThanOrEqual(0);
      expect(a.projectionScore).toBeLessThanOrEqual(100);
      expect(a.trackingScore).toBeGreaterThanOrEqual(0);
      expect(a.trackingScore).toBeLessThanOrEqual(100);
      expect(a.fan.flowM3s).toBeGreaterThan(0);
    }
  });

  it('models the Orbital sphere with its real-world mass and a sensitive hover', () => {
    const a = analyseDesign(preset('orbital-3m'));
    expect(a.properties.massKg).toBeGreaterThan(7.5);
    expect(a.properties.massKg).toBeLessThan(9.5);
    // Sealed air weighs what it displaces, so only the skin has to be held up.
    expect(a.properties.netWeightN).toBeCloseTo(a.properties.massKg * 9.81, 3);
    expect(a.tiltStability).toBe('neutral');
    // A little more fan speed lifts it markedly: the wide-body, narrow-jet regime.
    const faster = analyseDesign({ ...preset('orbital-3m'), fan: { ...preset('orbital-3m').fan, outletSpeedMps: 16.3 } });
    expect((faster.equilibriumHeightM ?? 0) - (a.equilibriumHeightM ?? 0)).toBeGreaterThan(0.5);
    // Well above the preset speed the jet pins it to the ceiling.
    const blown = analyseDesign({ ...preset('orbital-3m'), fan: { ...preset('orbital-3m').fan, outletSpeedMps: 22 } });
    expect(blown.verdict).toBe('blown-to-ceiling');
    expect(blown.equilibriumHeightM).toBeNull();
    const weak = analyseDesign({ ...preset('orbital-3m'), fan: { ...preset('orbital-3m').fan, outletSpeedMps: 10 } });
    expect(weak.verdict).toBe('too-heavy');
    expect(weak.liftMargin).toBeLessThan(1);
    expect(weak.minimumOutletSpeedMps ?? 0).toBeGreaterThan(10);
  });

  it('needs more air for a heavier skin', () => {
    const base: DesignConfig = normaliseDesign({ shapeId: 'orb', sizeM: 1, materialId: 'latex', fan: { diameterM: 0.5, outletSpeedMps: 6, type: 'axial-straightened', turbulence: 0.3 }, ceilingM: 4 });
    const light = analyseDesign(base);
    const heavy = analyseDesign({ ...base, materialId: 'pvc' });
    expect(heavy.properties.shellMassKg).toBeGreaterThan(light.properties.shellMassKg);
    expect(heavy.minimumOutletSpeedMps ?? 0).toBeGreaterThan((light.minimumOutletSpeedMps ?? 0) * 1.3);
  });

  it('lightens inflatables with helium until they float', () => {
    const base = normaliseDesign({ shapeId: 'orb', sizeM: 1.5, materialId: 'tpu-nylon', heliumFraction: 0, fan: { diameterM: 0.5, outletSpeedMps: 4, type: 'axial', turbulence: 0.3 }, ceilingM: 4 });
    const air = shapeProperties(base);
    const half = shapeProperties({ ...base, heliumFraction: 0.5 });
    const full = shapeProperties({ ...base, heliumFraction: 1 });
    expect(half.netWeightN).toBeLessThan(air.netWeightN);
    expect(full.netWeightN).toBeLessThan(half.netWeightN);
    const drop = air.netWeightN - full.netWeightN;
    expect(drop).toBeCloseTo(air.volumeM3 * (1.204 - 0.166) * 9.81, 3);
    const floating = analyseDesign({ ...base, heliumFraction: 1 });
    expect(floating.verdict).toBe('buoyant');
    expect(floating.equilibriumHeightM).toBeNull();
    // Non-inflatable shapes cannot take helium.
    const geode = shapeProperties(normaliseDesign({ shapeId: 'geode', materialId: 'tyvek', heliumFraction: 1 }));
    expect(geode.enclosedGasKg).toBeCloseTo(geode.volumeM3 * 1.204, 6);
  });

  it('lets flat shapes tumble only when they are much wider than the jet', () => {
    const fan = { diameterM: 0.5, outletSpeedMps: 3, type: 'axial-straightened' as const, turbulence: 0.3 };
    for (const shapeId of ['lens', 'pebble'] as const) {
      const env = levitationEnvelope(
        normaliseDesign({ shapeId, materialId: 'tyvek', sizeM: 1, fan, ceilingM: 5 }),
        [1.6, 2.2, 2.8, 3.4, 4],
        [0.3, 1.2, 1.8],
      );
      const small = env.cells[0].map((c) => c.verdict);
      const wide = [...env.cells[1], ...env.cells[2]].map((c) => c.verdict);
      expect(small.some((v) => v === 'stable-hover' || v === 'wobbly-hover'), `${shapeId} small`).toBe(true);
      expect(small.includes('unstable-tumble'), `${shapeId} small`).toBe(false);
      expect(wide.includes('unstable-tumble'), `${shapeId} wide`).toBe(true);
    }
    // A weighted shuttle stays upright, a symmetric sphere is neutral.
    expect(analyseDesign(preset('shuttle')).tiltStability).toBe('stable');
    expect(analyseDesign(preset('home-60cm')).tiltStability).toBe('neutral');
  });

  it('explains the verdict in plain sentences', () => {
    const ribbon = analyseDesign(preset('ribbon'));
    expect(ribbon.reasons.join(' ')).toMatch(/lopsided/);
    expect(ribbon.projectionScore).toBeLessThan(20);
    const orbital = analyseDesign(preset('orbital-3m'));
    expect(orbital.reasons.join(' ')).toMatch(/ground effect/);
    expect(orbital.projectionScore).toBeGreaterThan(75);
    expect(orbital.trackingScore).toBeGreaterThan(75);
    const twin = analyseDesign(preset('twin'));
    expect(twin.summary).toMatch(/rocks/);
  });

  it('sweeps an envelope from the analysis alone, quickly', () => {
    const speeds = Array.from({ length: 24 }, (_, i) => 1 + i);
    const sizes = Array.from({ length: 16 }, (_, i) => 0.2 + i * 0.3);
    levitationEnvelope(preset('halo'), speeds.slice(0, 2), sizes.slice(0, 2));
    for (const p of PRESETS) {
      // Fastest of three runs: the budget is about the code, not about whatever
      // else the machine is doing while the suite runs.
      let elapsed = Infinity;
      let env = levitationEnvelope(p.design, speeds, sizes);
      for (let run = 0; run < 3; run += 1) {
        const t0 = performance.now();
        env = levitationEnvelope(p.design, speeds, sizes);
        elapsed = Math.min(elapsed, performance.now() - t0);
      }
      expect(elapsed, p.id).toBeLessThan(150);
      expect(env.cells.length).toBe(16);
      for (const row of env.cells) expect(row.length).toBe(24);
      expect(env.speedsMps).toEqual(speeds);
      expect(env.sizesM).toEqual(sizes);
    }
    const env = levitationEnvelope(preset('orbital-3m'), [8, 15.5, 25], [3]);
    expect(env.cells[0].map((c) => c.verdict)).toEqual(['too-heavy', 'stable-hover', 'blown-to-ceiling']);
  });
});
