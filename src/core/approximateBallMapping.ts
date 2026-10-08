import {sphereProjectorEllipse,type SphereRegistration} from "./sphereRegistration";
import { applyHomography, mapEllipseThroughHomography, type ImageEllipse, type Homography } from './scanMapping';
export interface ApproximateObservation {
 outlinePx?: [number,number][];
 sequence: number; centerPx: [number,number]; majorPx: number; minorPx: number; angleDeg: number;
 frameWidthPx: number; frameHeightPx: number; velocityPxPerS: [number,number]; ageMs: number; confidence: number;
}
export interface ApproximateMap { matrix: Homography; cameraWidth: number; cameraHeight: number; projectorWidth: number; projectorHeight: number }
/** Explicitly estimated alignment. Never changes measured tracking validity. */
export class ApproximateBallMapping {
 private last: ApproximateObservation | null = null;
 private observedAt = -Infinity;
 private acceptedAt = -Infinity;
 private renderedAt = -Infinity;
 private displayed: ImageEllipse | null = null;
 private smoothing = .8;
 private outlineOffsets: [number,number][] | null = null;
 private outlineAt = -Infinity;
 private shapeAdaptation = .02;
 private sphereModel:SphereRegistration|null=null;
 setSphereModel(model:SphereRegistration|null):void {this.sphereModel=model;this.displayed=null;this.outlineOffsets=null;}
 setShapeAdaptation(percent:number):void {this.shapeAdaptation=Math.max(0,Math.min(8,percent))/100;}
 public outlinePhase: "measured" | "held" | "oval" = "oval";
 private history: ApproximateObservation[] = [];
 setSmoothing(percent: number): void { this.smoothing=Number.isFinite(percent) ? Math.max(0,Math.min(100,percent))/100 : .8; }

