/**
 * Camera HUD: the live camera picture with the tracked ball drawn over it as a
 * heads-up display, filling the main viewport. It shares the camera preview
 * feed with auto-centring and draws the tracked outline from the 91 Hz
 * tracking stream, so the outline stays current between camera pictures.
 */

export interface HudTrack {
  centerPx: [number, number];
  majorPx: number;
  minorPx: number;
  angleDeg: number;
  frameWidthPx: number;
  frameHeightPx: number;
  velocityPxPerS: [number, number];
  ageMs: number;
  /** The tracker's own confidence in this outline, 0..1. */
  confidence?: number;
}

export interface HudStatus {
  status: string;
  confidence: number;
  connected: boolean;
  processingMs: number | null;
  /** Tracking states received so far; the HUD turns this into a measured rate. */
  receivedFrames: number;
}

export interface HudFrame { image: CanvasImageSource; width: number; height: number }

interface HudDeps {
  track(): HudTrack | null;
  status(): HudStatus;
  /** Called when the HUD is shown or hidden, so the camera feed can start or stop. */
  onActiveChange(active: boolean): void;
}

const KEY = 'orbital.camera-hud/1.0';
const TEAL = '#4dffd2';
const TEAL_SOFT = 'rgba(77, 255, 210, 0.55)';
const AMBER = '#ffc861';
const FONT = '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace';

export class CameraHud {
  private readonly canvas: HTMLCanvasElement;
  private readonly toggle: HTMLDivElement;
  private active = false;
  private view: 'twin' | 'split' | 'camera' = 'split';
  private frame: HudFrame | null = null;
  private frameAtMs = 0;
  private readonly frameTimes: number[] = [];
  private readonly drawTimes: number[] = [];
  private readonly trail: Array<{ x: number; y: number; t: number }> = [];
  private readonly heights: number[] = [];
  private readonly received: Array<{ t: number; n: number }> = [];
  private raf = 0;

  constructor(private readonly shell: HTMLElement, private readonly deps: HudDeps) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'camera-hud';
    this.canvas.hidden = true;
    this.canvas.setAttribute('aria-label', 'Live camera view with the tracked ball outline');
    shell.append(this.canvas);
    this.toggle = document.createElement('div');
    this.toggle.className = 'viewport-view-toggle';
    this.toggle.setAttribute('role', 'group');
    this.toggle.setAttribute('aria-label', 'Main view');
    this.toggle.innerHTML = '<button type="button" data-view="twin" aria-pressed="false">3D twin</button><button type="button" data-view="split" aria-pressed="false">Split</button><button type="button" data-view="camera" aria-pressed="false">Camera HUD</button>';
    shell.append(this.toggle);
    this.toggle.addEventListener('click', (event) => {
      const view = (event.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.view;
      if (view === 'twin' || view === 'split' || view === 'camera') this.setView(view);
    });
    let stored: string | null = null;
    try { stored = localStorage.getItem(KEY); } catch { /* per-viewer preference only */ }
    // Side by side unless the viewer chose otherwise: the twin and the camera, watched together.
    this.setView(stored === 'twin' || stored === 'camera' ? stored : 'split', true);
  }

  /** True while the camera picture is on screen (split or full). */
  get isActive(): boolean { return this.active; }
  /** True when the camera covers the whole view, so the twin need not render. */
  get coversTwin(): boolean { return this.view === 'camera'; }

  setView(view: 'twin' | 'split' | 'camera', force = false): void {
    if (this.view === view && !force) return;
    this.view = view;
    this.shell.dataset.mainView = view;
    this.toggle.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    try { localStorage.setItem(KEY, view); } catch { /* ignore */ }
    // The twin's container changes width; let it re-measure.
    window.dispatchEvent(new Event('resize'));
    const active = view !== 'twin';
    this.canvas.hidden = !active;
    if (active === this.active && !force) return;
    this.active = active;
    this.deps.onActiveChange(active);
    cancelAnimationFrame(this.raf);
    if (active) this.raf = requestAnimationFrame(this.draw);
  }

  /** A new camera picture from the preview feed. */
  pushFrame(frame: HudFrame): void {
    this.frame = frame;
    this.frameAtMs = performance.now();
    this.frameTimes.push(this.frameAtMs);
    while (this.frameTimes.length && this.frameAtMs - this.frameTimes[0] > 1000) this.frameTimes.shift();
  }

