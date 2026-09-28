import { Matrix4 } from 'three';
import type { ProjectionWarpPoint } from './projectionRig';
/** Homography in clip space. Four corner correspondences produce true perspective warp. */
export function projectorWarpMatrix(corners: readonly ProjectionWarpPoint[]): Matrix4 {
 if(corners.length!==4) throw new Error('Warp requires four corners');
 const source=[[-1,1],[1,1],[1,-1],[-1,-1]];
 const rows:number[][]=[];
 corners.forEach((p,i)=>{
  const [x,y]=source[i],u=p.x*2-1,v=1-p.y*2;
  rows.push([x,y,1,0,0,0,-u*x,-u*y,u]);
  rows.push([0,0,0,x,y,1,-v*x,-v*y,v]);
 });
 for(let col=0;col<8;col++){
  let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
  [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
  const divisor=rows[col][col];if(Math.abs(divisor)<1e-10)throw new Error('Singular projector warp');
  for(let j=col;j<9;j++)rows[col][j]/=divisor;
  for(let row=0;row<8;row++)if(row!==col){const factor=rows[row][col];for(let j=col;j<9;j++)rows[row][j]-=factor*rows[col][j];}
 }
 const h=rows.map(row=>row[8]);
 return new Matrix4().set(h[0],h[1],0,h[2],h[3],h[4],0,h[5],0,0,1,0,h[6],h[7],0,1);
}
