import { expect, it } from 'vitest';
import { SyntheticTrackingAdapter } from '../adapters/SyntheticTrackingAdapter';
import { trackingLightAllowed, trackingLightLinear } from './projectorTrackingLight';
it('keeps recovery illumination when physical tracking is lost, without authorising artwork', () => {
 const w = new SyntheticTrackingAdapter().sample(1, 0.01);
 w.mode = 'live'; w.diagnostics.flags = ['HUATENG_HT_GE134GM_T1P_C'];
 w.stateValid = false; w.measurementValid = false; w.confidence = 0;
 expect(trackingLightAllowed(true,false,w,false,0,true)).toBe(true);
 expect(trackingLightAllowed(true,true,w,false,0,true)).toBe(false);
 expect(trackingLightAllowed(true,false,w,true,0,true)).toBe(false);
 expect(trackingLightAllowed(true,false,w,false,1,true)).toBe(false);
 expect(trackingLightAllowed(true,false,w,false,0,false)).toBe(false);
 expect(trackingLightAllowed(false,false,w,false,0,true)).toBe(false);
 w.diagnostics.flags=[];
});
it('uses bounded linear light for display levels',()=>{
 expect(trackingLightLinear(0)).toBe(0); expect(trackingLightLinear(1)).toBe(1);
 expect(trackingLightLinear(.55)).toBeCloseTo(.2633,3);
 expect(trackingLightLinear(NaN)).toBe(0);
});
