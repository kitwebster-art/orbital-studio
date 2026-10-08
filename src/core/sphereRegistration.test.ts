import{it,expect}from'vitest';import{sphereProjectorEllipse,type SphereRegistration}from'./sphereRegistration';
it('predicts the projector silhouette from the sphere and projector baseline instead of copying the camera outline',()=>{
 const m:SphereRegistration={schema:'orbital.sphere-registration/1.0',cameraFocalPx:1000,cameraWidth:1024,cameraHeight:768,projectorMatrix:[1400,0,960,-1400,0,1400,540,0,0,0,1,0],rmsPx:0,heldOutMaxPx:0};
 const e=sphereProjectorEllipse(m,{centerPx:[512,384],majorPx:360,minorPx:360,angleDeg:0});
 expect(e.centerPx[0]).toBeLessThan(960);expect(e.centerPx[1]).toBeCloseTo(540);expect(e.majorPx).toBeGreaterThan(480);expect(e.majorPx).toBeLessThan(550);
 const moved=sphereProjectorEllipse(m,{centerPx:[530,384],majorPx:360,minorPx:360,angleDeg:0});expect(moved.centerPx[0]).toBeGreaterThan(e.centerPx[0]);
});
