import type { Vec3, WorldState } from './contracts';
import type { ProjectionRigConfig } from './projectionRig';

export interface TestRigSetup {
  schemaVersion: 'orbital.test-rig/1.0';
  ballDiameterM: number;
  ballCenterM: Vec3;
  projectorPositionM: Vec3;
  cameraPositionM: Vec3;
  projectorModel: string;
  projectorFovDeg: number;
  outputWidthPx: number;
  outputHeightPx: number;
  cameraFovDeg: number;
}
export const DEFAULT_TEST_RIG: Readonly<TestRigSetup> = Object.freeze({
  schemaVersion:'orbital.test-rig/1.0', ballDiameterM:0.5,
  ballCenterM:Object.freeze({x:0,y:1,z:0}), projectorPositionM:Object.freeze({x:0,y:1,z:2}),
  cameraPositionM:Object.freeze({x:0.25,y:1,z:2}), projectorModel:'Optima4060 (unconfirmed)',
  projectorFovDeg:40, outputWidthPx:1920, outputHeightPx:1080, cameraFovDeg:60,
});
export function parseTestRigSetup(value: unknown): TestRigSetup {
  const s=value as TestRigSetup;
  if(!s || s.schemaVersion!=='orbital.test-rig/1.0') throw new Error('Unsupported test rig schema');
  const number=(v:unknown,min:number,max:number,name:string)=>{
    if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max) throw new Error(`${name} must be between ${min} and ${max}`);
  };
  number(s.ballDiameterM,0.05,5,'Ball diameter');
  for(const key of ['ballCenterM','projectorPositionM','cameraPositionM'] as const){
    const p=s[key];if(!p||typeof p!=='object')throw new Error(`${key} is required`);
    number(p.x,-50,50,`${key}.x`);number(p.y,0,20,`${key}.y`);number(p.z,-50,50,`${key}.z`);
  }
  if(s.ballCenterM.y<s.ballDiameterM/2)throw new Error('Ball must not intersect the floor');
  for(const key of ['projectorPositionM','cameraPositionM'] as const){
    const p=s[key],b=s.ballCenterM;
    if(Math.hypot(p.x-b.x,p.y-b.y,p.z-b.z)<=s.ballDiameterM/2+0.02)throw new Error(`${key} must be outside the ball with clearance`);
  }
  for(const key of ['projectorFovDeg','cameraFovDeg'] as const)number(s[key],5,150,key);
  for(const key of ['outputWidthPx','outputHeightPx'] as const){number(s[key],64,8192,key);if(!Number.isInteger(s[key]))throw new Error(`${key} must be an integer`);}
  if(typeof s.projectorModel!=='string'||s.projectorModel.trim().length<1||s.projectorModel.length>160)throw new Error('Projector model must be 1–160 characters');
  return structuredClone(s);
}
/** Manual geometry is a rehearsal setup and always invalidates physical alignment evidence. */
export function applyTestRigToProjectionRig(rig:ProjectionRigConfig, setup:TestRigSetup):ProjectionRigConfig {
  const s=parseTestRigSetup(setup), next=structuredClone(rig);
  next.name='Orbital one-camera small-ball test rig';next.sphereDiameterM=s.ballDiameterM;
  next.projectors.forEach((head,index)=>{head.enabled=index===0;});
  Object.assign(next.projectors[0],{
    positionM:{...s.projectorPositionM},targetM:{...s.ballCenterM},fovDeg:s.projectorFovDeg,
    label:`P1 · ${s.projectorModel}`,orientation:s.outputWidthPx>=s.outputHeightPx?'landscape':'portrait',
    rotationDeg:s.outputWidthPx>=s.outputHeightPx?0:90,raster:{widthPx:s.outputWidthPx,heightPx:s.outputHeightPx},
    lensShift:{x:0,y:0},warpCorners:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],
    blend:{left:0,right:0,top:0,bottom:0},blackLevel:0,
  });
  next.calibration={state:'uncalibrated',pattern:'authored',reprojectionErrorPx:null,lastCalibratedAt:null,calibratedProjectorIds:[],projectorErrorsPx:{}};
  return next;
}
/** Only simulation is replaced. Live and replay geometry remain their original evidence. */
export function applyTestRigPreview(world:WorldState,setup:TestRigSetup):WorldState {
  if(world.mode!=='simulation')return world;
  const radius=setup.ballDiameterM/2;
  return {...world,centerM:{...setup.ballCenterM},velocityMps:{x:0,y:0,z:0},prediction:null,
    shape:{radiiM:{x:radius,y:radius,z:radius},principalAxisDeg:0,wobble:0,deformationRate:0,volumeProxy:1},
    diagnostics:{...world.diagnostics,flags:[...new Set([...world.diagnostics.flags,'STATIONARY_TEST_RIG_PREVIEW','MANUAL_GEOMETRY_UNCALIBRATED'])]}};
}

