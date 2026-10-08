import * as THREE from 'three';import type {ImageEllipse} from './scanMapping';
export interface SphereRegistration {schema:'orbital.sphere-registration/1.0';cameraFocalPx:number;cameraWidth:number;cameraHeight:number;projectorMatrix:number[];rmsPx:number;heldOutMaxPx:number}
function cameraCenter(model:SphereRegistration,e:ImageEllipse):number[]{
 const f=model.cameraFocalPx,cx=e.centerPx[0],cy=e.centerPx[1],r=(e.majorPx+e.minorPx)/4;
 const k=[[f,0,model.cameraWidth/2],[0,f,model.cameraHeight/2],[0,0,1]],q=[[1,0,-cx],[0,1,-cy],[-cx,-cy,cx*cx+cy*cy-r*r]];
 const a=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>k.reduce((s,row,l)=>s+row[i]*q[l].reduce((v,n,m)=>v+n*k[m][j],0),0)));
 const v=[[1,0,0],[0,1,0],[0,0,1]];
 for(let step=0;step<24;step++){let p=0,t=1;for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)if(Math.abs(a[i][j])>Math.abs(a[p][t])){p=i;t=j;}if(Math.abs(a[p][t])<1e-9)break;const angle=.5*Math.atan2(2*a[p][t],a[t][t]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle);const pp=a[p][p],tt=a[t][t],pt=a[p][t];a[p][p]=c*c*pp-2*s*c*pt+s*s*tt;a[t][t]=s*s*pp+2*s*c*pt+c*c*tt;a[p][t]=a[t][p]=0;for(let i=0;i<3;i++)if(i!==p&&i!==t){const ap=a[i][p],at=a[i][t];a[i][p]=a[p][i]=c*ap-s*at;a[i][t]=a[t][i]=s*ap+c*at;}for(let i=0;i<3;i++){const vp=v[i][p],vt=v[i][t];v[i][p]=c*vp-s*vt;v[i][t]=s*vp+c*vt;}}
 let axis=0;for(let i=1;i<3;i++)if(a[i][i]<a[axis][axis])axis=i;
 const negative=a[axis][axis],positive=(a.reduce((s,row,i)=>s+row[i],0)-negative)/2;
 if(negative>=0||positive<=0)throw new Error('Invalid sphere outline');
 const distance=Math.sqrt(1+positive/-negative),sign=v[2][axis]<0?-1:1;
 return v.map(row=>row[axis]*distance*sign);
}
export function sphereProjectorEllipse(model:SphereRegistration,e:ImageEllipse):ImageEllipse{
 const c=[...cameraCenter(model,e),1],p=model.projectorMatrix;
 const dual=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>{
 let value=0;for(let a=0;a<4;a++)for(let b=0;b<4;b++)value+=p[i*4+a]*(c[a]*c[b]-(a===b&&a<3?1:0))*p[j*4+b];return value;}));
 const m=new THREE.Matrix3().set(...dual.flat() as [number,number,number,number,number,number,number,number,number]);if(Math.abs(m.determinant())<1e-12)throw new Error('Unbounded sphere');m.invert();const q=m.elements,a=q[0],b=q[3],d=q[4],bx=q[6],by=q[7],det=a*d-b*b;
 const x=(b*by-d*bx)/det,y=(b*bx-a*by)/det,scale=a*x*x+2*b*x*y+d*y*y-q[8];
 const aa=a/scale,bb=b/scale,dd=d/scale,tr=(aa+dd)/2,span=Math.hypot((aa-dd)/2,bb),lo=tr-span,hi=tr+span;
 if(lo<=0||!Number.isFinite(lo+hi))throw new Error('Invalid projector sphere');
 const major=2/Math.sqrt(lo),minor=2/Math.sqrt(hi),angle=.5*Math.atan2(2*bb,aa-dd)+Math.PI/2;
 return {centerPx:[x,y],majorPx:major*.99,minorPx:minor*.99,angleDeg:angle*180/Math.PI};
}
