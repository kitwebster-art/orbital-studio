import { describe, expect, it } from 'vitest';
import { CalibrationSession, grayBitCount, isPatternWhite, patternRuns, parseStructuredLightResult, scanQualifiesForLive, PATTERN_SCHEMA, RESULT_SCHEMA, PROGRESS_SCHEMA, mappingLimitPx, scanLayoutUsable } from './structuredLight';
import { SAMPLE_RESULT } from './structuredLight.fixture';


describe('Gray-code pattern bits', () => {
  it('uses ceil(log2(size)) bits', () => {
    expect(grayBitCount(1920)).toBe(11); expect(grayBitCount(1080)).toBe(11); expect(grayBitCount(1024)).toBe(10); expect(grayBitCount(1)).toBe(0);
  });
  it('bit 0 is the most significant bit of g = n ^ (n >> 1)', () => {
    const p = (bit: number, inverted = false) => ({ kind: 'gray' as const, axis: 'x' as const, bit, inverted });
    // 1024 wide, 10 bits: MSB of Gray code flips at column 512.
    expect(isPatternWhite(p(0), 511, 0, 1024, 8)).toBe(false);
    expect(isPatternWhite(p(0), 512, 0, 1024, 8)).toBe(true);
    // Bit 1 of Gray code: g = n ^ (n>>1), second MSB is on for 256..767.
    expect(isPatternWhite(p(1), 255, 0, 1024, 8)).toBe(false);
    expect(isPatternWhite(p(1), 256, 0, 1024, 8)).toBe(true);
    expect(isPatternWhite(p(1), 767, 0, 1024, 8)).toBe(true);
    expect(isPatternWhite(p(1), 768, 0, 1024, 8)).toBe(false);
    expect(isPatternWhite(p(1, true), 768, 0, 1024, 8)).toBe(true);
    // Every column decodes back to itself from the 10 bits.
    for (const c of [0, 1, 2, 3, 137, 511, 512, 1000, 1023]) {
      let g = 0; for (let bit = 0; bit < 10; bit += 1) g = (g << 1) | (isPatternWhite(p(bit), c, 0, 1024, 8) ? 1 : 0);
      let n = g; for (let s = g >> 1; s; s >>= 1) n ^= s;
      expect(n).toBe(c);
    }
  });
  it('y axis uses row and height', () => {
    const p = { kind: 'gray' as const, axis: 'y' as const, bit: 0, inverted: false };
    expect(isPatternWhite(p, 0, 1023, 1920, 1080)).toBe(false);
    expect(isPatternWhite(p, 0, 1024, 1920, 1080)).toBe(true);
    expect(isPatternWhite({ kind: 'white' }, 5, 5, 10, 10)).toBe(true);
    expect(isPatternWhite({ kind: 'black' }, 5, 5, 10, 10)).toBe(false);
  });
  it('runs cover exactly the white pixels', () => {
    const p = { kind: 'gray' as const, axis: 'x' as const, bit: 2, inverted: true };
    const runs = patternRuns(p, 100, 10);
    for (let c = 0; c < 100; c += 1) expect(runs.some(([a, b]) => c >= a && c < b)).toBe(isPatternWhite(p, c, 0, 100, 10));
    expect(patternRuns({ kind: 'white' }, 100, 10)).toEqual([[0, 100]]);
    expect(patternRuns({ kind: 'black' }, 100, 10)).toEqual([]);
  });
});