  private readonly draw = (): void => {
    if (!this.active) return;
    this.raf = requestAnimationFrame(this.draw);
    const now = performance.now();
    this.drawTimes.push(now);
    while (this.drawTimes.length && now - this.drawTimes[0] > 1000) this.drawTimes.shift();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#010507';
    ctx.fillRect(0, 0, cw, ch);

    // Camera picture, contained, as a teal-toned monochrome plate.
    const frame = this.frame;
    const fw = frame?.width ?? 4, fh = frame?.height ?? 3;
    const scale = Math.min(cw / fw, ch / fh) * 0.94;
    const dw = fw * scale, dh = fh * scale, dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    const live = !!frame && now - this.frameAtMs < 1500;
    if (frame) {
      ctx.globalAlpha = live ? 1 : 0.35;
      ctx.filter = 'grayscale(1) contrast(1.2) brightness(0.85)';
      ctx.drawImage(frame.image, dx, dy, dw, dh);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = 'rgba(0, 190, 160, 0.55)';
      ctx.fillRect(dx, dy, dw, dh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    const vignette = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, cw, ch);
    this.frameCorners(ctx, dx, dy, dw, dh, dpr);

    // Tracked ball.
    const status = this.deps.status();
    const track = status.connected ? this.deps.track() : null;
    let lockText = 'SEARCHING';
    if (track && live) {
      const k = dw / track.frameWidthPx;
      const cx = dx + track.centerPx[0] * k, cy = dy + track.centerPx[1] * (dh / track.frameHeightPx);
      const a = (track.majorPx / 2) * k, b = (track.minorPx / 2) * k, angle = track.angleDeg * Math.PI / 180;
      this.trail.push({ x: track.centerPx[0], y: track.centerPx[1], t: now });
      while (this.trail.length && now - this.trail[0].t > 1400) this.trail.shift();
      this.heights.push(track.centerPx[1] / track.frameHeightPx);
      if (this.heights.length > 240) this.heights.shift();
      this.drawTrail(ctx, dx, dy, k, dh / track.frameHeightPx, now, dpr);
      this.drawTarget(ctx, cx, cy, a, b, angle, dpr, track.confidence ?? status.confidence);
      const [vx, vy] = track.velocityPxPerS;
      const speed = Math.hypot(vx, vy);
      if (speed > 20) {
        const ex = cx + vx * 0.25 * k, ey = cy + vy * 0.25 * k;
        ctx.strokeStyle = AMBER; ctx.lineWidth = 2 * dpr; ctx.shadowColor = AMBER; ctx.shadowBlur = 10 * dpr;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
        const h = Math.atan2(ey - cy, ex - cx);
        ctx.beginPath(); ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 9 * dpr * Math.cos(h - 0.4), ey - 9 * dpr * Math.sin(h - 0.4));
        ctx.lineTo(ex - 9 * dpr * Math.cos(h + 0.4), ey - 9 * dpr * Math.sin(h + 0.4));
        ctx.closePath(); ctx.fillStyle = AMBER; ctx.fill(); ctx.shadowBlur = 0;
      }
      this.targetLabel(ctx, dpr, [
        ['TARGET 01', 'SPHERE'],
        ['LOCK', `${Math.round((track.confidence ?? status.confidence) * 100)}%`],
        ['DIAMETER', `${Math.round(track.majorPx)} × ${Math.round(track.minorPx)} PX`],
        ['VELOCITY', `${Math.round(speed)} PX/S`],
        ['POSITION', `${Math.round(track.centerPx[0])}, ${Math.round(track.centerPx[1])}`],
      ]);
      lockText = status.status === 'tracking' ? 'OPTICAL LOCK' : status.status.toUpperCase();
    } else {
      this.trail.length = 0;
    }

    // Header and telemetry.
    // In split view the view switch sits over this panel's top-left, so the header drops below it.
    const narrow = cw / dpr < 900;
    // Below the view switch and the corner buttons, which sit across the top edge.
    const top = 78 * dpr;
    this.text(ctx, 'ORBITAL', 22 * dpr, top, 13 * dpr, TEAL, 700, 0.3);
    this.text(ctx, narrow ? 'LIVE OPTICAL TRACKING' : 'SPHERICAL PROJECTION  ·  LIVE OPTICAL TRACKING', 22 * dpr, top + 18 * dpr, 10 * dpr, 'rgba(210,255,245,0.6)', 400, 0.18);
    const good = lockText === 'OPTICAL LOCK';
    // Steady light: teal while the tracker holds the ball, amber otherwise.
    ctx.fillStyle = good ? TEAL : AMBER;
    ctx.beginPath(); ctx.arc(cw - 190 * dpr, top - 4 * dpr, 4 * dpr, 0, Math.PI * 2); ctx.fill();
    this.text(ctx, live ? lockText : 'NO SIGNAL', cw - 178 * dpr, top, 11 * dpr, good ? TEAL : AMBER, 700, 0.2);
    this.text(ctx, clockTime(), cw - 178 * dpr, top + 18 * dpr, 10 * dpr, 'rgba(210,255,245,0.55)', 400, 0.12);
    const camFps = this.frameTimes.length, hudFps = this.drawTimes.length;
    // Measured tracking rate: states received over the last second.
    this.received.push({ t: now, n: status.receivedFrames });
    while (this.received.length > 2 && now - this.received[0].t > 1000) this.received.shift();
    const span = now - this.received[0].t;
    const trackHz = status.connected && span > 250 ? ((status.receivedFrames - this.received[0].n) * 1000) / span : null;
    const rows: Array<[string, string]> = [
      ['CAMERA', track ? `HUATENG GIGE · ${track.frameWidthPx}×${track.frameHeightPx}` : 'HUATENG GIGE'],
      ['TRACK', trackHz === null ? '—' : `${Math.round(trackHz)} HZ`],
      ['FEED', `${camFps} FPS`],
      ['HUD', `${hudFps} FPS`],
      ['PROCESS', status.processingMs === null ? '—' : `${status.processingMs.toFixed(1)} MS`],
      ['AGE', track ? `${Math.round(track.ageMs)} MS` : '—'],
    ];
    rows.forEach(([label, value], i) => {
      const y = ch - (22 + (rows.length - 1 - i) * 17) * dpr;
      this.text(ctx, label, 22 * dpr, y, 10 * dpr, 'rgba(210,255,245,0.45)', 400, 0.18);
      this.text(ctx, value, 92 * dpr, y, 10 * dpr, TEAL, 600, 0.1);
    });
    this.altitude(ctx, cw - 46 * dpr, dy + dh * 0.15, dh * 0.7, dpr);
    ctx.restore();
  };

