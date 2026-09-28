import { describe,it,expect } from 'vitest';
import { DEFAULT_TEST_RIG,testRigSignature,parseTestRigSetup,applyTestRigPreview,applyTestRigToProjectionRig,testRigOverviewCamera,verticalFovFromThrow,nudgeTestRigPosition,nudgeTestRigFov } from './testRig';
import { createDefaultProjectionRig,validateProjectionRig } from './projectionRig';
import { SyntheticTrackingAdapter } from '../adapters/SyntheticTrackingAdapter';
describe('small physical test setup',()=>{
 it('compares imported and form-created layouts regardless of JSON property ordering',()=>{
   const reordered=Object.fromEntries(Object.entries(DEFAULT_TEST_RIG).reverse());
   expect(testRigSignature(parseTestRigSetup(reordered))).toBe(testRigSignature(DEFAULT_TEST_RIG));
   expect(testRigSignature({...DEFAULT_TEST_RIG,ballDiameterM:.7})).not.toBe(testRigSignature(DEFAULT_TEST_RIG));
 });
 it('defaults to a half-metre ball and independent single camera/projector with unconfirmed model',()=>{
  const setup=parseTestRigSetup(DEFAULT_TEST_RIG),source=createDefaultProjectionRig();
  source.calibration={state:'calibrated',pattern:'authored',reprojectionErrorPx:0.5,lastCalibratedAt:new Date().toISOString(),calibratedProjectorIds:['projector-1']};
  const rig=validateProjectionRig(applyTestRigToProjectionRig(source,setup));
  expect(rig.sphereDiameterM).toBe(.5);expect(rig.projectors.filter(p=>p.enabled)).toHaveLength(1);
  expect(rig.projectors[0].orientation).toBe('landscape');expect(rig.projectors[0].raster).toEqual({widthPx:1920,heightPx:1080});
  expect(rig.projectors[0].positionM).toEqual(setup.projectorPositionM);
  expect(setup.cameraPositionM).not.toEqual(setup.projectorPositionM);
  expect(rig.calibration.state).toBe('uncalibrated');expect(rig.calibration.calibratedProjectorIds).toEqual([]);
  expect(source.calibration.state).toBe('calibrated');
 });
 it('rejects invalid diameter, floor intersection and a device inside the ball',()=>{
  expect(()=>parseTestRigSetup({...DEFAULT_TEST_RIG,ballDiameterM:NaN})).toThrow();
  expect(()=>parseTestRigSetup({...DEFAULT_TEST_RIG,ballCenterM:{x:0,y:.1,z:0}})).toThrow('floor');
  expect(()=>parseTestRigSetup({...DEFAULT_TEST_RIG,cameraPositionM:{x:0,y:1,z:0}})).toThrow('outside');
 });
 it('makes simulation stationary at exact scale without modifying live geometry or source state',()=>{
  const source=new SyntheticTrackingAdapter().sample(3,.01);
  const preview=applyTestRigPreview(source,DEFAULT_TEST_RIG);
  expect(preview.shape!.radiiM).toEqual({x:.25,y:.25,z:.25});expect(preview.centerM).toEqual(DEFAULT_TEST_RIG.ballCenterM);
  expect(preview.velocityMps).toEqual({x:0,y:0,z:0});expect(preview.prediction).toBeNull();
  expect(preview.diagnostics.flags).toContain('STATIONARY_TEST_RIG_PREVIEW');
  expect(source.shape!.radiiM.x).not.toBe(.25);
  const live={...source,mode:'live' as const};expect(applyTestRigPreview(live,DEFAULT_TEST_RIG)).toBe(live);
 });
});

it('fits ball and separated devices inside wide and narrow overview viewports', async()=>{
 const {PerspectiveCamera,Vector3}=await import('three');
 for(const aspect of [.5,1,2]){
  const framing=testRigOverviewCamera(DEFAULT_TEST_RIG,aspect);
  const camera=new PerspectiveCamera(45,aspect,.01,100);
  camera.position.set(framing.position.x,framing.position.y,framing.position.z);
  camera.lookAt(framing.target.x,framing.target.y,framing.target.z);camera.updateMatrixWorld(true);
  for(const point of [DEFAULT_TEST_RIG.ballCenterM,DEFAULT_TEST_RIG.projectorPositionM,DEFAULT_TEST_RIG.cameraPositionM]){
   for(const x of [-.4,.4])for(const y of [-.4,.4])for(const z of [-.4,.4]){
    const projected=new Vector3(point.x+x,point.y+y,point.z+z).project(camera);
    expect(Math.abs(projected.x)).toBeLessThan(1);expect(Math.abs(projected.y)).toBeLessThan(1);
   }
  }
 }
});

describe('field of view from a measured throw',()=>{
 it('computes 2*atan(h/2d) in degrees',()=>{
  expect(verticalFovFromThrow(2,1.4560)).toBeCloseTo(40,1);
  expect(verticalFovFromThrow(1,2)).toBeCloseTo(90,5);
  expect(verticalFovFromThrow(3,0.5)).toBeCloseTo(9.53,2);
 });
 it('rejects non-positive, non-finite and out-of-range results',()=>{
  expect(()=>verticalFovFromThrow(0,1)).toThrow('Throw distance');
  expect(()=>verticalFovFromThrow(2,-1)).toThrow('Image height');
  expect(()=>verticalFovFromThrow(NaN,1)).toThrow();
  expect(()=>verticalFovFromThrow(100,1)).toThrow('outside');
 });
});
describe('live nudges',()=>{
 it('moves one axis by centimetres without touching the source rig',()=>{
  const moved=nudgeTestRigPosition(DEFAULT_TEST_RIG,'projector','z',0.1);
  expect(moved.projectorPositionM).toEqual({x:0,y:1,z:2.1});
  expect(DEFAULT_TEST_RIG.projectorPositionM.z).toBe(2);
  const ball=nudgeTestRigPosition(DEFAULT_TEST_RIG,'ball','x',-0.01);
  expect(ball.ballCenterM.x).toBeCloseTo(-0.01,6);
  expect(nudgeTestRigFov(DEFAULT_TEST_RIG,0.25).projectorFovDeg).toBe(40.25);
 });
 it('refuses a nudge that breaks the layout rules',()=>{
  expect(()=>nudgeTestRigPosition(DEFAULT_TEST_RIG,'ball','y',-0.9)).toThrow('floor');
  expect(()=>nudgeTestRigFov(DEFAULT_TEST_RIG,-40)).toThrow();
  expect(()=>nudgeTestRigPosition(DEFAULT_TEST_RIG,'projector','x',Infinity)).toThrow('finite');
 });
});
