import { it, expect } from 'vitest';
import { projectionOutputBlockReason, describeOutputBlockReason, outputCalibrationProvenance } from './projectionOutputGate';
import { createDefaultProjectionRig } from './projectionRig';
import { SyntheticTrackingAdapter } from '../adapters/SyntheticTrackingAdapter';
it('allows rehearsal but fails closed for physical tracking without geometry and measured projectors',()=>{
 const world=new SyntheticTrackingAdapter().sample(1,0.01),rig=createDefaultProjectionRig();
 expect(projectionOutputBlockReason(false,world,rig)).toBeNull();
 expect(projectionOutputBlockReason(true,world,rig)).toBe('OPERATOR_BLACKOUT');
 world.mode='live';world.confidence=1;world.diagnostics.flags=['HUATENG_HT_GE134GM_T1P_C','SYNCHRONISED_SOURCE_CLOCK'];
 expect(projectionOutputBlockReason(false,world,rig)).toBe('CALIBRATED_WORLD_GEOMETRY_REQUIRED');
 world.diagnostics.flags.push('CALIBRATED_MONOCULAR_SPHERE_APPROXIMATION');
 expect(projectionOutputBlockReason(false,world,rig)).toBe('MEASURED_PROJECTOR_CALIBRATION_REQUIRED');
 rig.calibration.state='calibrated';rig.calibration.reprojectionErrorPx=1;rig.calibration.calibratedProjectorIds=['projector-1'];expect(projectionOutputBlockReason(false,world,rig)).toBeNull();
 world.measurementValid=false;expect(projectionOutputBlockReason(false,world,rig)).toBe('LIVE_TRACKING_NOT_READY');
});
it('describes every gate code in plain words and never hides an unknown code',()=>{
 const world=new SyntheticTrackingAdapter().sample(1,0.01),rig=createDefaultProjectionRig();
 world.mode='live';world.confidence=1;world.diagnostics.flags=[];
 for(const code of ['OPERATOR_BLACKOUT','WAITING_FOR_TRACKING',projectionOutputBlockReason(false,world,rig)!,'LIVE_TRACKING_EXPIRED','PROJECTOR_DISABLED']){
  const text=describeOutputBlockReason(code)!;expect(text).not.toMatch(/[A-Z_]{4,}/);expect(text.length).toBeGreaterThan(10);
 }
 expect(describeOutputBlockReason('NEW_FUTURE_CODE')).toBe('new future code');
 expect(describeOutputBlockReason(null)).toBeNull();expect(describeOutputBlockReason('')).toBeNull();
});
it('structured-light scan replaces camera geometry and projector calibration, but not source or clock',()=>{
 const world=new SyntheticTrackingAdapter().sample(1,0.01),rig=createDefaultProjectionRig();
 world.mode='live';world.confidence=1;world.diagnostics.flags=['HUATENG_HT_GE134GM_T1P_C','SYNCHRONISED_SOURCE_CLOCK'];
 expect(projectionOutputBlockReason(false,world,rig,0,{active:true,qualifies:true})).toBeNull();
 expect(projectionOutputBlockReason(false,world,rig,0,{active:true,qualifies:false})).toBe('STRUCTURED_LIGHT_SCAN_NOT_USABLE');
 expect(projectionOutputBlockReason(false,world,rig,0,{active:false,qualifies:true})).toBe('CALIBRATED_WORLD_GEOMETRY_REQUIRED');
 expect(projectionOutputBlockReason(true,world,rig,0,{active:true,qualifies:true})).toBe('OPERATOR_BLACKOUT');
 world.diagnostics.flags=['SYNCHRONISED_SOURCE_CLOCK'];
 expect(projectionOutputBlockReason(false,world,rig,0,{active:true,qualifies:true})).toBe('PHYSICAL_SOURCE_REQUIRED');
 world.diagnostics.flags=['HUATENG_HT_GE134GM_T1P_C'];
 expect(projectionOutputBlockReason(false,world,rig,0,{active:true,qualifies:true})).toBe('PHYSICAL_CLOCK_SYNC_REQUIRED');
 expect(outputCalibrationProvenance({active:true,qualifies:true})).toBe('structured-light');
 expect(outputCalibrationProvenance(null)).toBe('measured');
 expect(outputCalibrationProvenance({active:true,qualifies:false})).toBeNull();
 expect(describeOutputBlockReason('STRUCTURED_LIGHT_SCAN_NOT_USABLE')).not.toMatch(/[A-Z_]{4,}/);
});
