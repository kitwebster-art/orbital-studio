import { it, expect } from 'vitest';
import { Vector4 } from 'three';
import { projectorWarpMatrix } from './projectorWarp';
it('maps all four source corners to asymmetric perspective target corners',()=>{
 const corners=[{x:0.1,y:0.08},{x:0.94,y:0.17},{x:0.82,y:0.92},{x:0.04,y:0.86}];
 const matrix=projectorWarpMatrix(corners);
 const source=[[-1,1],[1,1],[1,-1],[-1,-1]];
 source.forEach(([x,y],i)=>{
  const p=new Vector4(x,y,0,1).applyMatrix4(matrix);
  expect((p.x/p.w+1)/2).toBeCloseTo(corners[i].x,10);
  expect((1-p.y/p.w)/2).toBeCloseTo(corners[i].y,10);
 });
});
it('rejects collapsed warp',()=>expect(()=>projectorWarpMatrix(Array(4).fill({x:0.5,y:0.5}))).toThrow('Singular'));
