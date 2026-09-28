import type { TrackingAdapter, WorldState } from '../core/contracts';
import { parseTestRigSetup, type TestRigSetup } from '../core/testRig';
import { SyntheticTrackingAdapter } from './SyntheticTrackingAdapter';

/** A stationary measured-size planning target. It never claims camera acquisition. */
export class TestRigPreviewAdapter implements TrackingAdapter {
  readonly mode = 'simulation' as const;
  readonly label = 'Stationary test-layout preview';
  private readonly source = new SyntheticTrackingAdapter();
  private readonly rig: TestRigSetup;
  constructor(rig: TestRigSetup) { this.rig = parseTestRigSetup(rig); }
  reset(): void { this.source.reset(); }
  sample(timeS: number, deltaS: number): WorldState {
    const state = this.source.sample(timeS, deltaS);
    const r = this.rig.ballDiameterM / 2;
    return { ...state, centerM: { ...this.rig.ballCenterM }, velocityMps: { x: 0, y: 0, z: 0 },
      shape: { radiiM: { x:r, y:r, z:r }, principalAxisDeg: 0, wobble: 0, deformationRate: 0, volumeProxy: 1 },
      diagnostics: { ...state.diagnostics, activeCameraCount: 0, flags: [...state.diagnostics.flags, 'MANUAL_TEST_LAYOUT', 'STATIONARY_TEST_TARGET'] } };
  }
}