 private filtered: [number,number] | null = null;
 public predicted = false;
 public opacity = 1;
 public phase = "detected";
 private velocity: [number,number] = [0,0];
 private diameter: [number,number] | null = null;
 sample(nowMs: number, observation: ApproximateObservation | null, map: ApproximateMap): ImageEllipse | null {
  if (observation && observation.confidence >= .7 && observation.ageMs <= 120 && observation.sequence !== this.last?.sequence) {
   const dt = this.last ? Math.max(1, nowMs - this.acceptedAt) : 1000;
   this.history.push(observation);if(this.history.length>3)this.history.shift();
   const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
   const center: [number,number] = this.smoothing ? [median(this.history.map(x=>x.centerPx[0])),median(this.history.map(x=>x.centerPx[1]))] : observation.centerPx;
   const major=this.smoothing ? median(this.history.map(x=>x.majorPx)) : observation.majorPx;
   const minor=this.smoothing ? median(this.history.map(x=>x.minorPx)) : observation.minorPx;
   const centerMs=15+this.smoothing*220,sizeMs=25+this.smoothing*380;
   const a = this.smoothing ? 1-Math.exp(-Math.min(dt,60)/centerMs) : 1;
   const sizeA=this.smoothing ? 1-Math.exp(-Math.min(dt,60)/sizeMs) : 1;
   const deadband=this.smoothing*3;
   const settled=!!this.filtered && Math.hypot(center[0]-this.filtered[0],center[1]-this.filtered[1])<=deadband;
   this.diameter=this.diameter ? [this.diameter[0]+sizeA*(major-this.diameter[0]),this.diameter[1]+sizeA*(minor-this.diameter[1])] : [major,minor];
   const velocityA=1-Math.exp(-Math.min(dt,60)/(25+this.smoothing*280));
   const speed=Math.hypot(...observation.velocityPxPerS),velocityLimit=observation.majorPx*.35;
   const velocityScale=settled ? 0 : Math.min(1,velocityLimit/Math.max(1,speed));
   this.velocity=[this.velocity[0]+velocityA*(observation.velocityPxPerS[0]*velocityScale-this.velocity[0]),this.velocity[1]+velocityA*(observation.velocityPxPerS[1]*velocityScale-this.velocity[1])];
   if(!settled) this.filtered = this.filtered ? [this.filtered[0]+a*(center[0]-this.filtered[0]),this.filtered[1]+a*(center[1]-this.filtered[1])] : [...center];
   const shapeA=this.smoothing ? 1-Math.exp(-Math.min(dt,60)/(20+this.smoothing*80)) : 1;
   if(observation.outlinePx?.length===64) {
    this.outlineAt=nowMs;this.outlinePhase="measured";
    const lengths=observation.outlinePx.map(([x,y])=>Math.hypot(x-observation.centerPx[0],y-observation.centerPx[1])).sort((a,b)=>a-b);
    const base=lengths[32];
    const offsets=observation.outlinePx.map(([x,y])=>{const dx=x-observation.centerPx[0],dy=y-observation.centerPx[1],r=Math.max(1,Math.hypot(dx,dy)),bounded=Math.max(base*(1-this.shapeAdaptation),Math.min(base*(1+this.shapeAdaptation),r));return [dx*bounded/r,dy*bounded/r] as [number,number];});
    this.outlineOffsets=offsets.map((point,i)=>{const old=this.outlineOffsets?.[i];return old ? [old[0]+shapeA*(point[0]-old[0]),old[1]+shapeA*(point[1]-old[1])] : point;});
   } else if(nowMs-this.outlineAt>250) {this.outlineOffsets=null;this.outlinePhase="oval";} else this.outlinePhase="held";
   this.last = observation; this.acceptedAt=nowMs; this.observedAt = nowMs - observation.ageMs;
  }
  const last=this.last;
  if (!last || !this.filtered) return null;
  const age=nowMs-this.observedAt;
  if (age > 1500 || age < 0) { this.displayed=null; return null; }
  this.opacity = Math.max(0,Math.min(1,(1500-age)/300));
  this.phase = age > 1200 ? "fading-held-estimate" : age > 250 ? "held-estimate" : "detected-or-short-prediction";
  this.predicted = age > 100 || !observation;
  const lead=Math.min(120, age+45)/1000;
  // Never extrapolate more than six percent of the balloon diameter.
  const vx=this.velocity[0]*lead,vy=this.velocity[1]*lead;
  const scale=Math.min(1,last.majorPx*.06/Math.max(1,Math.hypot(vx,vy)));
  const kx=map.cameraWidth/last.frameWidthPx,ky=map.cameraHeight/last.frameHeightPx,k=Math.sqrt(kx*ky);
  const cameraEllipse:ImageEllipse={centerPx:[(this.filtered[0]+vx*scale)*kx,(this.filtered[1]+vy*scale)*ky],majorPx:(this.diameter?.[0] ?? last.majorPx)*k,minorPx:(this.diameter?.[1] ?? last.minorPx)*k,angleDeg:last.angleDeg};
  const target=this.sphereModel ? sphereProjectorEllipse(this.sphereModel,cameraEllipse) : mapEllipseThroughHomography(map.matrix,{centerPx:[(this.filtered[0]+vx*scale)*kx,(this.filtered[1]+vy*scale)*ky],majorPx:(this.diameter?.[0] ?? last.majorPx)*k,minorPx:(this.diameter?.[1] ?? last.minorPx)*k,angleDeg:last.angleDeg});
  // Interpolate on projector frames too, so 30Hz camera updates do not step
  // the picture at every other 60Hz output frame.
  const renderA=this.smoothing ? 1-Math.exp(-Math.max(0,nowMs-this.renderedAt)/(5+this.smoothing*45)) : 1;
  const previous=this.displayed;
  this.displayed=previous ? {...target,centerPx:[previous.centerPx[0]+renderA*(target.centerPx[0]-previous.centerPx[0]),previous.centerPx[1]+renderA*(target.centerPx[1]-previous.centerPx[1])],majorPx:previous.majorPx+renderA*(target.majorPx-previous.majorPx),minorPx:previous.minorPx+renderA*(target.minorPx-previous.minorPx)} : target;
  if(nowMs-this.outlineAt>250) {this.outlineOffsets=null;this.outlinePhase="oval";}
  if(this.outlineOffsets && !this.sphereModel) {
   const mappedCenter=applyHomography(map.matrix,(this.filtered[0]+vx*scale)*kx,(this.filtered[1]+vy*scale)*ky);
   const outline=this.outlineOffsets.map(([x,y])=>{const p=applyHomography(map.matrix,(this.filtered![0]+vx*scale+x)*kx,(this.filtered![1]+vy*scale+y)*ky);return [p[0]+this.displayed!.centerPx[0]-mappedCenter[0],p[1]+this.displayed!.centerPx[1]-mappedCenter[1]] as [number,number];});
   this.displayed.outlinePx=outline;
   this.displayed.outlineHeld=this.outlinePhase==="held";
   const extent=Math.max(...outline.map(([x,y])=>Math.hypot(x-this.displayed!.centerPx[0],y-this.displayed!.centerPx[1])));
   this.displayed.majorPx=this.displayed.minorPx=extent*2;this.displayed.angleDeg=0;
  }
  this.renderedAt=nowMs;
  return this.displayed;
 }
}
