import { describe, expect, it } from 'vitest';
import { DEFAULT_TEST_PROFILE, distribution, parseTestProfile, TestSessionMetrics } from './testSession';
describe('physical test session evidence', () => {
  it('migrates older profiles to a 50cm setup and preserves explicit rig values', () => {
    const old = { ...DEFAULT_TEST_PROFILE, rig: undefined };
    expect(parseTestProfile(old).rig.ballDiameterM).toBe(.5);
    const next = { ...DEFAULT_TEST_PROFILE, rig: { ...DEFAULT_TEST_PROFILE.rig, ballDiameterM:.7, cameraPositionM:{x:.8,y:1.2,z:2.5} } };
    expect(parseTestProfile(JSON.parse(JSON.stringify(next))).rig).toEqual(next.rig);
    expect(() => parseTestProfile({...next, rig:{...next.rig,ballDiameterM:0}})).toThrow();
  });
  it('rejects malformed profiles and credential-bearing endpoints before applying', () => {
    for (const change of [{ fps: NaN }, { fps: 90.5 }, { analogGain: 2.5 }, { width: 1024.5 }, { infrared: 'auto' }, { bridgeUrl: 'https://localhost' }, { bridgeUrl: 'ws://user:pass@localhost' }, { predictionMs: 1000 }, { notes: 3 }]) {
      expect(() => parseTestProfile({ ...DEFAULT_TEST_PROFILE, ...change })).toThrow();
    }
    expect(parseTestProfile(DEFAULT_TEST_PROFILE)).toEqual(DEFAULT_TEST_PROFILE);
  });
  it('reports nearest rank tail latency and population jitter without dropping long stalls', () => {
    expect(distribution([])).toBeNull();
    const d = distribution([...Array(99).fill(10), 500])!;
    expect(d.p50).toBe(10); expect(d.p99).toBe(10); expect(d.max).toBe(500); expect(d.jitter).toBeGreaterThan(48);
  });
  it('deduplicates source frames while retaining browser cadence and no physical claims', () => {
    const m = new TestSessionMetrics();
    m.record(16, 'live', 10, 2, 0); m.record(16, 'live', 10, 2, 16);
    m.record(500, 'live', 11, 4, 1);
    const result = m.snapshot();
    expect(result.frameCount).toBe(3); expect(result.sourceSamples).toBe(2);
    expect(result.processingMs?.count).toBe(2); expect(result.cadenceMs?.max).toBe(500);
    expect(result.physicalMotionToPhotonMs).toBeNull(); expect(result.physicalMappingErrorMm).toBeNull();
  });
  it('keeps absent processing absent and rejects mixed source epochs', () => {
    const metrics = new TestSessionMetrics();
    metrics.record(16, 'simulation', 1, null, 0);
    expect(metrics.snapshot().processingMs).toBeNull();
    expect(metrics.acceptsSource('physical')).toBe(false);
    expect(() => metrics.record(16, 'physical', 2, 3, 0)).toThrow(/Source changed/);
    expect(metrics.snapshot().sourceKey).toBe('simulation');
    expect(metrics.snapshot().frameCount).toBe(1);
    expect(parseTestProfile({ ...DEFAULT_TEST_PROFILE, analogGain: null }).analogGain).toBeNull();
  });
});
