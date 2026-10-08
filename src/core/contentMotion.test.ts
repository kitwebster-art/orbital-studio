import { describe, expect, it } from 'vitest';
import { ContentMotion, normaliseContentMotionSettings } from './contentMotion';
const sample = (x: number, sequence = 0, valid = true, source = 'live') => ({center:{x,y:0,z:0},radius:2,valid,source,sequence,timeS:sequence/60});
describe('content displacement anchoring', () => {
  it('world lock cancels translation at the same physical point without changing geometry', () => {
    const m=new ContentMotion();m.set({mode:'world-locked',gain:1});
    const first=Object.freeze(sample(10));m.sample(first);
    const moved=Object.freeze(sample(12,1));const state=m.sample(moved);
    expect((13-moved.center.x)/2+state.offset.x).toBe((13-first.center.x)/2);expect(moved.center.x).toBe(12);
  });
  it('opposite multiplier moves visible content backwards in world space', () => {
    const m=new ContentMotion();m.set({mode:'opposite',gain:2});m.sample(sample(0));
    expect(1-m.sample(sample(1,1)).offset.x*2).toBe(-2);
  });
  it('is frame rate independent and follows motion reversals', () => {
    const run=(fps:number)=>{const m=new ContentMotion();m.set({mode:'opposite',gain:1.5});for(let i=0;i<=fps;i++)m.sample({...sample(Math.sin(i/fps*Math.PI/2),i),timeS:i/fps});return m;};
    const a=run(30),b=run(120);expect(a.snapshot().offset).toEqual(b.snapshot().offset);
    expect(b.sample({...sample(0,121),timeS:1.01}).offset.x).toBeCloseTo(0);
  });
  it('freezes invalid tracking and rebases loss, source changes and sequence resets without jumping', () => {
    const m=new ContentMotion();m.set({mode:'world-locked',gain:1});m.sample(sample(0));
    const phase=m.sample(sample(2,1)).offset;
    expect(m.sample(sample(200,2,false)).offset).toEqual(phase);
    expect(m.sample(sample(100,3)).offset).toEqual(phase);
    expect(m.sample(sample(-100,0,true,'other')).offset).toEqual(phase);
    m.recenter();expect(m.sample(sample(1000,1)).offset.x).toBe(0);
  });
  it('preserves projector raster coordinates under changing ellipse sizes with y upward', () => {
    const m=new ContentMotion();m.set({mode:'world-locked',gain:1});
    m.sample({...sample(100),center:{x:100,y:-100,z:0},radius:50});
    const s=m.sample({...sample(120,1),center:{x:120,y:-130,z:0},radius:80});
    expect(s.offset.x).toBe(.4);expect(s.offset.y).toBe(-.6);
    expect((140-120)/s.referenceRadius+s.offset.x).toBe((140-100)/50);
  });
  it('bounds gains and restores surface coordinates explicitly', () => {
    expect(normaliseContentMotionSettings({mode:'opposite',gain:Infinity}).gain).toBe(1);
    expect(normaliseContentMotionSettings({mode:'opposite',gain:20}).gain).toBe(4);
    const m=new ContentMotion();m.set({mode:'opposite',gain:1});m.sample(sample(0));m.sample(sample(2,1));m.set({mode:'surface',gain:1});
    expect(m.snapshot().offset).toEqual({x:0,y:0,z:0});
  });
  it('rebases a silent gap or implausible teleport and never emits nonfinite coordinates', () => {
    const m=new ContentMotion();m.set({mode:'opposite',gain:4});m.sample(sample(0));const phase=m.sample(sample(1,1)).offset;
    expect(m.sample({...sample(3,2),timeS:4}).offset).toEqual(phase);
    expect(m.sample({...sample(1000,3),timeS:4.01}).offset).toEqual(phase);
    expect(m.sample({...sample(Infinity,4),timeS:4.02}).offset).toEqual(phase);
  });
});