describe('calibration session state machine', () => {
  const pattern = (index: number, total = 3) => ({ schema_version: PATTERN_SCHEMA, session_id: 'cal-1', index, total, pattern: { kind: 'gray', axis: 'x', bit: index, inverted: false } });
  it('runs idle -> running -> result with acks', () => {
    const s = new CalibrationSession(); expect(s.state).toBe('idle');
    s.start('cal-1', 0); expect(s.state).toBe('running');
    const ev = s.handleMessage(pattern(0), 100); expect(ev.type).toBe('draw');
    expect(s.ack(0, 150)).toEqual({ schema_version: 'orbital.calibration-pattern-ack/1.0', session_id: 'cal-1', index: 0 });
    expect(s.ack(1, 150)).toBeNull();
    expect(s.handleMessage({ ...pattern(1), session_id: 'other' }, 200).type).toBe('ignored');
    s.handleMessage(pattern(1), 300); s.ack(1, 300); s.handleMessage(pattern(2), 400); s.ack(2, 400);
    expect(s.stage).toBe('decoding');
    expect(s.checkWatchdog(10_000)).toBe(false); // solve timer is longer
    expect(s.handleMessage({ schema_version: PROGRESS_SCHEMA, session_id: 'cal-1', stage: 'solving', index: 2, total: 3, message: 'Solving' }, 11_000).type).toBe('progress');
    const done = s.handleMessage({ schema_version: RESULT_SCHEMA, session_id: 'cal-1', ok: true, error: null, result: SAMPLE_RESULT }, 12_000);
    expect(done.type).toBe('result'); expect(s.state).toBe('result'); expect(s.progress).toBe(1);
    expect(s.handleMessage(pattern(0), 13_000).type).toBe('ignored');
  });
  it('fires the 3 s per-pattern watchdog', () => {
    const s = new CalibrationSession(); s.start('cal-1', 0);
    expect(s.checkWatchdog(2_999)).toBe(false); expect(s.checkWatchdog(3_001)).toBe(true); expect(s.state).toBe('error');
    const t = new CalibrationSession(); t.start('cal-1', 0); t.handleMessage(pattern(0), 1_000); t.ack(0, 1_050);
    expect(t.checkWatchdog(4_000)).toBe(false); expect(t.checkWatchdog(4_100)).toBe(true); expect(t.error).toMatch(/pattern 1/);
  });
  it('cancels from either side and reports bridge errors', () => {
    const s = new CalibrationSession(); s.start('cal-1', 0);
    expect(s.cancel()).toEqual({ schema_version: 'orbital.camera-control/1.0', request_id: 'cal-1-cancel', action: 'calibrate-cancel' });
    expect(s.state).toBe('cancelled'); expect(s.cancel()).toBeNull();
    const b = new CalibrationSession(); b.start('cal-1', 0);
    expect(b.handleMessage({ schema_version: 'orbital.camera-control/1.0', request_id: 'x', action: 'calibrate-cancel' }, 1).type).toBe('cancelled');
    const e = new CalibrationSession(); e.start('cal-1', 0);
    expect(e.handleMessage({ schema_version: RESULT_SCHEMA, session_id: 'cal-1', ok: false, error: 'ball not found', result: null }, 1)).toEqual({ type: 'error', error: 'ball not found' });
    const bad = new CalibrationSession(); bad.start('cal-1', 0);
    expect(bad.handleMessage({ ...pattern(0), pattern: { kind: 'plaid' } }, 1).type).toBe('error');
    expect(() => { const r = new CalibrationSession(); r.start('a', 0); r.start('b', 0); }).toThrow(/already/);
  });
});

describe('scan result validation', () => {
  it('parses the contract example and gates on verdict and rms', () => {
    const r = parseStructuredLightResult(SAMPLE_RESULT);
    expect(r.ball_projector?.major_px).toBe(420); expect(scanQualifiesForLive(r)).toBe(true);
    expect(scanQualifiesForLive({ ...r, quality: { verdict: 'POOR', reasons: [] } })).toBe(false);
    // Limit scales with ball size: max(4 px, 1.2% of the 420 px projected diameter) = 5.04 px.
    expect(mappingLimitPx(r)).toBeCloseTo(5.04, 6);
    expect(scanQualifiesForLive({ ...r, mapping: { ...r.mapping!, rms_px: 4.9 } })).toBe(true);
    expect(scanQualifiesForLive({ ...r, mapping: { ...r.mapping!, rms_px: 5.2 } })).toBe(false);
    const small = { ...r, ball_projector: { ...r.ball_projector!, major_px: 150, minor_px: 148 } };
    expect(mappingLimitPx(small)).toBe(4);
    expect(scanQualifiesForLive({ ...small, mapping: { ...r.mapping!, rms_px: 4.5 } })).toBe(false);
    expect(scanQualifiesForLive({ ...r, mapping: null })).toBe(false);
    expect(() => parseStructuredLightResult({ ...SAMPLE_RESULT, mapping: { ...SAMPLE_RESULT.mapping, camera_to_projector: [1, 2] } })).toThrow();
    expect(() => parseStructuredLightResult({ ...SAMPLE_RESULT, quality: { verdict: 'MAYBE' } })).toThrow();
  });
});

describe('scan layout use', () => {
  it('fills the layout only from an available, not-low-confidence 3D estimate', () => {
    const r = parseStructuredLightResult(SAMPLE_RESULT);
    expect(scanLayoutUsable({ ...r, estimate3d: { ...r.estimate3d!, confidence: 'medium' } })).toBe(true);
    expect(scanLayoutUsable({ ...r, estimate3d: { ...r.estimate3d!, confidence: 'low' } })).toBe(false);
    expect(scanLayoutUsable({ ...r, estimate3d: { ...r.estimate3d!, available: false } })).toBe(false);
  });

  it('parses the lens values the bridge found', () => {
    const r = parseStructuredLightResult({ ...SAMPLE_RESULT, estimate3d: { ...SAMPLE_RESULT.estimate3d,
      projector_intrinsics: { vertical_fov_deg: 33, principal_point_norm: [0.5, 0.95], source: 'scan' },
      camera_intrinsics: { focal_scale: 0.947, source: 'scan-and-measured-diameter' } } });
    expect(r.estimate3d?.projector_intrinsics).toEqual({ vertical_fov_deg: 33, principal_point_norm: [0.5, 0.95], source: 'scan' });
    expect(r.estimate3d?.camera_intrinsics?.focal_scale).toBe(0.947);
  });
});
