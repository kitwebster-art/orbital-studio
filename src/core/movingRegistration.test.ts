import {expect,it} from 'vitest';import {fitMovingRegistration} from './movingRegistration';
const pairs=Array.from({length:9},(_,i)=>{const x=200+i%3*50,y=250+Math.floor(i/3)*50;return {camera:[x,y] as [number,number],projector:[2*x+.1*y+70,-.05*x+1.8*y-110] as [number,number]};});
it('recovers a measured local transform including size rotation and offsets',()=>{const r=fitMovingRegistration(pairs);expect(r.matrix[0]).toBeCloseTo(2);expect(r.matrix[1]).toBeCloseTo(.1);expect(r.matrix[2]).toBeCloseTo(70);expect(r.rmsPx).toBeLessThan(.001);});
it('rejects a bad marker rather than changing live mapping',()=>{const bad=structuredClone(pairs);bad[3].projector[0]+=80;expect(()=>fitMovingRegistration(bad)).toThrow(/rejected/);});
it('rejects narrow or insufficient coverage',()=>{expect(()=>fitMovingRegistration(pairs.slice(0,3))).toThrow();expect(()=>fitMovingRegistration(pairs.map(p=>({...p,camera:[10,p.camera[1]] as [number,number]})))).toThrow();});
