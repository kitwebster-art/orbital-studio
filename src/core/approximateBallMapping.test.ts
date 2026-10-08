import { expect,it } from 'vitest';
import { ApproximateBallMapping,type ApproximateObservation } from './approximateBallMapping';
const map={matrix:[2,0,100,0,2,-200,0,0,1] as [number,number,number,number,number,number,number,number,number],cameraWidth:1024,cameraHeight:768,projectorWidth:1920,projectorHeight:1080};
const observation:ApproximateObservation={sequence:1,centerPx:[330,395],majorPx:470,minorPx:470,angleDeg:0,frameWidthPx:1024,frameHeightPx:768,velocityPxPerS:[0,0],ageMs:20,confidence:.9};
it('maps measured centre and diameter to the estimated projector geometry',()=>{
 const p=new ApproximateBallMapping();const e=p.sample(100,observation,map)!;
 expect(e.centerPx).toEqual([760,590]);expect(e.majorPx).toBeCloseTo(940);
});
it('predicts briefly, caps displacement and holds briefly then fades and blanks after 1500ms without detection',()=>{
 const p=new ApproximateBallMapping();p.sample(100,{...observation,velocityPxPerS:[10000,0]},map);
 const e=p.sample(250,null,map)!;
 expect(e.centerPx[0]).toBeLessThanOrEqual(760+470*.12);
 expect(p.predicted).toBe(true);expect(p.sample(1000,null,map)).not.toBeNull();
 expect(p.phase).toBe("held-estimate");
 expect(p.sample(1480,null,map)).not.toBeNull();expect(p.opacity).toBeCloseTo(1/3);
 expect(p.sample(1681,null,map)).toBeNull();
});
it('repeated stale sequences cannot renew prediction or create fake detection',()=>{
 const p=new ApproximateBallMapping();expect(p.sample(100,null,map)).toBeNull();
 expect(p.sample(100,{...observation,confidence:.4},map)).toBeNull();
 p.sample(100,observation,map);
 expect(p.sample(2000,{...observation,ageMs:10},map)).toBeNull();
});

it('reduces measurement jitter without a large prediction jump',()=>{
 const p=new ApproximateBallMapping();p.sample(100,observation,map);
 const e=p.sample(133,{...observation,sequence:2,centerPx:[340,395],velocityPxPerS:[20000,0]},map)!;
 expect(e.centerPx[0]).toBeGreaterThan(760);expect(e.centerPx[0]).toBeLessThan(810);
});

it('steady smoothing removes alternating tiny position noise',()=>{
 const p=new ApproximateBallMapping();p.setSmoothing(100);p.sample(100,observation,map);
 for(let i=1;i<15;i++) {
  const e=p.sample(100+i*33,{...observation,sequence:i+1,centerPx:[330+(i%2 ? 2 : -2),395]},map)!;
  expect(Math.abs(e.centerPx[0]-760)).toBeLessThan(.1);
 }
});
it('smoothing zero follows a fresh measurement without filter lag',()=>{
 const p=new ApproximateBallMapping();p.setSmoothing(0);p.sample(100,observation,map);
 const e=p.sample(133,{...observation,sequence:2,centerPx:[350,395]},map)!;
 expect(e.centerPx).toEqual([800,590]);
});
it('interpolates between camera updates without renewing stale detections',()=>{
 const p=new ApproximateBallMapping();p.setSmoothing(50);p.sample(100,observation,map);
 const next={...observation,sequence:2,centerPx:[350,395] as [number,number]};
 const first=p.sample(133,next,map)!;
 const between=p.sample(149,{...next,ageMs:36},map)!;
 expect(between.centerPx[0]).toBeGreaterThan(first.centerPx[0]);
 expect(between.centerPx[0]).toBeLessThan(800);
 expect(p.sample(2000,{...next,ageMs:10},map)).toBeNull();
});

it('maps the deformable silhouette rather than replacing it with a circle',()=>{
 const p=new ApproximateBallMapping();p.setSmoothing(0);
 const outlinePx=Array.from({length:64},(_,i)=>{const a=i*Math.PI*2/64,r=200*(1+.1*Math.cos(3*a));return [330+r*Math.cos(a),395+r*Math.sin(a)] as [number,number];});
 const e=p.sample(100,{...observation,outlinePx},map)!;
 expect(e.outlinePx).toHaveLength(64);expect(e.outlinePx![0][0]).toBeCloseTo(1168);
 expect(e.outlinePx![32][0]).toBeCloseTo(368);
 expect(p.sample(2000,null,map)).toBeNull();
});

it('briefly retains a weak silhouette without renewing it from centre-only frames',()=>{
 const p=new ApproximateBallMapping();p.setSmoothing(0);
 const outlinePx=Array.from({length:64},(_,i)=>[330+200*Math.cos(i*Math.PI/32),395+200*Math.sin(i*Math.PI/32)] as [number,number]);
 p.sample(100,{...observation,outlinePx},map);
 const held=p.sample(133,{...observation,sequence:2,centerPx:[340,395]},map)!;
 expect(held.outlinePx).toHaveLength(64);expect(held.outlineHeld).toBe(true);
 expect(held.centerPx[0]).toBe(780);
 expect(p.sample(400,{...observation,sequence:3},map)!.outlinePx).toBeUndefined();
 expect(p.outlinePhase).toBe('oval');
});
