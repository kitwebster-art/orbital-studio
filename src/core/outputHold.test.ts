import { describe, expect, it } from 'vitest';
import { OutputHold, STRUCTURED_LIGHT_HOLD_MS, ellipseEdgeNote } from './outputHold';

const ball = { centerPx: [960, 540] as [number, number], majorPx: 600, minorPx: 580, angleDeg: 0 };

describe('structured-light output hold', () => {
  it('rides out a brief tracking dropout, then blacks out', () => {
    const hold = new OutputHold();
    expect(hold.resolve(0, null, ball)).toEqual({ ellipse: ball, blocked: null, held: false });
    expect(hold.resolve(20, 'LIVE_TRACKING_NOT_READY', null)).toMatchObject({ ellipse: ball, blocked: null, held: true });
    expect(hold.resolve(STRUCTURED_LIGHT_HOLD_MS + 1, 'LIVE_TRACKING_EXPIRED', null)).toMatchObject({ ellipse: null, blocked: 'LIVE_TRACKING_EXPIRED' });
  });

  it('never holds through an operator blackout or a moved projector window', () => {
    const hold = new OutputHold();
    hold.resolve(0, null, ball);
    expect(hold.resolve(10, 'OPERATOR_BLACKOUT', null)).toMatchObject({ ellipse: null, blocked: 'OPERATOR_BLACKOUT' });
    expect(hold.resolve(20, 'LIVE_TRACKING_NOT_READY', null).ellipse).toBeNull();
    hold.resolve(30, null, ball);
    expect(hold.resolve(40, 'PROJECTOR_WINDOW_CHANGED_SINCE_SCAN', null).blocked).toBe('PROJECTOR_WINDOW_CHANGED_SINCE_SCAN');
  });

  it('says which side of the picture the ball runs off', () => {
    expect(ellipseEdgeNote(ball, 1920, 1080)).toBeNull();
    // 27 September, fan on: the ball centre dropped to y = 786 with a 440 px radius.
    const note = ellipseEdgeNote({ centerPx: [895, 786], majorPx: 900, minorPx: 880, angleDeg: 90 }, 1920, 1080);
    expect(note).toContain('bottom');
    expect(note).toMatch(/^the ball runs 1[0-9]% off the bottom/);
  });
});