  private drawTarget(ctx: CanvasRenderingContext2D, cx: number, cy: number, a: number, b: number, angle: number, dpr: number, confidence: number): void {
    ctx.save();
    ctx.shadowColor = TEAL; ctx.shadowBlur = 16 * dpr;
    ctx.strokeStyle = TEAL; ctx.lineWidth = 2.2 * dpr;
    ctx.beginPath(); ctx.ellipse(cx, cy, a, b, angle, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    // Outer ring in four arcs; how much of each arc is drawn is the tracker's lock confidence.
    ctx.strokeStyle = TEAL_SOFT; ctx.lineWidth = 1.2 * dpr;
    const r = Math.max(a, b) * 1.16;
    for (let i = 0; i < 4; i++) {
      const start = -Math.PI / 4 + i * Math.PI / 2 - (Math.PI / 4) * confidence;
      ctx.beginPath(); ctx.arc(cx, cy, r, start, start + (Math.PI / 2) * confidence); ctx.stroke();
    }
    // Corner brackets.
    const s = Math.max(a, b) * 1.3, arm = s * 0.28;
    ctx.strokeStyle = TEAL; ctx.lineWidth = 2 * dpr;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * s, cy + sy * (s - arm)); ctx.lineTo(cx + sx * s, cy + sy * s); ctx.lineTo(cx + sx * (s - arm), cy + sy * s);
      ctx.stroke();
    }
    // Crosshair with ticks.
    ctx.lineWidth = 1 * dpr; ctx.strokeStyle = 'rgba(77,255,210,0.8)';
    const g = Math.min(a, b) * 0.18;
    ctx.beginPath();
    ctx.moveTo(cx - g * 2.2, cy); ctx.lineTo(cx - g * 0.6, cy); ctx.moveTo(cx + g * 0.6, cy); ctx.lineTo(cx + g * 2.2, cy);
    ctx.moveTo(cx, cy - g * 2.2); ctx.lineTo(cx, cy - g * 0.6); ctx.moveTo(cx, cy + g * 0.6); ctx.lineTo(cx, cy + g * 2.2);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 2 * dpr, 0, Math.PI * 2); ctx.fillStyle = TEAL; ctx.fill();
    ctx.restore();
  }

  private drawTrail(ctx: CanvasRenderingContext2D, dx: number, dy: number, kx: number, ky: number, now: number, dpr: number): void {
    if (this.trail.length < 2) return;
    ctx.save();
    ctx.lineWidth = 2 * dpr; ctx.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const p = this.trail[i - 1], q = this.trail[i];
      const age = (now - q.t) / 1400;
      ctx.strokeStyle = `rgba(255, 200, 97, ${Math.max(0, 0.75 * (1 - age))})`;
      ctx.beginPath(); ctx.moveTo(dx + p.x * kx, dy + p.y * ky); ctx.lineTo(dx + q.x * kx, dy + q.y * ky); ctx.stroke();
    }
    ctx.restore();
  }

  /** Target readout, parked in the bottom-right corner so it never covers the ball. */
  private targetLabel(ctx: CanvasRenderingContext2D, dpr: number, rows: Array<[string, string]>): void {
    const w = 190 * dpr, h = (rows.length * 16 + 14) * dpr;
    // Left of the altitude gauge, level with the telemetry in the bottom-left corner.
    const x = this.canvas.width - w - 70 * dpr, y = this.canvas.height - h - 14 * dpr;
    ctx.save();
    ctx.fillStyle = 'rgba(2, 18, 20, 0.62)'; ctx.strokeStyle = 'rgba(77,255,210,0.35)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    ctx.fillStyle = TEAL; ctx.fillRect(x, y, 3 * dpr, h);
    rows.forEach(([label, value], i) => {
      const ry = y + (18 + i * 16) * dpr;
      this.text(ctx, label, x + 12 * dpr, ry, 9.5 * dpr, 'rgba(210,255,245,0.5)', 400, 0.16);
      this.text(ctx, value, x + 88 * dpr, ry, 9.5 * dpr, i === 0 ? AMBER : TEAL, 600, 0.08);
    });
    ctx.restore();
  }

  private altitude(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, dpr: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(77,255,210,0.35)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke();
    for (let i = 0; i <= 10; i++) { const ty = y + (h * i) / 10; ctx.beginPath(); ctx.moveTo(x - (i % 5 === 0 ? 10 : 5) * dpr, ty); ctx.lineTo(x, ty); ctx.stroke(); }
    const last = this.heights[this.heights.length - 1];
    if (last !== undefined) {
      ctx.strokeStyle = 'rgba(255,200,97,0.55)';
      ctx.beginPath();
      this.heights.forEach((v, i) => { const px = x - 12 * dpr - (this.heights.length - 1 - i) * 0.25 * dpr, py = y + v * h; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.stroke();
      ctx.fillStyle = AMBER;
      ctx.beginPath(); ctx.moveTo(x + 2 * dpr, y + last * h); ctx.lineTo(x + 10 * dpr, y + last * h - 5 * dpr); ctx.lineTo(x + 10 * dpr, y + last * h + 5 * dpr); ctx.fill();
    }
    this.text(ctx, 'ALT', x - 10 * dpr, y - 10 * dpr, 9 * dpr, 'rgba(210,255,245,0.5)', 400, 0.2);
    ctx.restore();
  }

  private frameCorners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dpr: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(77,255,210,0.5)'; ctx.lineWidth = 1.5 * dpr;
    const arm = 26 * dpr;
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x + w, y + h, -1, -1], [x, y + h, 1, -1]] as const) {
      ctx.beginPath(); ctx.moveTo(cx, cy + sy * arm); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * arm, cy); ctx.stroke();
    }
    ctx.restore();
  }

  private text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, weight: number, tracking: number): void {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${tracking}em`;
    ctx.fillText(value, x, y);
  }
}

/** Local time of day to the millisecond: when this picture is on screen. */
function clockTime(): string {
  const now = new Date();
  return `${[now.getHours(), now.getMinutes(), now.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
}
