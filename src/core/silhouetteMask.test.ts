import {it,expect} from 'vitest';
import {silhouetteRadii} from './silhouetteMask';
it('retains non-circular lobes with a conservative two pixel inset',()=>{
 const points=Array.from({length:64},(_,i)=>{const a=i*Math.PI*2/64,r=100*(1+.12*Math.cos(3*a));return [200+r*Math.cos(a),300+r*Math.sin(a)] as [number,number];});
 const mask=silhouetteRadii(points,[200,300]);
 expect(mask[0]).toBeCloseTo(110);expect(mask[64]).toBeCloseTo(86);
 expect(Math.max(...mask)-Math.min(...mask)).toBeGreaterThan(20);
 expect(mask.every(Number.isFinite)).toBe(true);
});
it('is circularly continuous across the angular seam',()=>{
 const points=Array.from({length:64},(_,i)=>[Math.cos(i*Math.PI/32)*80,Math.sin(i*Math.PI/32)*80] as [number,number]);
 const mask=silhouetteRadii(points,[0,0]);expect(mask[0]).toBeCloseTo(mask[127]);expect(mask[0]).toBeCloseTo(78);
});
