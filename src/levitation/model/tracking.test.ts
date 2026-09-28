import { describe, expect, it } from 'vitest';
import {
  MAX_PREDICTION_TRAVEL_M,
  StateHistory,
  buildShapeMesh,
  observeSilhouette,
  projectionPose,
  quatFromAxisAngle,
  quatFromTilt,
  transformPoints,
  type Quat,
  type SimState,
  type Vec3,
  type VirtualCamera,
} from './index';

const camera: VirtualCamera = {
  position: { x: 0, y: 2, z: 6 },
  target: { x: 0, y: 2, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  verticalFovDeg: 50,
  widthPx: 1280,
  heightPx: 720,
};

function state(timeS: number, position: Vec3, velocity: Vec3, orientation: Quat = { x: 0, y: 0, z: 0, w: 1 }): SimState {
  const zero = { x: 0, y: 0, z: 0 };
  return {
    timeS,
    position,
    velocity,
    orientation,
    angularVelocity: zero,
    forces: { weight: zero, buoyancy: zero, jet: zero, centering: zero, shedding: zero, turbulence: zero, total: zero },
    status: 'hovering',
    effectiveSpeedMps: 3,
    heightM: position.y,
    lateralOffsetM: Math.hypot(position.x, position.z),
    tiltDeg: 0,
    spinRps: 0,
    squash: 0,
    wobble: 0,
  };
}

/** A body moving at constant velocity, recorded at 60 Hz. */
function movingHistory(velocity: Vec3, seconds = 2): StateHistory {
  const history = new StateHistory(2);
  for (let i = 0; i <= seconds * 60; i += 1) {
    const t = i / 60;
    history.push(state(t, { x: velocity.x * t, y: 2 + velocity.y * t, z: velocity.z * t }, velocity));
  }
  return history;
}

describe('observeSilhouette', () => {
  it('sees a sphere as a circle of the right pixel diameter', () => {
    const mesh = buildShapeMesh('orb', 1, 'high');
    const world = transformPoints(mesh.positions, { x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 0);
    const ellipse = observeSilhouette(world, camera);
    expect(ellipse).not.toBeNull();
    if (!ellipse) return;
    const focal = 360 / Math.tan((25 * Math.PI) / 180);
    const expectedDiameter = 2 * focal * Math.tan(Math.asin(0.5 / 6));
    expect(ellipse.majorPx / expectedDiameter).toBeGreaterThan(0.99);
    expect(ellipse.majorPx / expectedDiameter).toBeLessThan(1.01);
    expect(ellipse.minorPx / ellipse.majorPx).toBeGreaterThan(0.995);
    expect(ellipse.centerPx[0]).toBeCloseTo(640, 0);
    expect(ellipse.centerPx[1]).toBeCloseTo(360, 0);
    expect(ellipse.centerNorm[0]).toBeCloseTo(0.5, 3);
    expect(ellipse.centerNorm[1]).toBeCloseTo(0.5, 3);
    expect(ellipse.areaPx / ((Math.PI * expectedDiameter * expectedDiameter) / 4)).toBeGreaterThan(0.98);
  });

  it('follows the Orbital Tracker angle convention (pixels, from +x toward +y, y down)', () => {
    const seed = buildShapeMesh('seed', 0.6, 'low');
    const upright = observeSilhouette(transformPoints(seed.positions, { x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 0), camera);
    expect(upright?.angleDeg ?? 0).toBeCloseTo(90, 0);
    expect((upright?.majorPx ?? 0) / (upright?.minorPx ?? 1)).toBeCloseTo(1.56, 1);
    const lying = observeSilhouette(transformPoints(seed.positions, { x: 0, y: 2, z: 0 }, quatFromTilt(Math.PI / 2, 0), 0), camera);
    const lyingAngle = lying?.angleDeg ?? 90;
    expect(Math.min(lyingAngle, 180 - lyingAngle)).toBeLessThan(1);
    // Top leaning toward +x in the world appears leaning right, i.e. the major
    // axis runs from upper right to lower left: between 90 and 180 degrees.
    const leaning = observeSilhouette(transformPoints(seed.positions, { x: 0, y: 2, z: 0 }, quatFromTilt(Math.PI / 4, 0), 0), camera);
    expect(leaning?.angleDeg ?? 0).toBeGreaterThan(120);
    expect(leaning?.angleDeg ?? 0).toBeLessThan(150);
    // Moving the body right and up in the world moves it right and up in the image.
    const moved = observeSilhouette(transformPoints(seed.positions, { x: 1, y: 2.5, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 0), camera);
    expect(moved?.centerPx[0] ?? 0).toBeGreaterThan(640);
    expect(moved?.centerPx[1] ?? 999).toBeLessThan(360);
  });

  it('reports lost, not an off-frame ellipse, once the body leaves the frame', () => {
    const mesh = buildShapeMesh('orb', 1, 'low');
    const inside = transformPoints(mesh.positions, { x: 2.2, y: 2, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 0);
    expect(observeSilhouette(inside, camera)).not.toBeNull();
    const outside = transformPoints(mesh.positions, { x: 9, y: 2, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 0);
    expect(observeSilhouette(outside, camera)).toBeNull();
  });

  it('returns null with fewer than three points in front of the camera', () => {
    const behind = new Float32Array([0, 2, 7, 0.1, 2, 8, 0, 2.1, 9, 0.2, 2.2, 10]);
    expect(observeSilhouette(behind, camera)).toBeNull();
    const two = new Float32Array([0, 2, 0, 0.1, 2, 0]);
    expect(observeSilhouette(two, camera)).toBeNull();
  });
});

describe('projectionPose', () => {
  it('lags further behind with more latency and prediction closes the gap', () => {
    const velocity = { x: 0.6, y: 0.2, z: 0 };
    const history = movingHistory(velocity);
    const now = 2;
    const speed = Math.hypot(velocity.x, velocity.y);
    const e40 = projectionPose(history, now, 40, false).errorM;
    const e80 = projectionPose(history, now, 80, false).errorM;
    const e160 = projectionPose(history, now, 160, false).errorM;
    expect(e40).toBeCloseTo(speed * 0.04, 3);
    expect(e80).toBeGreaterThan(e40);
    expect(e160).toBeGreaterThan(e80);
    expect(projectionPose(history, now, 0, false).errorM).toBeCloseTo(0, 9);
    const predicted = projectionPose(history, now, 80, true);
    expect(predicted.errorM).toBeLessThan(e80 * 0.05);
    expect(predicted.position.x).toBeCloseTo(velocity.x * now, 3);
  });

  it('caps predicted travel like the real tracker', () => {
    const fast = movingHistory({ x: 4, y: 0, z: 0 });
    const lagged = projectionPose(fast, 2, 100, false);
    const predicted = projectionPose(fast, 2, 100, true);
    expect(lagged.errorM).toBeCloseTo(0.4, 3);
    expect(predicted.errorM).toBeCloseTo(0.4 - MAX_PREDICTION_TRAVEL_M, 3);
  });

  it('handles an empty history', () => {
    const pose = projectionPose(new StateHistory(), 1, 50, true);
    expect(pose.errorM).toBe(0);
    expect(pose.orientation.w).toBe(1);
  });
});

describe('transformPoints and StateHistory', () => {
  it('rotates, translates and squashes without changing volume', () => {
    const local = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const q = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
    const out = new Float32Array(9);
    const result = transformPoints(local, { x: 1, y: 2, z: 3 }, q, 0, out);
    expect(result).toBe(out);
    // +X rotated a quarter turn about +Y points to -Z.
    expect(out[0]).toBeCloseTo(1, 6);
    expect(out[1]).toBeCloseTo(2, 6);
    expect(out[2]).toBeCloseTo(2, 6);
    const squashed = transformPoints(local, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 0.2);
    expect(squashed[4]).toBeCloseTo(0.8, 6);
    expect(squashed[0] * squashed[4] * squashed[8]).toBeCloseTo(1, 6);
  });

  it('interpolates, slerps and trims to its capacity', () => {
    const history = new StateHistory(1);
    const a = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, 0);
    const b = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
    history.push(state(0, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, a));
    history.push(state(1, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, b));
    const mid = history.sampleAt(0.5);
    expect(mid?.position.x).toBeCloseTo(0.5, 9);
    const halfTurn = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 4);
    expect(mid?.orientation.y).toBeCloseTo(halfTurn.y, 6);
    expect(mid?.orientation.w).toBeCloseTo(halfTurn.w, 6);
    expect(history.sampleAt(-5)?.timeS).toBe(0);
    expect(history.sampleAt(9)?.timeS).toBe(1);
    for (let i = 2; i <= 400; i += 1) history.push(state(i / 100, { x: i, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }));
    const span = history.span;
    expect((span?.end ?? 0) - (span?.start ?? 0)).toBeLessThanOrEqual(1.01);
    // Stored copies are independent of the caller's objects.
    const s = state(5, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 });
    history.push(s);
    s.position.x = 99;
    expect(history.latest()?.position.x).toBe(1);
    // Time running backwards (a reset) starts a fresh record.
    history.push(state(0.2, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }));
    expect(history.length).toBe(1);
    history.clear();
    expect(history.latest()).toBeNull();
    expect(history.sampleAt(1)).toBeNull();
  });
});