/** Stable comparison independent of JSON property ordering in imported profiles. */
export function testRigSignature(s: TestRigSetup | null): string {
  if (!s) return '';
  return JSON.stringify([s.ballDiameterM, s.ballCenterM.x,s.ballCenterM.y,s.ballCenterM.z,
    s.projectorPositionM.x,s.projectorPositionM.y,s.projectorPositionM.z,
    s.cameraPositionM.x,s.cameraPositionM.y,s.cameraPositionM.z,
    s.projectorModel,s.projectorFovDeg,s.cameraFovDeg,s.outputWidthPx,s.outputHeightPx]);
}

/** Fit the full ball and both device markers, including label clearance, to any viewport. */
export function testRigOverviewCamera(setup: TestRigSetup, aspect: number, verticalFovDeg=45): { position: Vec3; target: Vec3 } {
  if(!Number.isFinite(aspect)||aspect<=0) throw new Error('Viewport aspect must be positive');
  const r=setup.ballDiameterM/2;
  const min={x:setup.ballCenterM.x-r,y:setup.ballCenterM.y-r,z:setup.ballCenterM.z-r};
  const max={x:setup.ballCenterM.x+r,y:setup.ballCenterM.y+r,z:setup.ballCenterM.z+r};
  for(const point of [setup.cameraPositionM,setup.projectorPositionM])for(const axis of ['x','y','z'] as const){
    min[axis]=Math.min(min[axis],point[axis]-.6);max[axis]=Math.max(max[axis],point[axis]+.6);
  }
  const target={x:(min.x+max.x)/2,y:(min.y+max.y)/2,z:(min.z+max.z)/2};
  const normalise=(v:Vec3)=>{const n=Math.hypot(v.x,v.y,v.z);return {x:v.x/n,y:v.y/n,z:v.z/n};};
  const n=normalise({x:.9,y:.6,z:1.15}),right=normalise({x:n.z,y:0,z:-n.x});
  const up={x:n.y*right.z-n.z*right.y,y:n.z*right.x-n.x*right.z,z:n.x*right.y-n.y*right.x};
  const tanV=Math.tan(verticalFovDeg*Math.PI/360),tanH=tanV*aspect;
  let distance=.5;
  for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z]){
    const p={x:x-target.x,y:y-target.y,z:z-target.z};
    const dot=(a:Vec3)=>p.x*a.x+p.y*a.y+p.z*a.z;
    distance=Math.max(distance,dot(n)+1.2*Math.abs(dot(right))/tanH,dot(n)+1.2*Math.abs(dot(up))/tanV);
  }
  return {target,position:{x:target.x+n.x*distance,y:target.y+n.y*distance,z:target.z+n.z*distance}};
}

/**
 * Vertical field of view from a measured throw. Point the projector at a flat
 * wall at distance d, measure the full projected image height h, then
 * fov = 2 * atan(h / (2 d)). Both inputs are metres; the result is degrees.
 */
export function verticalFovFromThrow(throwDistanceM: number, imageHeightM: number): number {
  for (const [name, value] of [['Throw distance', throwDistanceM], ['Image height', imageHeightM]] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number of metres`);
  }
  const fov = 2 * Math.atan(imageHeightM / (2 * throwDistanceM)) * 180 / Math.PI;
  if (fov < 5 || fov > 150) throw new Error(`Computed vertical field of view ${fov.toFixed(1)}° is outside the 5–150° range this rig accepts`);
  return Math.round(fov * 100) / 100;
}

export type NudgeTarget = 'projector' | 'ball';
/** Return a copy of the rig with one device position moved, validated against the same rules as manual entry. */
export function nudgeTestRigPosition(rig: TestRigSetup, target: NudgeTarget, axis: 'x' | 'y' | 'z', deltaM: number): TestRigSetup {
  if (!Number.isFinite(deltaM)) throw new Error('Nudge distance must be finite');
  const key = target === 'ball' ? 'ballCenterM' : 'projectorPositionM';
  const next = structuredClone(rig);
  next[key][axis] = Math.round((next[key][axis] + deltaM) * 1e4) / 1e4;
  return parseTestRigSetup(next);
}
/** Return a copy of the rig with the projector vertical field of view changed. */
export function nudgeTestRigFov(rig: TestRigSetup, deltaDeg: number): TestRigSetup {
  if (!Number.isFinite(deltaDeg)) throw new Error('Field of view step must be finite');
  const next = structuredClone(rig);
  next.projectorFovDeg = Math.round((next.projectorFovDeg + deltaDeg) * 100) / 100;
  return parseTestRigSetup(next);
}
