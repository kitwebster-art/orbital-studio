import { describe, it, expect } from 'vitest';
import { parseMonocularCalibration, reconstructMonocularSphere, type MonocularCalibration } from './monocularCalibration';
import type { TrackerReplayFrame } from '../adapters/ReplayTrackingAdapter';
const calibration: MonocularCalibration = {
  schemaVersion:'orbital.monocular-calibration/1.0',imageWidthPx:1024,imageHeightPx:768,
  fx:1000,fy:1000,cx:512,cy:384,distortion:[0,0,0,0,0],rotation:[1,0,0,0,1,0,0,0,1],
  translationM:{x:1,y:2,z:3},sphereRadiusM:0.1,maxAxisRatio:1.1,maxReprojectionErrorPx:0.1,
};
const frame = (): TrackerReplayFrame => ({
 schema_version:'orbital.tracking-state/1.0',sequence:1,source_mode:'live',source_uri:'camera',source_time_s:1,status:'tracking',measurement_valid:true,state_valid:true,confidence:1,frame:{width_px:1024,height_px:768},
 geometry:{center_norm:[0.5,0.5],ellipse:{major_diameter_px:2000*0.1/Math.sqrt(4-0.01),minor_diameter_px:2000*0.1/Math.sqrt(4-0.01),angle_deg:0},gross_deformation:{squash_stretch:0}},velocity:null,material_rotation_tracked:false,flags:[],
});
describe('known-radius monocular sphere',()=>{
 it('recovers analytic optical-axis sphere range and camera translation',()=>{
  const p=reconstructMonocularSphere(frame(),parseMonocularCalibration(calibration));
  expect(p.x).toBeCloseTo(1,8);expect(p.y).toBeCloseTo(2,8);expect(p.z).toBeCloseTo(5,8);
 });
 it('rejects reflection transforms and wrong capture dimensions',()=>{
  expect(()=>parseMonocularCalibration({...calibration,rotation:[-1,0,0,0,1,0,0,0,1]})).toThrow('handedness');
  const f=frame();f.frame.width_px=640;expect(()=>reconstructMonocularSphere(f,calibration)).toThrow('dimensions');
 });
 it('rejects deformation and far off-axis observations rather than inventing depth',()=>{
  const f=frame();f.geometry!.ellipse.minor_diameter_px=20;
  expect(()=>reconstructMonocularSphere(f,calibration)).toThrow('tolerance');
  const g=frame();g.geometry!.center_norm=[0.95,0.5];expect(()=>reconstructMonocularSphere(g,calibration)).toThrow('envelope');
 });
});
