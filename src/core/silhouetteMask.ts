/** Reparameterise a convex/star-shaped measured outline into a tiny polar lookup.
 * Constant two texture reads per pixel, independent of contour vertex count.
 */
export function silhouetteRadii(points: readonly [number,number][], center: [number,number], bins=128): Float32Array {
 const tau=Math.PI*2;
 const samples=points.map(([x,y])=>({angle:(Math.atan2(center[1]-y,x-center[0])+tau)%tau,radius:Math.hypot(x-center[0],y-center[1])})).sort((a,b)=>a.angle-b.angle);
 const result=new Float32Array(bins);
 if(samples.length<3)return result;
 const extended=[{...samples[samples.length-1],angle:samples[samples.length-1].angle-tau},...samples,{...samples[0],angle:samples[0].angle+tau}];
 let cursor=0;
 for(let i=0;i<bins;i++) {
  const angle=i*tau/bins;
  while(cursor+1<extended.length-1 && extended[cursor+1].angle<angle)cursor++;
  const a=extended[cursor],b=extended[cursor+1],t=(angle-a.angle)/Math.max(1e-9,b.angle-a.angle);
  result[i]=Math.max(0,a.radius+t*(b.radius-a.radius)-2);
 }
 return result;
}
