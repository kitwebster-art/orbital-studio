import { describe, expect, it } from 'vitest';
import { SHAPES, buildShapeMesh, shapeProperties, type ShapeId } from './index';
import { unitGeometry } from './geometry';

function meshStats(positions: Float32Array, indices: Uint32Array) {
  let area = 0;
  let volume6 = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const e1 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const e2 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    area += 0.5 * Math.hypot(n[0], n[1], n[2]);
    volume6 +=
      positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) -
      positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c]) +
      positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  return { area, volume: volume6 / 6 };
}

describe('buildShapeMesh', () => {
  it('builds every catalogue shape with the requested detail budget', () => {
    for (const shape of SHAPES) {
      const high = buildShapeMesh(shape.id, 1, 'high');
      const low = buildShapeMesh(shape.id, 1, 'low');
      const highTris = high.indices.length / 3;
      const lowTris = low.indices.length / 3;
      expect(highTris, `${shape.id} high`).toBeGreaterThanOrEqual(6000);
      expect(highTris, `${shape.id} high`).toBeLessThanOrEqual(20000);
      expect(lowTris, `${shape.id} low`).toBeGreaterThanOrEqual(1000);
      expect(lowTris, `${shape.id} low`).toBeLessThanOrEqual(3000);
      expect(high.positions.length).toBe(high.normals.length);
      for (const value of high.positions) expect(Number.isFinite(value)).toBe(true);
      const maxIndex = Math.max(...high.indices);
      expect(maxIndex).toBeLessThan(high.positions.length / 3);
    }
  });

  it('defaults to high detail and scales linearly with size', () => {
    const unit = buildShapeMesh('seed', 1);
    const big = buildShapeMesh('seed', 2.5);
    expect(unit.indices.length).toBe(buildShapeMesh('seed', 1, 'high').indices.length);
    for (let i = 0; i < 300; i += 1) expect(big.positions[i]).toBeCloseTo(unit.positions[i] * 2.5, 5);
  });

  it('matches an analytic sphere within 1% for area and volume', () => {
    const mesh = buildShapeMesh('orb', 2, 'high');
    const { area, volume } = meshStats(mesh.positions, mesh.indices);
    const r = 1;
    expect(Math.abs(area / (4 * Math.PI * r * r) - 1)).toBeLessThan(0.01);
    expect(Math.abs(volume / ((4 / 3) * Math.PI * r ** 3) - 1)).toBeLessThan(0.01);
    const props = shapeProperties({ shapeId: 'orb', sizeM: 2, materialId: 'pvc', heliumFraction: 0, fan: { diameterM: 0.8, outletSpeedMps: 10, type: 'plug-flowgrid', turbulence: 0.3 }, ceilingM: 9 });
    expect(Math.abs(props.surfaceAreaM2 / (4 * Math.PI) - 1)).toBeLessThan(0.01);
    expect(Math.abs(props.volumeM3 / ((4 / 3) * Math.PI) - 1)).toBeLessThan(0.01);
    expect(Math.abs(props.frontalAreaAxialM2 / Math.PI - 1)).toBeLessThan(0.01);
    expect(props.footprintRadiusM).toBeCloseTo(1, 2);
  });

  it('matches an analytic torus for the halo', () => {
    const s = 1.5;
    const R = 0.35 * s;
    const r = 0.15 * s;
    const mesh = buildShapeMesh('halo', s, 'high');
    const { area, volume } = meshStats(mesh.positions, mesh.indices);
    expect(Math.abs(area / (4 * Math.PI * Math.PI * R * r) - 1)).toBeLessThan(0.01);
    expect(Math.abs(volume / (2 * Math.PI * Math.PI * R * r * r) - 1)).toBeLessThan(0.01);
    // Seen from below the hole is open: annulus, not a disc.
    const g = unitGeometry('halo');
    expect(Math.abs(g.frontalAxial / (Math.PI * (0.5 * 0.5 - 0.2 * 0.2)) - 1)).toBeLessThan(0.01);
  });

  it('winds every triangle outward, consistent with its vertex normals', () => {
    for (const shape of SHAPES) {
      const { positions: p, normals: n, indices } = buildShapeMesh(shape.id, 1, 'low');
      let bad = 0;
      for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t] * 3;
        const b = indices[t + 1] * 3;
        const c = indices[t + 2] * 3;
        const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
        const e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
        const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const vn = [n[a] + n[b] + n[c], n[a + 1] + n[b + 1] + n[c + 1], n[a + 2] + n[b + 2] + n[c + 2]];
        if (fn[0] * vn[0] + fn[1] * vn[1] + fn[2] * vn[2] <= 0) bad += 1;
      }
      expect(bad, shape.id).toBe(0);
    }
  });

  it('points normals away from the centre on closed convex shapes', () => {
    for (const id of ['orb', 'lens', 'seed', 'geode', 'pebble'] as ShapeId[]) {
      const { positions: p, normals: n } = buildShapeMesh(id, 1, 'low');
      for (let i = 0; i < p.length; i += 3) {
        expect(p[i] * n[i] + p[i + 1] * n[i + 1] + p[i + 2] * n[i + 2], id).toBeGreaterThan(0);
      }
    }
  });

  it('gives closed shapes a positive enclosed volume and open ones none', () => {
    for (const shape of SHAPES) {
      const g = unitGeometry(shape.id);
      const open = shape.id === 'shuttle' || shape.id === 'medusa' || shape.id === 'ribbon';
      expect(g.closed, shape.id).toBe(!open);
      if (open) expect(g.volume).toBe(0);
      else expect(g.volume).toBeGreaterThan(0);
    }
  });

  it('flags render hints: flat geode facets, double-sided open surfaces, medusa strands', () => {
    expect(buildShapeMesh('geode', 1).flatShading).toBe(true);
    expect(buildShapeMesh('orb', 1).flatShading).toBe(false);
    for (const id of ['shuttle', 'medusa', 'ribbon'] as ShapeId[]) expect(buildShapeMesh(id, 1).doubleSided, id).toBe(true);
    for (const id of ['orb', 'halo', 'twin', 'geode'] as ShapeId[]) expect(buildShapeMesh(id, 1).doubleSided, id).toBe(false);
    const medusa = buildShapeMesh('medusa', 2);
    expect(medusa.strands).toBeDefined();
    const strands = medusa.strands ?? [];
    expect(strands.length).toBeGreaterThanOrEqual(8);
    expect(strands.length).toBeLessThanOrEqual(12);
    for (const line of strands) {
      expect(line.length % 3).toBe(0);
      expect(line.length / 3).toBeGreaterThan(5);
      // Strands hang below the dome.
      expect(line[line.length - 2]).toBeLessThan(line[1]);
    }
    expect(buildShapeMesh('orb', 1).strands).toBeUndefined();
  });

  it('honours the size convention: largest horizontal extent and centred on the geometric centre', () => {
    for (const shape of SHAPES) {
      const g = unitGeometry(shape.id);
      expect(g.maxHorizontalRadius, shape.id).toBeGreaterThan(0.46);
      expect(g.maxHorizontalRadius, shape.id).toBeLessThan(0.52);
      expect(g.minY + g.maxY, shape.id).toBeCloseTo(0, 6);
    }
  });

  it('computes shell inertia from the mesh (thin spherical shell = 2/3 m r^2)', () => {
    const props = shapeProperties({ shapeId: 'orb', sizeM: 1, materialId: 'pvc', heliumFraction: 0, fan: { diameterM: 0.5, outletSpeedMps: 5, type: 'axial', turbulence: 0.3 }, ceilingM: 4 });
    const expected = (2 / 3) * props.massKg * 0.25;
    expect(props.inertiaBody.x / expected).toBeCloseTo(1, 2);
    expect(props.inertiaBody.y / expected).toBeCloseTo(1, 2);
  });
});
