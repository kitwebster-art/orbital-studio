import { describe, expect, it } from 'vitest';
import {
  eulerTilt,
  quatFromAxisAngle,
  quatFromTilt,
  quatIntegrate,
  quatMultiply,
  quatRotate,
  quatRotateInverse,
  quatUp,
  slerp,
} from './index';
import { createRng, gamma } from './math';

describe('math helpers', () => {
  it('rotates vectors with quaternions both ways', () => {
    const q = quatFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2);
    const v = quatRotate(q, { x: 1, y: 0, z: 0 });
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(1, 9);
    const back = quatRotateInverse(q, v);
    expect(back.x).toBeCloseTo(1, 9);
    expect(back.y).toBeCloseTo(0, 9);
    const both = quatMultiply(q, q);
    expect(quatRotate(both, { x: 1, y: 0, z: 0 }).x).toBeCloseTo(-1, 9);
  });

  it('measures tilt from the body up axis and leans in the requested direction', () => {
    expect(eulerTilt({ x: 0, y: 0, z: 0, w: 1 })).toBeCloseTo(0, 12);
    const spinOnly = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, 1.3);
    expect(eulerTilt(spinOnly)).toBeCloseTo(0, 9);
    const tilted = quatFromTilt(0.4, Math.PI / 2, 0.7);
    expect(eulerTilt(tilted)).toBeCloseTo(0.4, 9);
    const up = quatUp(tilted);
    expect(up.z).toBeCloseTo(Math.sin(0.4), 9);
    expect(up.x).toBeCloseTo(0, 9);
    expect(eulerTilt(quatFromTilt(Math.PI, 0))).toBeCloseTo(Math.PI, 6);
  });

  it('slerps along the short arc and integrates angular velocity exactly', () => {
    const a = quatFromAxisAngle({ x: 1, y: 0, z: 0 }, 0);
    const b = quatFromAxisAngle({ x: 1, y: 0, z: 0 }, 1);
    const m = slerp(a, b, 0.25);
    expect(2 * Math.acos(m.w)).toBeCloseTo(0.25, 9);
    const negB = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
    expect(slerp(a, negB, 0.5).w).toBeCloseTo(Math.cos(0.25), 9);
    let q = { x: 0, y: 0, z: 0, w: 1 };
    for (let i = 0; i < 100; i += 1) q = quatIntegrate(q, { x: 0, y: 2, z: 0 }, 0.01);
    const expected = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, 2);
    expect(q.y).toBeCloseTo(expected.y, 9);
    expect(q.w).toBeCloseTo(expected.w, 9);
  });

  it('has reproducible random numbers and sound special functions', () => {
    const r1 = createRng(42);
    const r2 = createRng(42);
    for (let i = 0; i < 10; i += 1) expect(r1.gaussian()).toBe(r2.gaussian());
    const r = createRng(1);
    let sum = 0;
    let sumSq = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      const g = r.gaussian();
      sum += g;
      sumSq += g * g;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.03);
    expect(sumSq / n).toBeCloseTo(1, 1);
    expect(gamma(5)).toBeCloseTo(24, 5);
    expect(gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 6);
  });
});
