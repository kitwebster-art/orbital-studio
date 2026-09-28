import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESIGN,
  MATERIALS,
  PRESETS,
  SHAPES,
  getMaterial,
  getShape,
  isMaterialCompatible,
  normaliseDesign,
  type MaterialId,
  type ShapeId,
} from './index';

const ALL_SHAPES: ShapeId[] = ['orb', 'lens', 'seed', 'halo', 'geode', 'pebble', 'shuttle', 'medusa', 'twin', 'ribbon'];
const ALL_MATERIALS: MaterialId[] = ['latex', 'pvc', 'tpu-nylon', 'silnylon', 'tyvek', 'washi-carbon', 'mylar', 'eps-shell'];

describe('catalogue', () => {
  it('lists every shape and material exactly once with complete copy', () => {
    expect(SHAPES.map((s) => s.id).sort()).toEqual([...ALL_SHAPES].sort());
    expect(MATERIALS.map((m) => m.id).sort()).toEqual([...ALL_MATERIALS].sort());
    for (const shape of SHAPES) {
      for (const text of [shape.name, shape.tagline, shape.description, shape.projectionNotes, shape.trackingNotes, shape.fabricationNotes]) {
        expect(text.length).toBeGreaterThanOrEqual(3);
        expect(text).not.toContain('—');
      }
      expect(shape.strouhal).toBeGreaterThanOrEqual(0.12);
      expect(shape.strouhal).toBeLessThanOrEqual(0.25);
      expect(shape.smoothness).toBeGreaterThanOrEqual(0);
      expect(shape.convexity).toBeLessThanOrEqual(1);
    }
    for (const material of MATERIALS) {
      expect(material.arealDensityGsm).toBeGreaterThan(10);
      expect(material.reflectance).toBeGreaterThanOrEqual(0);
      expect(material.reflectance).toBeLessThanOrEqual(1);
      expect(material.projectionNotes).not.toContain('—');
    }
  });

  it('uses realistic skin data', () => {
    expect(getMaterial('latex').arealDensityGsm).toBeCloseTo(90, 0);
    expect(getMaterial('pvc').arealDensityGsm).toBeCloseTo(250, 0);
    expect(getMaterial('tpu-nylon').arealDensityGsm).toBeCloseTo(55, 0);
    expect(getMaterial('silnylon').arealDensityGsm).toBeCloseTo(40, 0);
    expect(getMaterial('tyvek').arealDensityGsm).toBeCloseTo(43, 0);
    expect(getMaterial('washi-carbon').arealDensityGsm).toBeCloseTo(25, 0);
    expect(getMaterial('washi-carbon').overheadFactor).toBeGreaterThan(1.3);
    expect(getMaterial('mylar').arealDensityGsm).toBeCloseTo(17, 0);
    expect(getMaterial('mylar').gloss).toBeCloseTo(0.95, 2);
    expect(getMaterial('eps-shell').arealDensityGsm).toBeCloseTo(80, 0);
    expect(getMaterial('eps-shell').elasticity).toBe(0);
  });

  it('encodes the fabrication rules for compatibility', () => {
    const latex = ALL_SHAPES.filter((s) => isMaterialCompatible('latex', s));
    expect(latex.sort()).toEqual(['lens', 'orb', 'seed', 'twin']);
    const washi = ALL_SHAPES.filter((s) => isMaterialCompatible('washi-carbon', s));
    expect(washi.sort()).toEqual(['geode', 'halo', 'pebble', 'shuttle']);
    expect(isMaterialCompatible('eps-shell', 'ribbon')).toBe(false);
    expect(isMaterialCompatible('eps-shell', 'medusa')).toBe(false);
    for (const s of ALL_SHAPES.filter((id) => id !== 'ribbon' && id !== 'medusa')) {
      expect(isMaterialCompatible('eps-shell', s), s).toBe(true);
    }
    expect(isMaterialCompatible('mylar', 'ribbon')).toBe(true);
    expect(isMaterialCompatible('mylar', 'geode')).toBe(false);
    expect(isMaterialCompatible('tpu-nylon', 'medusa')).toBe(true);
    expect(getShape('geode').inflatable).toBe(false);
    expect(getShape('orb').inflatable).toBe(true);
  });

  it('ships eight presets whose designs are already valid', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['orbital-3m', 'home-60cm', 'halo', 'shuttle', 'medusa', 'geode', 'twin', 'ribbon']);
    for (const preset of PRESETS) {
      expect(normaliseDesign(preset.design)).toEqual(preset.design);
      expect(isMaterialCompatible(preset.design.materialId, preset.design.shapeId)).toBe(true);
    }
    const orbital = PRESETS[0].design;
    expect(orbital.shapeId).toBe('orb');
    expect(orbital.sizeM).toBe(3);
    expect(orbital.materialId).toBe('pvc');
    expect(orbital.fan.diameterM).toBe(0.8);
    expect(orbital.fan.type).toBe('plug-flowgrid');
    expect(DEFAULT_DESIGN).toEqual(orbital);
    expect(DEFAULT_DESIGN).not.toBe(orbital);
  });

  it('normalises partial and out-of-range designs', () => {
    expect(normaliseDesign({})).toEqual(DEFAULT_DESIGN);
    const wild = normaliseDesign({
      shapeId: 'geode',
      sizeM: 99,
      materialId: 'latex',
      heliumFraction: 3,
      fan: { diameterM: 0.01, outletSpeedMps: 400, turbulence: -2 },
      ceilingM: 1,
    });
    expect(wild.sizeM).toBe(5);
    expect(wild.materialId).not.toBe('latex');
    expect(isMaterialCompatible(wild.materialId, 'geode')).toBe(true);
    expect(wild.heliumFraction).toBe(0);
    expect(wild.fan.diameterM).toBe(0.2);
    expect(wild.fan.outletSpeedMps).toBe(30);
    expect(wild.fan.turbulence).toBe(0);
    expect(wild.fan.type).toBe(DEFAULT_DESIGN.fan.type);
    expect(wild.ceilingM).toBeGreaterThanOrEqual(5 + 0.3);
    const helium = normaliseDesign({ shapeId: 'orb', materialId: 'latex', sizeM: 1, heliumFraction: 0.6 });
    expect(helium.heliumFraction).toBeCloseTo(0.6, 6);
    const tyvekOrb = normaliseDesign({ shapeId: 'orb', materialId: 'tyvek', heliumFraction: 0.6 });
    expect(tyvekOrb.heliumFraction).toBe(0);
    const bogus = normaliseDesign({ shapeId: 'cube' as ShapeId, sizeM: Number.NaN, fan: { type: 'jet' as never } });
    expect(bogus.shapeId).toBe(DEFAULT_DESIGN.shapeId);
    expect(bogus.sizeM).toBe(DEFAULT_DESIGN.sizeM);
    expect(bogus.fan.type).toBe(DEFAULT_DESIGN.fan.type);
  });
});
