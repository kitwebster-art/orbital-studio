import { describe, expect, it } from 'vitest';
import { TestRigPreviewAdapter } from './TestRigPreviewAdapter';
import { DEFAULT_TEST_RIG } from '../core/testRig';
describe('small test rig preview', () => {
  it('preserves a 50cm stationary sphere in world state over time', () => {
    const adapter = new TestRigPreviewAdapter(DEFAULT_TEST_RIG);
    const a = adapter.sample(0, 0), b = adapter.sample(20, .1);
    expect(a.centerM).toEqual(DEFAULT_TEST_RIG.ballCenterM);
    expect(b.centerM).toEqual(a.centerM);
    expect(b.shape?.radiiM).toEqual({x:.25,y:.25,z:.25});
    expect(b.velocityMps).toEqual({x:0,y:0,z:0});
    expect(b.diagnostics.activeCameraCount).toBe(0);
    expect(b.diagnostics.flags).toContain('MANUAL_TEST_LAYOUT');
  });
  it('uses an alternative ball size and height without changing source evidence', () => {
    const state = new TestRigPreviewAdapter({...DEFAULT_TEST_RIG, ballDiameterM:1,ballCenterM:{x:.3,y:1.4,z:-.2}}).sample(1,.1);
    expect(state.shape?.radiiM.x).toBe(.5); expect(state.centerM?.y).toBe(1.4);
    expect(state.mode).toBe('simulation');
  });
});
