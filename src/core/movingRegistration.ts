import type {Homography} from './scanMapping';
export interface RegistrationPair {camera:[number,number];projector:[number,number];ballCenter?:[number,number];ballRadius?:number}
function solve(matrix:number[][],rhs:number[]):number[]{
 const a=matrix.map((row,i)=>[...row,rhs[i]]);
 for(let k=0;k<3;k++){
  let pivot=k;for(let i=k+1;i<3;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
  [a[k],a[pivot]]=[a[pivot],a[k]];
  if(Math.abs(a[k][k])<1e-8)throw new Error('Markers do not span enough of the balloon');
  const scale=a[k][k];for(let j=k;j<4;j++)a[k][j]/=scale;
  for(let i=0;i<3;i++)if(i!==k){const f=a[i][k];for(let j=k;j<4;j++)a[i][j]-=f*a[k][j];}
 }
 return a.map(row=>row[3]);
}
export function fitMovingRegistration(pairs:RegistrationPair[]):{matrix:Homography;rmsPx:number;points:number}{
 if(pairs.length<6)throw new Error('Need at least six visible markers on the balloon');
 if(pairs.some(p=>[...p.camera,...p.projector].some(x=>!Number.isFinite(x))))throw new Error('Invalid marker coordinates');
 const cx=pairs.reduce((s,p)=>s+p.camera[0],0)/pairs.length,cy=pairs.reduce((s,p)=>s+p.camera[1],0)/pairs.length;
 if(Math.max(...pairs.map(p=>p.camera[0]))-Math.min(...pairs.map(p=>p.camera[0]))<35 || Math.max(...pairs.map(p=>p.camera[1]))-Math.min(...pairs.map(p=>p.camera[1]))<35)throw new Error('Markers cover too little of the balloon');
 const n=Array.from({length:3},()=>[0,0,0]),bx=[0,0,0],by=[0,0,0];
 for(const p of pairs){const row=[p.camera[0]-cx,p.camera[1]-cy,1];for(let i=0;i<3;i++){bx[i]+=row[i]*p.projector[0];by[i]+=row[i]*p.projector[1];for(let j=0;j<3;j++)n[i][j]+=row[i]*row[j];}}
 const x=solve(n,bx),y=solve(n,by);
 const matrix=[x[0],x[1],x[2]-x[0]*cx-x[1]*cy,y[0],y[1],y[2]-y[0]*cx-y[1]*cy,0,0,1];
 const rmsPx=Math.sqrt(pairs.reduce((sum,p)=>sum+(matrix[0]*p.camera[0]+matrix[1]*p.camera[1]+matrix[2]-p.projector[0])**2+(matrix[3]*p.camera[0]+matrix[4]*p.camera[1]+matrix[5]-p.projector[1])**2,0)/pairs.length);
 const determinant=matrix[0]*matrix[4]-matrix[1]*matrix[3];
 if(rmsPx>5 || determinant<.1 || determinant>36)throw new Error(`Alignment rejected: ${rmsPx.toFixed(1)} px residual, or implausible scale. Keep the previous fit.`);
 // Leave one marker out at a time to catch a superficially good overfit.
 let worst=0;for(let i=0;i<pairs.length;i++){const r=[pairs[i].camera[0]-cx,pairs[i].camera[1]-cy,1],m=n.map(row=>[...row]),u=[...bx],v=[...by];for(let j=0;j<3;j++){u[j]-=r[j]*pairs[i].projector[0];v[j]-=r[j]*pairs[i].projector[1];for(let k=0;k<3;k++)m[j][k]-=r[j]*r[k];}const a=solve(m,u),b=solve(m,v);worst=Math.max(worst,Math.hypot(a.reduce((s,c,k)=>s+c*r[k],0)-pairs[i].projector[0],b.reduce((s,c,k)=>s+c*r[k],0)-pairs[i].projector[1]));}
 if(worst>10)throw new Error(`Alignment rejected: held-out marker error ${worst.toFixed(1)} px`);
 return {matrix,rmsPx,points:pairs.length};
}
