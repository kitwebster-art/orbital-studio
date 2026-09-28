import type { Vec3 } from './contracts';
import type { TrackerReplayFrame } from '../adapters/ReplayTrackingAdapter';

/** Camera coordinates: x right, y down, z forward. Rotation is row-major camera-to-world. */
export interface MonocularCalibration {
  schemaVersion: 'orbital.monocular-calibration/1.0';
  imageWidthPx: number; imageHeightPx: number;
  fx: number; fy: number; cx: number; cy: number;
  distortion: [number, number, number, number, number]; // k1 k2 p1 p2 k3
  rotation: [number, number, number, number, number, number, number, number, number];
  translationM: Vec3;
  sphereRadiusM: number;
  maxAxisRatio: number;
  maxReprojectionErrorPx: number;
}
export function parseMonocularCalibration(value: unknown): MonocularCalibration {
  const c = value as MonocularCalibration;
  if (!c || c.schemaVersion !== 'orbital.monocular-calibration/1.0') throw new Error('Unsupported monocular calibration');
  for (const key of ['imageWidthPx','imageHeightPx','fx','fy','sphereRadiusM','maxReprojectionErrorPx'] as const) {
    if (!Number.isFinite(c[key]) || c[key] <= 0) throw new Error(`Invalid ${key}`);
  }
  if (!Number.isInteger(c.imageWidthPx) || !Number.isInteger(c.imageHeightPx)) throw new Error('Calibration image dimensions must be integers');
  if (!Number.isFinite(c.cx) || !Number.isFinite(c.cy) || !Number.isFinite(c.maxAxisRatio) || c.maxAxisRatio < 1 || c.maxAxisRatio > 1.25) throw new Error('Invalid principal point or sphere tolerance');
  if (!Array.isArray(c.distortion) || c.distortion.length !== 5 || !c.distortion.every(Number.isFinite) || !Array.isArray(c.rotation) || c.rotation.length !== 9 || !c.rotation.every(Number.isFinite)) throw new Error('Invalid distortion or rotation');
  if (!c.translationM || ![c.translationM.x,c.translationM.y,c.translationM.z].every(Number.isFinite)) throw new Error('Invalid translation');
  const r = c.rotation;
  for (let i=0;i<3;i++) for(let j=0;j<3;j++) {
    let dot=0; for(let k=0;k<3;k++) dot+=r[i*3+k]*r[j*3+k];
    if (Math.abs(dot-(i===j?1:0)) > 1e-5) throw new Error('Camera rotation must be orthonormal');
  }
  const det=r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6]);
  if(Math.abs(det-1)>1e-5) throw new Error('Camera rotation must preserve handedness');
  return structuredClone(c);
}
function undistort(u:number,v:number,c:MonocularCalibration): [number,number] {
  const xd=(u-c.cx)/c.fx, yd=(v-c.cy)/c.fy;
  const [k1,k2,p1,p2,k3]=c.distortion;
  let x=xd,y=yd;
  for(let i=0;i<15;i++) {
    const r2=x*x+y*y, radial=1+k1*r2+k2*r2*r2+k3*r2*r2*r2;
    if(Math.abs(radial)<1e-8) throw new Error('Distortion inversion singular');
    x=(xd-2*p1*x*y-p2*(r2+2*x*x))/radial;
    y=(yd-p1*(r2+2*y*y)-2*p2*x*y)/radial;
  }
  const r2=x*x+y*y, radial=1+k1*r2+k2*r2*r2+k3*r2*r2*r2;
  if(Math.hypot((x*radial+2*p1*x*y+p2*(r2+2*x*x)-xd)*c.fx,(y*radial+p1*(r2+2*y*y)+2*p2*x*y-yd)*c.fy)>c.maxReprojectionErrorPx) throw new Error('Distortion inversion did not converge');
  return [x,y];
}
/** Known-radius near-axis spherical approximation. No material orientation is inferred. */
export function reconstructMonocularSphere(frame:TrackerReplayFrame,c:MonocularCalibration):Vec3 {
  if (!frame.geometry || frame.frame.width_px!==c.imageWidthPx || frame.frame.height_px!==c.imageHeightPx) throw new Error('Camera frame dimensions differ from calibration');
  const g=frame.geometry, e=g.ellipse;
  if(e.major_diameter_px/e.minor_diameter_px>c.maxAxisRatio || g.gross_deformation.squash_stretch>0.1) throw new Error('Object is outside spherical approximation tolerance');
  const u=g.center_norm[0]*c.imageWidthPx,v=g.center_norm[1]*c.imageHeightPx;
  const [x,y]=undistort(u,v,c);
  if(Math.hypot(x,y)>0.35) throw new Error('Sphere outside calibrated near-axis approximation envelope');
  const theta=e.angle_deg*Math.PI/180;
  const dx=Math.cos(theta)*e.major_diameter_px/2,dy=Math.sin(theta)*e.major_diameter_px/2;
  const halfWidth=Math.hypot(dx,Math.sin(theta)*e.minor_diameter_px/2), halfHeight=Math.hypot(dy,Math.cos(theta)*e.minor_diameter_px/2);
  if(u-halfWidth<0||u+halfWidth>=c.imageWidthPx||v-halfHeight<0||v+halfHeight>=c.imageHeightPx) throw new Error('Sphere silhouette clipped');
  const a=undistort(u-dx,v-dy,c),b=undistort(u+dx,v+dy,c);
  const an=Math.hypot(a[0],a[1],1),bn=Math.hypot(b[0],b[1],1);
  const cosine=(a[0]*b[0]+a[1]*b[1]+1)/(an*bn);
  const angle=Math.acos(Math.min(1,Math.max(-1,cosine)))/2;
  if(!Number.isFinite(angle)||angle<1e-5) throw new Error('Sphere angular size invalid');
  const direction=[a[0]/an+b[0]/bn,a[1]/an+b[1]/bn,1/an+1/bn];
  const distance=c.sphereRadiusM/Math.sin(angle), scale=distance/Math.hypot(...direction);
  const p=direction.map(value=>value*scale),r=c.rotation,t=c.translationM;
  return {x:r[0]*p[0]+r[1]*p[1]+r[2]*p[2]+t.x,y:r[3]*p[0]+r[4]*p[1]+r[5]*p[2]+t.y,z:r[6]*p[0]+r[7]*p[1]+r[8]*p[2]+t.z};
}
