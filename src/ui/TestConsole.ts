import { DEFAULT_TEST_RIG, parseTestRigSetup, testRigSignature, verticalFovFromThrow, nudgeTestRigPosition, nudgeTestRigFov, type TestRigSetup, type NudgeTarget } from '../core/testRig';
import { describeOutputBlockReason } from '../core/projectionOutputGate';
import { CameraControlClient, type CameraControlReply } from '../adapters/CameraControlClient';
import { DEFAULT_TEST_PROFILE, parseTestProfile, TestSessionMetrics, type TestProfile } from '../core/testSession';
import type { RuntimeSnapshot } from '../core/contracts';
import type { LiveBridgeStatus } from '../adapters/WebSocketTrackingAdapter';
import { aimAdvice, parseCameraPreview, type CameraPreview } from '../core/aimView';
import { CalibrationSession, mappingLimitPx, scanLayoutUsable, scanQualifiesForLive, parseStructuredLightResult, type CalibrationPattern, type SessionState, type StructuredLightResult } from '../core/structuredLight';
import { BALL_SIZE_OPTIONS, QUICK_CAMERA, cameraSettingsMatch, infraredLooksOff, infraredLooksOn, nextScanExposure } from '../core/quickStart';
import { scanToRigFields, SCAN_PROFILE_KEY, type StoredScanProfile } from '../core/scanMapping';
import { AutoCentre, measureProjectionOffset, type LiveCalibration } from '../core/autoCentre';
import { measureProjectorDelay } from '../core/delayProbe';
import type { HudFrame } from './CameraHud';

interface TestConsoleCallbacks {
  blackout(active: boolean): void;
  connectTracking(url: string): void;
  prediction(ms: number): void;
  importGeometry(value: unknown): string;
  importProjection(value: unknown): string;
  selectLook(id: string): void;
  configuration(): unknown;
  setupRig(rig: TestRigSetup): void;
  /** Apply a small geometry change immediately, without blackout or closing output windows. */
  nudgeRig(rig: TestRigSetup): void;
  /** Current output gate result for P1, null when output may show. */
  outputBlockReason(): string | null;
  /** Set when the projected ball runs off the projector picture. */
  projectedEdgeNote?(): string | null;
  /** Draw a structured-light pattern in the P1 window; resolves after two popup animation frames. */
  showPattern(pattern: CalibrationPattern, width: number, height: number): Promise<void>;
  clearPattern(): void;
  hasProjectorWindow(): boolean;
  /** Make the projector window full screen from a click here; false if it cannot. */
  projectorFullscreen?(): boolean;
  /** True when the P1 projector window fills its screen (HTML or macOS full screen). */
  projectorWindowFullscreen(): boolean;
  /** On-screen device-pixel layout of the P1 raster; a scan is only valid while this is unchanged. */
  projectorSurfaceSignature(): string | null;
  outputRaster(): { width: number; height: number };
  /** Activate (result) or deactivate (null) the structured-light 2D mapping for live output. */
  useScanForLive(result: StructuredLightResult | null, surfaceSignature: string | null): void;
  /** A new camera picture for the Camera HUD. */
  cameraFrame?(frame: HudFrame): void;
  /** True while the Camera HUD is on screen and wants pictures. */
  wantsCameraFeed?(): boolean;
  /** Tracked ball speed in camera pixels per second, or null when not tracking. */
  trackedSpeedPxPerS?(): number | null;
  /** Shift applied to the tracked centre before mapping, in camera pixels (auto-centring). */
  /** The live calibration model (position correction and size factor across the picture). */
  setLiveCalibration?(model: LiveCalibration): void;
  /** Delay probe: black out the projected ball, and read when the first black frame was drawn. */
  setProbeDark?(on: boolean): void;
  probeDarkDrawnAtMs?(): number | null;
  /** The measured delay from drawing a picture to its light reaching the ball, in seconds. */
  setProjectionLeadS?(seconds: number): void;
}
const KEY = 'orbital.test-profile/1.0';
const AUTO_CENTRE_KEY = 'orbital.live-calibration/1.0';
const AUTO_FIT_KEY = 'orbital.auto-fit/1.0';
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
function base64Blob(base64: string): Blob {
  const binary = atob(base64); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}
export class TestConsole {
  private readonly client = new CameraControlClient(() => {
    this.latestControl = null;
    this.el('test-device').textContent = 'Control connection closed. Device acknowledgement is stale; reconnect and refresh.';
    if (this.aimOn) this.showAimMessage('Camera link lost. Reconnecting by itself…');
    this.renderQuickLink();
    this.scheduleReconnect();
    if (this.scan.state === 'running') { this.scan.fail('Control connection closed during the scan'); this.finishScan(); }
  });
  private profile = { ...DEFAULT_TEST_PROFILE };
  private metrics = new TestSessionMetrics();
  private recording = false;
  private appliedRig: TestRigSetup | null = null;
  private sessionStart: { configuration: unknown; profile: TestProfile; source: LiveBridgeStatus | null; cameraAcknowledgement: CameraControlReply | null; world: RuntimeSnapshot['world'] | null; blackout: boolean } | null = null;
  private sessionStoppedAt: string | null = null;
  private lastUpdate = 0;
  private blackedOut = true;
  private latest: RuntimeSnapshot | null = null;
  private live: LiveBridgeStatus | null = null;
  private latestControl: CameraControlReply | null = null;
  private busy = false;
  private readonly section: HTMLElement;
  private readonly scan = new CalibrationSession();
  private scanWatchdog: number | null = null;
  private scanRaster = { width: 1920, height: 1080 };
  private scanResult: StructuredLightResult | null = null;
  /** P1 window layout the stored scan was taken with. */
  private scanSignature: string | null = null;
  private feedRunning = false;
  private readonly autoCentre = new AutoCentre();
  private lastCentreMeasureMs = 0;
  private lastCentreSaveMs = 0;
  private liveSinceMs: number | null = null;
  private autoFitEnabled = true;
  private probing = false;
  private probeDoneThisSession = false;
  private measuredDelayMs: number | null = null;
  private pendingScanSignature: string | null = null;
  private scanLive = false;
  /** Camera aim view state: polling generation guards against stale replies after toggling. */
  private aimOn = false;
  private aimGeneration = 0;
  private aimTimer: number | null = null;
  private aimLayer: HTMLCanvasElement | null = null;
  /** Quick start (two-button) flow state. */
  private quickBusy = false;
  private quickWaiter: ((proceed: boolean) => void) | null = null;
  private scanFinished: ((state: SessionState) => void) | null = null;
  private connecting = false;
  private reconnectTimer: number | null = null;
  constructor(host: HTMLElement, private readonly callbacks: TestConsoleCallbacks) {
    this.section = document.createElement('section');
    this.section.className = 'test-console control-section';
    this.section.dataset.workspacePanel = 'test';
    this.section.innerHTML = `
      <div class="test-heading"><span>ORBITAL / STAGE A</span><h2>Physical test bench</h2><p>One camera. One projector. Record the evidence.</p></div>
      <div class="test-status-strip"><strong id="test-source">SIMULATION</strong><span id="test-readiness">Output blacked out</span></div>
      <div class="test-quick" id="test-quick">
        <div class="test-quick-head"><strong>Quick start</strong><span id="test-quick-link" class="control-note">Camera bridge: connecting…</span></div>
        <label class="test-quick-ball">Ball<select id="test-quick-ball">${BALL_SIZE_OPTIONS.map(o => `<option value="${o.diameterM ?? ''}">${o.label}</option>`).join('')}</select></label>
        <div class="test-quick-actions">
          <button id="test-quick-scan" type="button" class="test-quick-button">1 · Scan</button>
          <button id="test-quick-live" type="button" class="test-quick-button">2 · Go live</button>
        </div>
        <p id="test-quick-say" class="test-quick-say" role="status" aria-live="polite" data-tone="wait">Put the projector window on the projector in full screen, then press Scan.</p>
        <div class="test-quick-actions" id="test-quick-extra" hidden><button id="test-quick-continue" type="button">Continue</button><button id="test-quick-cancel" type="button">Cancel</button></div>
        <div class="test-quick-actions test-quick-fullscreen-row"><button id="test-quick-fullscreen" type="button" title="Opens the projector window if needed, moves it to the projector and makes it full screen">⛶ Projector full screen</button></div>
        <div class="fit-pad" role="group" aria-label="Fine-tune the projection on the ball">
          <span class="fit-pad-label">Fine-tune</span>
          <div class="fit-pad-arrows">
            <button type="button" data-fit="up" aria-label="Move picture up" title="Move up (Shift: bigger step)">▲</button>
            <button type="button" data-fit="left" aria-label="Move picture left" title="Move left (Shift: bigger step)">◀</button>
            <button type="button" data-fit="right" aria-label="Move picture right" title="Move right (Shift: bigger step)">▶</button>
            <button type="button" data-fit="down" aria-label="Move picture down" title="Move down (Shift: bigger step)">▼</button>
          </div>
          <div class="fit-pad-size">
            <button type="button" data-fit="smaller" aria-label="Make picture smaller" title="Smaller">−</button>
            <button type="button" data-fit="bigger" aria-label="Make picture bigger" title="Bigger">+</button>
          </div>
          <label class="fit-pad-auto"><input id="test-fit-auto" type="checkbox" checked> Auto-fit</label>
          <button type="button" data-fit="reset" title="Clear all fine-tuning and self-fit for this scan">Reset</button>
        </div>
        <div class="test-quick-actions" id="test-quick-open-row" hidden><button id="test-quick-open" type="button">Open projector window</button></div>
        <p id="test-quick-readiness" class="control-note"></p>
        <p class="control-note">Press B any time to black out. Everything below is the manual version of these two buttons.</p>
      </div>
      <p class="control-note">Centre and spherical envelope tracking. Surface orientation is unavailable. Physical latency and mapping accuracy require independent measurement.</p>
      <details><summary>1 / Ball and equipment layout</summary>
        <label>Ball diameter / cm<input id="test-ball-diameter" type="number" min="5" max="500" step="1"></label>
        <p class="control-note">Measure the inflated ball across its widest part. Start at 50 cm and adjust to the actual size. This is a separate test setup; it does not change the full-scale artwork.</p>
        <div class="test-position-heading"><span>Position / metres</span><span>Left/right (X)</span><span>Height (Y)</span><span>Front/back (Z)</span></div>
        ${(['ball', 'projector', 'camera'] as const).map(device => `<div class="test-position-row"><strong>${device === 'ball' ? 'Ball centre' : device === 'projector' ? 'Projector lens' : 'Camera lens'}</strong>${(['x','y','z'] as const).map(axis => `<input id="test-${device}-${axis}" type="number" step="0.01" aria-label="${device} ${axis} position in metres">`).join('')}</div>`).join('')}
        <p class="control-note">Use one floor reference for every measurement. X runs right, Y is height above the floor, and positive Z comes towards the equipment. Device positions are measured at the lens. Both devices aim at the ball centre.</p>
        <label>Projector model<input id="test-projector-model" maxlength="120" placeholder="Read the exact model from its label"></label>
        <div class="test-fields"><label>Projector vertical field of view / °<input id="test-projector-fov" type="number" min="5" max="140" step="0.1"></label><label>Camera horizontal field of view / °<input id="test-camera-fov" type="number" min="5" max="140" step="0.1"></label></div>
        <div class="test-fov-fit"><span>Fit FOV from measurement</span><div class="test-fields"><label>Throw distance / m<input id="test-fov-throw" type="number" min="0.1" max="50" step="0.01" placeholder="lens to wall"></label><label>Projected image height / m<input id="test-fov-height" type="number" min="0.01" max="20" step="0.01" placeholder="full image height"></label></div><div class="test-actions"><button id="test-fov-fit" type="button">Write vertical FOV</button><span id="test-fov-result" class="control-note"></span></div><p class="control-note">Point the projector square at a flat wall, measure lens-to-wall distance and the full image height, then write the result. Vertical FOV = 2 · atan(h / 2d). Keep zoom fixed afterwards.</p></div>
        <label>Requested projector image<select id="test-output-raster"><option value="1920x1080">1920 × 1080 / landscape</option><option value="1280x720">1280 × 720 / landscape</option><option value="3840x2160">3840 × 2160 / landscape</option><option value="1080x1920">1080 × 1920 / portrait</option></select></label>
        <p class="control-note">Lens angles are editable planning values until calibrated. No Optoma model specifications are assumed. Confirm resolution, refresh rate, focus and permitted mounting orientation on the physical projector.</p>
        <div class="test-actions"><button id="test-apply-rig">Apply layout / reset alignment</button><button id="test-reset-rig">50 cm starter layout</button></div>
        <div class="test-nudge" aria-label="Live nudge controls">
          <div class="test-nudge-heading"><span>Live nudge</span><small>Applies immediately in simulation. Output stays open; imported calibration is invalidated.</small></div>
          ${(['projector', 'ball'] as const).map(device => (['x','y','z'] as const).map(axis => `<div class="test-nudge-row"><strong>${device === 'ball' ? 'Ball' : 'Projector'} ${axis.toUpperCase()}</strong>${(device === 'projector' ? [-0.1, -0.01, 0.01, 0.1] : [-0.01, 0.01]).map(step => `<button type="button" data-nudge="${device}" data-axis="${axis}" data-step="${step}" aria-label="Move ${device} ${axis} by ${step * 100} centimetres">${step > 0 ? '+' : '−'}${Math.abs(step * 100)} cm</button>`).join('')}</div>`).join('')).join('')}
          <div class="test-nudge-row"><strong>Vertical FOV</strong>${[-1, -0.25, 0.25, 1].map(step => `<button type="button" data-nudge-fov="${step}" aria-label="Change projector vertical field of view by ${step} degrees">${step > 0 ? '+' : '−'}${Math.abs(step)}°</button>`).join('')}</div>
        </div>
        <svg id="test-layout-diagram" viewBox="0 0 360 190" role="img" aria-label="Top view of ball, camera and projector layout"></svg>
        <p id="test-layout-summary" class="control-note"></p>
        <p id="test-layout-state" role="status" class="control-note">Manual setup preview. Measured alignment is still required for live projection.</p>
      </details>
      <details open><summary>2 / Camera and infrared</summary>
        <label>Session name<input id="test-name" maxlength="120"></label>
        <label>Local bridge<input id="test-url" spellcheck="false"></label>
        <div class="test-actions"><button data-camera="connect">Connect controls</button><button data-camera="status">Refresh status</button><button data-camera="discover">Discover devices</button></div>
        <label>Illumination / filter profile<select id="test-infrared"><option value="visible">Visible light</option><option value="850nm">850 nm infrared</option><option value="940nm">940 nm infrared</option></select></label>
        <p id="test-ir-note" class="control-note"></p>
        <div class="test-fields"><label>Exposure / µs<input id="test-exposure" type="number" min="1" max="100000"></label><label>Analogue gain / SDK units<input id="test-gain" type="number" min="0" max="10000" step="1" placeholder="Keep current gain"></label><label>Target fps<input id="test-fps" type="number" min="1" max="1000"></label><label>ROI width / px<input id="test-width" type="number" min="16" max="8192"></label><label>ROI height / px<input id="test-height" type="number" min="16" max="8192"></label></div>
        <div class="test-actions"><button data-camera="stop">Stop acquisition</button><button data-camera="configure">Apply while stopped</button><button data-camera="start">Start HuaTeng</button><button data-camera="simulate">Start simulated bridge</button></div>
        <div class="test-aim">
          <div class="test-actions"><button id="test-aim-toggle" type="button" aria-pressed="false">Show camera view</button><label class="test-aim-check"><input id="test-aim-mask" type="checkbox" checked> Highlight detected ball</label></div>
          <div id="test-aim-panel" class="test-aim-panel" hidden>
            <canvas id="test-aim-canvas" width="512" height="384" aria-label="Camera aim view: brightened camera picture with the detected ball highlighted"></canvas>
            <p id="test-aim-exposure" class="control-note" role="status" aria-live="polite"></p>
            <p id="test-aim-ball" class="control-note"></p>
            <p class="control-note test-aim-note">Setup view for aiming and focus: about three pictures a second, brightened so dark scenes are visible. Tracking itself never sends images to the browser. Turn it off once the camera is aimed.</p>
          </div>
        </div>
        <button id="test-use-live" class="wide-button">Use bridge tracking</button>
        <pre id="test-device">No acknowledged device state</pre>
      </details>
      <details><summary>3 / Calibration and output</summary>
        <label>Camera geometry JSON<input id="test-geometry" type="file" accept=".json,application/json"></label>
        <label>Projector calibration JSON<input id="test-projection" type="file" accept=".json,application/json"></label>
        <p id="test-calibration" class="control-note">Load measured camera geometry and projector calibration in the same world coordinate system. Image-space preview alone cannot enable live projection.</p>
        <label>Prediction horizon / ms<input id="test-prediction" type="number" min="0" max="100" step="1"></label>
        <p class="control-note">Start at 0. Set a measured compensation horizon, then compare boundary error at steady speed and direction reversals. This value is not a latency measurement.</p>
        <div class="test-actions"><button id="test-open-output">Open P1 output</button><button id="test-patterns">Projector patterns</button></div>
      </details>
      <details id="test-scan"><summary>4 / Scan and calibrate</summary>
        <p class="control-note">The projector shows a sequence of black, white and striped patterns while the camera watches the ball. Studio never sees the camera images; the bridge decodes them and returns the mapping.</p>
        <ol class="test-scan-steps control-note">
          <li>Hold the ball completely still. Any movement during the scan spoils it.</li>
          <li>Darken the room as far as you can. Turn off lights that shine on the ball.</li>
          <li>Open P1 output, drag it onto the projector and press Full screen. The window must stay open and fullscreen for the whole scan.</li>
          <li>Measure two things with a tape: camera lens to projector lens, and the ball's diameter (circumference divided by 3.14). With both, the scan also works out the true camera and projector lenses and can rate the 3D layout high confidence.</li>
          <li>Connect controls (step 2) and start the camera, then press Start scan. It takes about 30 to 60 seconds.</li>
        </ol>
        <div class="test-fields"><label>Camera lens to projector lens / m<input id="test-scan-baseline" type="number" min="0.01" max="20" step="0.01" placeholder="measure with a tape"></label><label>Measured ball diameter / m<input id="test-scan-diameter" type="number" min="0.05" max="5" step="0.01" placeholder="tape: circumference / 3.14"></label><label>Camera lens / mm<input id="test-scan-focal" type="number" min="1" max="200" step="0.1" value="6"></label></div>
        <div class="test-actions"><button id="test-scan-start" type="button">Start scan</button><button id="test-scan-cancel" type="button" disabled>Cancel</button></div>
        <progress id="test-scan-progress" max="1" value="0" aria-label="Scan progress"></progress>
        <p id="test-scan-status" role="status" aria-live="polite" class="control-note">No scan yet.</p>
        <div id="test-scan-card" class="test-scan-card" hidden></div>
        <div class="test-actions"><button id="test-scan-use-layout" type="button" disabled>Use scanned ball size and positions</button><button id="test-scan-use-live" type="button" aria-pressed="false" disabled>Use scan for live projection</button></div>
        <p id="test-scan-live-note" class="control-note test-scan-live-note" hidden>Structured-light 2D mapping is active. It is exact only at the depth where the ball was scanned; accuracy drops as the ball moves towards or away from the camera. Re-scan after moving the camera or projector.</p>
      </details>
      <details><summary>5 / Compositions</summary>
        <p class="control-note">Start with a legible surface. Use the Looks workspace for colour, scale, motion and the full shader library.</p>
        <div class="test-actions"><button data-test-look="geometric-grid">Alignment grid</button><button data-test-look="marble-veins">Fluid marble</button><button data-test-look="contour-field">Contour field</button></div>
      </details>
      <details><summary>6 / Record the evidence</summary>
        <div class="test-actions"><button id="test-record">Start measurement</button><button id="test-export">Export session JSON</button></div>
        <pre id="test-metrics">No measurement session running</pre>
        <label>Hardware, lighting and observations<textarea id="test-notes" rows="3" maxlength="4000" placeholder="Record projector signal, filter, illuminator, sphere size, speed and physical measurement method"></textarea></label>
        <div class="test-actions"><button id="test-save">Save profile</button><button id="test-profile-export">Export profile</button><label class="test-import">Import profile<input id="test-profile-import" type="file" accept=".json,application/json"></label></div>
      </details>
      <p id="test-message" role="status" aria-live="polite">Start the native bridge, then connect controls.</p>`;
    const purpose = host.querySelector('#workspace-purpose');
    if (purpose) purpose.after(this.section); else host.append(this.section);
    // Projector on/off, built into the header: one switch instead of a separate warning bar.
    const bar = document.createElement('div');
    bar.className = 'projector-switch';
    bar.dataset.state = 'blackout';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Projector output');
    bar.title = 'Projector output starts black. Press B any time to black out.';
    bar.innerHTML = '<span class="projector-switch-label">Projector</span><button id="test-blackout" type="button" aria-pressed="true"><i aria-hidden="true"></i>Blackout <kbd>B</kbd></button><button id="test-release" type="button" aria-pressed="false"><i aria-hidden="true"></i>On</button>';
    const header = document.querySelector('.studio-header');
    if (header) header.append(bar); else document.querySelector('.studio-shell')?.prepend(bar);
    try { const saved = localStorage.getItem(KEY); if (saved) this.profile = parseTestProfile(JSON.parse(saved)); } catch { this.message('Stored profile invalid or unavailable. Defaults loaded.'); }
    this.fill();
    this.callbacks.blackout(true);
    document.getElementById('test-blackout')!.addEventListener('click', () => this.setBlackout(true));
    document.getElementById('test-release')!.addEventListener('click', () => this.attempt(() => { this.requireAppliedRig(); this.setBlackout(false); }));
    document.addEventListener('keydown', event => {
      if (event.key.toLowerCase() !== 'b' || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)))) return;
      this.setBlackout(true);
    });
    this.section.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(button => button.addEventListener('click', () => void this.command(button.dataset.camera!)));
    this.el('test-apply-rig').addEventListener('click', () => this.attempt(() => {
      this.requireStopped(); const next = this.read(); this.applyRig(next.rig); this.profile = next;
      localStorage.setItem(KEY, JSON.stringify(next));
      this.message('Layout applied and saved. Output blacked out; old alignment cleared. Use a stationary ball first.');
    }));
    this.el('test-reset-rig').addEventListener('click', () => this.attempt(() => {
      this.requireStopped(); this.profile = { ...this.profile, rig: structuredClone(DEFAULT_TEST_RIG) }; this.fill();
      localStorage.setItem(KEY, JSON.stringify(this.profile)); this.message('50 cm starter layout saved. Measure and enter your actual lens positions.');
    }));
    this.section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[id^="test-ball-"], [id^="test-projector-"], [id^="test-camera-"], #test-output-raster').forEach(input => input.addEventListener('input', () => {
      this.el('test-layout-state').textContent = 'Layout edits pending. Apply layout before opening an output or measuring.';
    }));
    this.el('test-fov-fit').addEventListener('click', () => this.attempt(() => {
      this.requireStopped();
      const throwM = Number(this.el<HTMLInputElement>('test-fov-throw').value), heightM = Number(this.el<HTMLInputElement>('test-fov-height').value);
      const fov = verticalFovFromThrow(throwM, heightM);
      this.el<HTMLInputElement>('test-projector-fov').value = String(fov);
      this.el('test-fov-result').textContent = `${fov.toFixed(2)}° written. Apply layout, or use the FOV nudges, to use it.`;
      this.el('test-layout-state').textContent = 'Layout edits pending. Apply layout before opening an output or measuring.';
    }));
    this.section.querySelectorAll<HTMLButtonElement>('[data-nudge]').forEach(button => button.addEventListener('click', () => this.attempt(() => {
      this.nudge(rig => nudgeTestRigPosition(rig, button.dataset.nudge as NudgeTarget, button.dataset.axis as 'x' | 'y' | 'z', Number(button.dataset.step)));
    })));
    this.section.querySelectorAll<HTMLButtonElement>('[data-nudge-fov]').forEach(button => button.addEventListener('click', () => this.attempt(() => {
      this.nudge(rig => nudgeTestRigFov(rig, Number(button.dataset.nudgeFov)));
    })));
    this.el('test-infrared').addEventListener('change', () => this.irNote());
    this.el('test-aim-toggle').addEventListener('click', () => this.setAim(!this.aimOn));
    this.el('test-quick-scan').addEventListener('click', () => { if (this.quickOpenProjectorFirst()) void this.quickScan(); });
    this.el('test-quick-live').addEventListener('click', () => { if (this.quickOpenProjectorFirst()) void this.quickGoLive(); });
    this.el('test-quick-continue').addEventListener('click', () => this.quickWaiter?.(true));
    this.el('test-quick-cancel').addEventListener('click', () => { if (this.scan.state === 'running') this.cancelScan('Scan cancelled.'); this.quickWaiter?.(false); });
    this.el('test-quick-open').addEventListener('click', () => this.attempt(() => this.openProjectorWindow()));
    this.el('test-quick-fullscreen').addEventListener('click', () => this.attempt(() => this.projectorFullscreenFromHere()));
    this.section.querySelectorAll<HTMLButtonElement>('[data-fit]').forEach((button) => button.addEventListener('click', (event) => this.fineTune(button.dataset.fit!, (event as MouseEvent).shiftKey)));
    try { this.autoFitEnabled = localStorage.getItem(AUTO_FIT_KEY) !== 'false'; } catch { /* default on */ }
    this.el<HTMLInputElement>('test-fit-auto').checked = this.autoFitEnabled;
    this.el<HTMLInputElement>('test-fit-auto').addEventListener('change', (event) => this.setAutoFit((event.target as HTMLInputElement).checked));
    const ball = this.el<HTMLSelectElement>('test-quick-ball');
    try { const saved = localStorage.getItem('orbital.quick-ball'); if (saved !== null && [...ball.options].some(o => o.value === saved)) ball.value = saved; } catch { /* storage unavailable */ }
    ball.addEventListener('change', () => { try { localStorage.setItem('orbital.quick-ball', ball.value); } catch { /* storage unavailable */ } });
    this.el('test-use-live').addEventListener('click', () => this.attempt(() => { this.requireStopped(); this.profile = this.read(); this.callbacks.connectTracking(this.profile.bridgeUrl); this.message('Tracking bridge selected. Awaiting valid source and calibration.'); }));
    this.el('test-prediction').addEventListener('change', () => this.attempt(() => { this.requireStopped(); this.profile = this.read(); this.callbacks.prediction(this.profile.predictionMs); }));
    for (const kind of ['geometry', 'projection'] as const) this.el<HTMLInputElement>(`test-${kind}`).addEventListener('change', event => {
      const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
      void this.loadFile(file, value => { this.requireStopped(); const result = kind === 'geometry' ? this.callbacks.importGeometry(value) : this.callbacks.importProjection(value); this.el('test-calibration').textContent = result; return result; });
    });
    this.el('test-open-output').addEventListener('click', () => this.attempt(() => { this.requireAppliedRig(); document.querySelector<HTMLButtonElement>('[data-open-output-window="projector-1"]')?.click(); }));
    this.el('test-patterns').addEventListener('click', () => document.querySelector<HTMLButtonElement>('[data-workspace-tab="projector-test"]')?.click());
    this.section.querySelectorAll<HTMLButtonElement>('[data-test-look]').forEach(button => button.addEventListener('click', () => this.attempt(() => this.callbacks.selectLook(button.dataset.testLook!))));
    this.el('test-record').addEventListener('click', () => {
      if (this.busy) { this.message('Wait for the camera command to finish before measuring.'); return; }
      if (this.recording) { this.stopRecording(); return; }
      try { this.requireAppliedRig(); this.sessionStart = structuredClone({ configuration: this.callbacks.configuration(), profile: this.read(), source: this.live, cameraAcknowledgement: this.latestControl, world: this.latest?.world ?? null, blackout: this.blackedOut }); }
      catch (e) { this.message(e instanceof Error ? e.message : String(e)); return; }
      this.recording = true;
      this.metrics = new TestSessionMetrics();
      this.sessionStoppedAt = null;
      this.setSessionControlsDisabled(true);
      this.el('test-record').textContent = this.recording ? 'Stop measurement' : 'Start measurement';
      this.message(this.recording ? 'Recording software observations. Export before starting another session.' : 'Measurement stopped. Export the session to retain it.');
    });
    this.el('test-export').addEventListener('click', () => this.attempt(() => this.download('session', {
      schemaVersion: 'orbital.test-session/1.0', exportedAt: new Date().toISOString(), startedWith: this.sessionStart, stoppedAt: this.sessionStoppedAt,
      observations: this.el<HTMLTextAreaElement>('test-notes').value,
      metrics: this.metrics.snapshot(), source: this.live, world: this.latest?.world ?? null,
      cameraAcknowledgement: this.latestControl, blackout: this.blackedOut,
      processingProvenance: 'Only physical HuaTeng tracking-state timing is sampled; missing/simulation processing is null.',
    })));
    this.el('test-save').addEventListener('click', () => this.attempt(() => { this.requireStopped(); this.profile = this.read(); if (testRigSignature(this.profile.rig) !== testRigSignature(this.appliedRig)) this.applyRig(this.profile.rig); localStorage.setItem(KEY, JSON.stringify(this.profile)); this.message('Profile saved locally. Hardware settings require an acknowledged Apply command.'); }));
    this.el('test-profile-export').addEventListener('click', () => this.attempt(() => this.download('profile', this.read())));
    this.el<HTMLInputElement>('test-profile-import').addEventListener('change', event => {
      const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
      void this.loadFile(file, value => { this.requireStopped(); this.profile = parseTestProfile(value); this.fill(); return 'Profile loaded. Hardware settings are not applied until requested.'; });
    });
    this.client.onCalibrationMessage = message => this.onScanMessage(message);
    this.el('test-scan-start').addEventListener('click', () => void this.startScan());
    this.el('test-scan-cancel').addEventListener('click', () => this.cancelScan('Scan cancelled.'));
    this.el('test-scan-use-layout').addEventListener('click', () => this.attempt(() => this.useScanLayout()));
    this.el('test-scan-use-live').addEventListener('click', () => this.attempt(() => this.setScanLive(!this.scanLive)));
    this.restoreScan();
    // Connect to the camera bridge by itself; reconnect whenever the link drops.
    // Keep trying until the camera bridge is up: Studio switches to live by itself when it is.
    window.setTimeout(() => void this.quickEnsureConnected().then(ok => { if (!ok) this.scheduleReconnect(); }), 400);
  }

  private restoreScan(): void {
    try {
      const raw = localStorage.getItem(SCAN_PROFILE_KEY); if (!raw) return;
      const stored = JSON.parse(raw) as StoredScanProfile;
      this.scanResult = parseStructuredLightResult(stored.result);
      this.scanSignature = typeof stored.surfaceSignature === 'string' ? stored.surfaceSignature : null;
      this.renderScanCard(this.scanResult);
      try {
        this.anchorCalibration();
        const stored = JSON.parse(localStorage.getItem(AUTO_CENTRE_KEY) ?? 'null') as { scanCreatedAt?: string; model?: LiveCalibration } | null;
        if (stored?.scanCreatedAt === this.scanResult.created_at && stored.model && Array.isArray(stored.model.offsetPx)) this.setCalibration(stored.model);
        else this.setCalibration(null);
      } catch { /* start centred */ }
      this.el('test-scan-status').textContent = `Stored scan from ${stored.savedAt || this.scanResult.created_at}. Re-scan if anything has moved.`;
      if (stored.useForLive && scanQualifiesForLive(this.scanResult)) this.setScanLive(true, false);
    } catch { this.el('test-scan-status').textContent = 'Stored scan unreadable; run a new scan.'; }
  }

  private saveScan(): void {
    if (!this.scanResult) return;
    const stored: StoredScanProfile = { schemaVersion: SCAN_PROFILE_KEY, result: this.scanResult, useForLive: this.scanLive, savedAt: new Date().toISOString(), surfaceSignature: this.scanSignature };
    try { localStorage.setItem(SCAN_PROFILE_KEY, JSON.stringify(stored)); } catch { /* storage unavailable; result still usable this session */ }
  }

  private async startScan(): Promise<void> {
    try {
      if (this.scan.state === 'running') throw new Error('A scan is already running.');
      this.requireStopped();
      if (this.busy) throw new Error('Wait for the camera command to finish.');
      if (!this.client.connected) throw new Error('Connect controls (step 2) before scanning.');
      this.profile = this.read();
      this.client.assertEndpoint(this.profile.bridgeUrl);
      if (!this.callbacks.hasProjectorWindow()) throw new Error('Open P1 output and make it fullscreen on the projector before scanning.');
      const surfaceSignature = this.callbacks.projectorSurfaceSignature();
      if (!surfaceSignature) throw new Error('The P1 output window has no visible projection area yet. Make it full screen on the projector, then scan.');
      this.pendingScanSignature = surfaceSignature;
      const baselineRaw = this.el<HTMLInputElement>('test-scan-baseline').value.trim();
      const diameterRaw = this.el<HTMLInputElement>('test-scan-diameter').value.trim();
      const focal = Number(this.el<HTMLInputElement>('test-scan-focal').value || 6);
      const baseline = baselineRaw ? Number(baselineRaw) : null, diameter = diameterRaw ? Number(diameterRaw) : null;
      if (baseline !== null && !(baseline > 0 && baseline <= 20)) throw new Error('Camera-to-projector distance must be between 0.01 and 20 m.');
      if (diameter !== null && !(diameter >= 0.05 && diameter <= 5)) throw new Error('Measured ball diameter must be between 0.05 and 5 m.');
      if (!(focal >= 1 && focal <= 200)) throw new Error('Camera lens must be between 1 and 200 mm.');
      this.scanRaster = this.callbacks.outputRaster();
      const sessionId = this.client.nextSessionId();
      this.scan.start(sessionId, performance.now());
      this.setScanRunning(true);
      this.scanStatus();
      this.scanWatchdog = window.setInterval(() => {
        if (this.scan.checkWatchdog(performance.now())) { this.client.send({ schema_version: 'orbital.camera-control/1.0', request_id: `${sessionId}-cancel`, action: 'calibrate-cancel' }); this.finishScan(); }
      }, 250);
      await this.client.request('calibrate', { settings: {
        projector_width: this.scanRaster.width, projector_height: this.scanRaster.height,
        settle_ms: 250, frames_per_pattern: 3, skip_low_bits: 2,
        measured_baseline_m: baseline, measured_ball_diameter_m: diameter, camera_focal_mm: focal,
        projector_vertical_fov_deg: this.appliedRig?.projectorFovDeg ?? this.profile.rig.projectorFovDeg,
        projector_principal_point_norm: [0.5, 0.5],
      } }, sessionId);
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      if (this.scan.state === 'running') { this.scan.fail(`Scan could not start: ${text}`); this.finishScan(); }
      else this.el('test-scan-status').textContent = text;
    }
  }

  private onScanMessage(message: Record<string, unknown>): void {
    const event = this.scan.handleMessage(message, performance.now());
    if (event.type === 'draw') {
      const sessionId = this.scan.sessionId;
      this.callbacks.showPattern(event.pattern, this.scanRaster.width, this.scanRaster.height).then(() => {
        if (this.scan.sessionId !== sessionId) return;
        const ack = this.scan.ack(event.index, performance.now());
        if (ack && !this.client.send(ack as unknown as Record<string, unknown>)) { this.scan.fail('Control connection closed during the scan.'); this.finishScan(); }
        this.scanStatus();
      }, (e: unknown) => {
        const cancel = this.scan.cancel();
        if (cancel) this.client.send(cancel);
        this.scan.fail(e instanceof Error ? e.message : String(e));
        this.finishScan(`Scan stopped: ${e instanceof Error ? e.message : String(e)}`);
      });
    } else if (event.type === 'result') {
      this.scanResult = event.result;
      this.scanSignature = this.pendingScanSignature;
      this.anchorCalibration();
      this.setCalibration(null);
      const movedDuringScan = this.callbacks.projectorSurfaceSignature() !== this.pendingScanSignature;
      if (this.scanLive) this.setScanLive(false, false);
      this.saveScan();
      this.renderScanCard(event.result);
      this.finishScan(movedDuringScan ? 'Scan complete, but the P1 window changed size or position during the scan. Put it back in full screen and scan again before using it.' : undefined);
    } else if (event.type === 'error' || event.type === 'cancelled') {
      this.finishScan();
    }
    if (event.type !== 'ignored') this.scanStatus();
  }

  private cancelScan(text: string): void {
    const cancel = this.scan.cancel();
    if (!cancel) return;
    this.client.send(cancel);
    this.finishScan(text);
  }

  /** Restore normal output after any end state: pattern removed, output blacked out. */
  private finishScan(text?: string): void {
    if (this.scanWatchdog !== null) { clearInterval(this.scanWatchdog); this.scanWatchdog = null; }
    this.callbacks.clearPattern();
    this.setBlackout(true);
    this.setScanRunning(false);
    this.scanStatus(text);
    const done = this.scanFinished;
    this.scanFinished = null;
    done?.(this.scan.state);
  }

  private setScanRunning(running: boolean): void {
    this.el<HTMLButtonElement>('test-scan-start').disabled = running;
    this.el<HTMLButtonElement>('test-scan-cancel').disabled = !running;
    this.el<HTMLButtonElement>('test-scan-use-layout').disabled = running || !scanLayoutUsable(this.scanResult);
    this.el<HTMLButtonElement>('test-scan-use-live').disabled = running || !scanQualifiesForLive(this.scanResult);
  }

  private scanStatus(override?: string): void {
    const s = this.scan;
    this.el<HTMLProgressElement>('test-scan-progress').value = s.progress;
    this.el('test-scan-status').textContent = override ?? (s.state === 'running' ? `Scanning: ${s.message}. Keep the ball still.`
      : s.state === 'result' ? `Scan complete: ${s.result?.quality.verdict}. Output blacked out.`
      : s.state === 'error' ? `Scan failed: ${s.error}. Output blacked out.`
      : s.state === 'cancelled' ? `${s.message}. Output blacked out.` : 'No scan yet.');
  }

  private renderScanCard(r: StructuredLightResult): void {
    const e = r.estimate3d, fmt = (v: number | null | undefined, digits = 2, unit = '') => (v === null || v === undefined || !Number.isFinite(v) ? 'not available' : `${v.toFixed(digits)}${unit}`);
    const sub = (a: [number, number, number] | null | undefined, b: [number, number, number] | null | undefined) => (a ? [a[0] - (b?.[0] ?? 0), a[1] - (b?.[1] ?? 0), a[2] - (b?.[2] ?? 0)] : null);
    const ball = e?.available ? sub(e.ball_center_m, e.camera_position_m) : null;
    const proj = e?.available ? sub(e.projector_position_m, e.camera_position_m) : null;
    const notes = [...r.quality.reasons, ...(e?.notes ?? [])];
    const pi = e?.projector_intrinsics, ci = e?.camera_intrinsics;
    const lens = pi ? `${pi.vertical_fov_deg.toFixed(1)}° vertical, lens axis at ${Math.round(pi.principal_point_norm[1] * 100)}% of image height (${pi.source === 'scan' ? 'found by the scan' : 'as entered'})` : 'not available';
    const cameraLens = ci ? (ci.source === 'scan-and-measured-diameter' ? `${ci.focal_scale.toFixed(3)} × the entered focal length (found from your two tape measurements)` : 'as entered') : 'not available';
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const card = this.el('test-scan-card');
    card.hidden = false;
    card.dataset.verdict = r.quality.verdict;
    card.innerHTML = `<div class="test-scan-verdict"><strong>${esc(r.quality.verdict)}</strong><span>${scanQualifiesForLive(r) ? 'Can drive live projection (structured-light)' : 'Not good enough for live projection'}</span></div>
      <dl>
        <div><dt>Decoded coverage</dt><dd>${fmt(r.decoded_fraction * 100, 0, ' %')}</dd></div>
        <div><dt>Estimated ball diameter</dt><dd>${fmt(e?.available ? e.ball_diameter_m : null, 3, ' m')}${e?.available && e.confidence === 'low' ? ' (unreliable)' : ''}</dd></div>
        <div><dt>Ball distance from camera</dt><dd>${ball ? `${Math.hypot(ball[0], ball[1], ball[2]).toFixed(2)} m` : 'not available'}</dd></div>
        <div><dt>Projector offset from camera</dt><dd>${proj ? `${proj.map(v => v.toFixed(2)).join(', ')} m (right, down, forward)` : 'not available'}</dd></div>
        <div><dt>Outline mapping error</dt><dd>${fmt(r.mapping?.rms_px, 2, ' px')} (limit ${mappingLimitPx(r).toFixed(1)} px)</dd></div>
        <div><dt>Projector lens</dt><dd>${lens}</dd></div>
        <div><dt>Camera lens</dt><dd>${cameraLens}</dd></div>
        <div><dt>3D layout confidence</dt><dd>${esc(e?.confidence ?? 'low')}${e?.confidence === 'low' ? ' (not used for the layout)' : ''} / scale from ${esc(e?.scale_source ?? 'none')}</dd></div>
      </dl>
      ${notes.length ? `<ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <small>${esc(r.source_uri)} / ${esc(r.created_at)}</small>`;
    this.setScanRunning(this.scan.state === 'running');
  }

  private useScanLayout(): void {
    this.requireStopped();
    if (!this.scanResult) throw new Error('Run a scan first.');
    const camera = this.readRig().cameraPositionM;
    const fields = scanToRigFields(this.scanResult, camera);
    if (!fields.ballCenterM) throw new Error('This scan has no 3D estimate. Enter the camera-to-projector distance or ball diameter and scan again.');
    if (!scanLayoutUsable(this.scanResult)) throw new Error('This 3D estimate is low confidence, so it was not applied. Read the notes, enter both tape measurements and scan again.');
    const lens = this.scanResult.estimate3d?.projector_intrinsics;
    if (lens?.source === 'scan') this.el<HTMLInputElement>('test-projector-fov').value = String(Math.round(lens.vertical_fov_deg * 10) / 10);
    if (fields.ballDiameterM !== null) this.el<HTMLInputElement>('test-ball-diameter').value = String(Math.round(fields.ballDiameterM * 1000) / 10);
    for (const [device, p] of [['ball', fields.ballCenterM], ['projector', fields.projectorPositionM]] as const) {
      if (!p) continue;
      for (const axis of ['x', 'y', 'z'] as const) this.el<HTMLInputElement>(`test-${device}-${axis}`).value = String(p[axis]);
    }
    this.el('test-layout-state').textContent = `Scanned ball size and positions${lens?.source === 'scan' ? ' and projector FOV' : ''} entered as pending edits (${this.scanResult.estimate3d?.confidence} confidence). Check them, then press Apply layout.`;
    this.message('Scan values written into step 1 relative to your entered camera position. This assumes the camera faces the ball horizontally. Press Apply layout to use them.');
  }

  private setScanLive(active: boolean, announce = true): void {
    if (active && !scanQualifiesForLive(this.scanResult)) throw new Error('Only a GOOD or USABLE scan with homography error of 3 px or less can drive live projection.');
    this.scanLive = active;
    this.callbacks.useScanForLive(active ? this.scanResult : null, active ? this.scanSignature : null);
    const button = this.el('test-scan-use-live');
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? 'Stop using scan for live projection' : 'Use scan for live projection';
    this.el('test-scan-live-note').hidden = !active;
    this.saveScan();
    if (announce) this.message(active ? 'Live output now uses the structured-light 2D mapping (labelled structured-light, not measured). HuaTeng source and clock sync are still required.' : 'Structured-light mapping switched off.');
  }
  private el<T extends HTMLElement = HTMLElement>(id: string): T { return this.section.querySelector(`#${id}`)! as T; }
  private message(text: string): void { this.el('test-message').textContent = text; }
  private attempt(action: () => void): void { try { action(); } catch (e) { this.message(e instanceof Error ? e.message : String(e)); } }
  private async loadFile(file: File, apply: (value: unknown) => string): Promise<void> {
    try { if (file.size > 2_000_000) throw new Error('JSON file exceeds 2 MB'); this.message(apply(JSON.parse(await file.text()))); }
    catch (e) { this.message(e instanceof Error ? e.message : String(e)); }
  }
  private fill(): void {
    const p = this.profile;
    for (const [id, value] of Object.entries({ name: p.name, url: p.bridgeUrl, infrared: p.infrared, exposure: p.exposureUs, gain: p.analogGain, fps: p.fps, width: p.width, height: p.height, prediction: p.predictionMs, notes: p.notes })) this.el<HTMLInputElement>(`test-${id}`).value = value === null ? '' : String(value);
    this.irNote();
    this.callbacks.prediction(p.predictionMs);
    this.fillRig(p.rig);
    this.applyRig(p.rig);
  }
  private irNote(): void {
    const wavelength = this.el<HTMLSelectElement>('test-infrared').value;
    this.el('test-ir-note').textContent = wavelength === 'visible'
      ? 'Visible-light profile. Check projector interference and silhouette contrast at the selected exposure.'
      : `${wavelength} profile only. Fit the matching physical illuminator and band-pass filter, verify sensor response and measure contrast. No electronic wavelength switching is connected.`;
  }
  private fillRig(rig: TestRigSetup): void {
    this.el<HTMLInputElement>('test-ball-diameter').value = String(rig.ballDiameterM * 100);
    for (const device of ['ball', 'projector', 'camera'] as const) {
      const pos = device === 'ball' ? rig.ballCenterM : device === 'projector' ? rig.projectorPositionM : rig.cameraPositionM;
      for (const axis of ['x','y','z'] as const) this.el<HTMLInputElement>(`test-${device}-${axis}`).value = String(pos[axis]);
    }
    this.el<HTMLInputElement>('test-projector-model').value = rig.projectorModel;
    this.el<HTMLInputElement>('test-projector-fov').value = String(rig.projectorFovDeg);
    this.el<HTMLInputElement>('test-camera-fov').value = String(rig.cameraFovDeg);
    const select = this.el<HTMLSelectElement>('test-output-raster');
    const raster = `${rig.outputWidthPx}x${rig.outputHeightPx}`;
    if (!Array.from(select.options).some(o => o.value === raster)) select.add(new Option(raster, raster));
    select.value = raster;
  }
  private readRig(): TestRigSetup {
    const num = (id: string) => { const raw = this.el<HTMLInputElement>(`test-${id}`).value.trim(); if (!raw) throw new Error(`${id} is required`); return Number(raw); };
    const pos = (device: string) => ({ x: num(`${device}-x`), y: num(`${device}-y`), z: num(`${device}-z`) });
    const [outputWidthPx, outputHeightPx] = this.el<HTMLSelectElement>('test-output-raster').value.split('x').map(Number);
    return parseTestRigSetup({ schemaVersion: 'orbital.test-rig/1.0', ballDiameterM: num('ball-diameter') / 100,
      ballCenterM: pos('ball'), projectorPositionM: pos('projector'), cameraPositionM: pos('camera'),
      projectorModel: this.el<HTMLInputElement>('test-projector-model').value,
      projectorFovDeg: num('projector-fov'), cameraFovDeg: num('camera-fov'), outputWidthPx, outputHeightPx });
  }
  /** Small live geometry change: no blackout, no window close, but calibration evidence is still cleared. */
  private nudge(change: (rig: TestRigSetup) => TestRigSetup): void {
    this.requireStopped();
    if (!this.appliedRig) throw new Error('Apply the layout before nudging it.');
    this.requireAppliedRig();
    const next = change(this.appliedRig);
    if (this.scanLive) this.setScanLive(false, false);
    this.callbacks.nudgeRig(next);
    this.appliedRig = structuredClone(next);
    this.profile = { ...this.profile, rig: structuredClone(next) };
    this.fillRig(next);
    try { localStorage.setItem(KEY, JSON.stringify(this.profile)); } catch { /* storage unavailable; the nudge still applied */ }
    this.el('test-calibration').textContent = 'Geometry nudged. Imported camera and projector calibration were cleared; re-import before live projection.';
    this.el('test-layout-state').textContent = 'Nudged / manual positioning preview. Output windows stay open. Calibration is not verified.';
    this.renderLayout(next);
    const p = next.projectorPositionM, b = next.ballCenterM;
    this.message(`Nudge applied. Projector ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} m / ball ${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)} m / FOV ${next.projectorFovDeg.toFixed(2)}°.`);
  }
  private applyRig(rig: TestRigSetup): void {
    // The structured-light scan measured the physical camera, projector and
    // ball, not these typed numbers, so it stays active. The P1 window guard
    // still blocks output if the projector window changes.
    this.callbacks.setupRig(rig);
    this.appliedRig = structuredClone(rig);
    this.blackedOut = true;
    this.callbacks.blackout(true);
    document.getElementById('test-blackout')?.setAttribute('aria-pressed', 'true');
    this.el('test-calibration').textContent = this.scanLive
      ? 'Layout changed. The structured-light scan stays active for live projection; scan again if you physically moved the camera, projector or ball.'
      : 'Layout changed. Re-import calibration for this ball size and equipment arrangement before live projection.';
    this.el('test-layout-state').textContent = 'Applied / manual positioning preview. Output is blacked out. Calibration is not yet verified.';
    this.renderLayout(rig);
  }
  private renderLayout(rig: TestRigSetup): void {
    const distance = (p: {x:number;y:number;z:number}) => Math.hypot(p.x-rig.ballCenterM.x,p.y-rig.ballCenterM.y,p.z-rig.ballCenterM.z);
    const pd = distance(rig.projectorPositionM), cd = distance(rig.cameraPositionM);
    const height = 2 * pd * Math.tan(rig.projectorFovDeg * Math.PI / 360);
    this.el('test-layout-summary').textContent = `${(rig.ballDiameterM*100).toFixed(0)} cm ball / projector to centre ${pd.toFixed(2)} m / camera to centre ${cd.toFixed(2)} m. Approximate projector field at centre: ${(height*rig.outputWidthPx/rig.outputHeightPx).toFixed(2)} × ${height.toFixed(2)} m. These are layout estimates.`;
    const points = [rig.ballCenterM, rig.projectorPositionM, rig.cameraPositionM];
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
    const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
    const span = Math.max(.5, maxX-minX, maxZ-minZ, rig.ballDiameterM*2);
    const xy = (p: typeof rig.ballCenterM) => ({x:180+(p.x-(minX+maxX)/2)/span*220, y:95+(p.z-(minZ+maxZ)/2)/span*95});
    const [b,p,c] = points.map(xy);
    this.el('test-layout-diagram').innerHTML = `<rect width="360" height="190" rx="6" fill="#0b1712"/><text x="12" y="18" fill="#9db9aa" font-size="10">TOP VIEW / devices aim at ball</text><path d="M${p.x},${p.y} L${b.x},${b.y} M${c.x},${c.y} L${b.x},${b.y}" stroke="#527b68" fill="none" stroke-dasharray="5 4"/><circle cx="${b.x}" cy="${b.y}" r="${Math.max(3,rig.ballDiameterM/2/span*100)}" fill="#9be0ba"/><rect x="${p.x-6}" y="${p.y-4}" width="12" height="8" fill="#9fbef5"/><circle cx="${c.x}" cy="${c.y}" r="4" fill="#ffcc80"/><text x="${b.x+10}" y="${b.y-8}" fill="#dcecdf" font-size="11">Ball</text><text x="${p.x-36}" y="${p.y+22}" fill="#9fbef5" font-size="11">Projector</text><text x="${c.x+8}" y="${c.y+10}" fill="#ffcc80" font-size="11">Camera</text>`;
  }
  private read(): TestProfile {
    const val = (id: string) => this.el<HTMLInputElement>(`test-${id}`).value;
    return parseTestProfile({ schemaVersion: DEFAULT_TEST_PROFILE.schemaVersion, name: val('name'), bridgeUrl: val('url'), infrared: val('infrared'), exposureUs: Number(val('exposure')), analogGain: val('gain').trim() === '' ? null : Number(val('gain')), fps: Number(val('fps')), width: Number(val('width')), height: Number(val('height')), predictionMs: Number(val('prediction')), notes: val('notes'), rig: this.readRig() });
  }
  private async command(action: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.section.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b => { b.disabled = true; });
    try {
      if (!['connect', 'status', 'discover'].includes(action)) this.requireStopped();
      this.profile = this.read();
      if (action !== 'connect') this.client.assertEndpoint(this.profile.bridgeUrl);
      this.message(`Camera ${action} pending…`);
      if (action === 'connect') await this.client.connect(this.profile.bridgeUrl);
      const p = this.profile;
      const reply = await this.client.request(action === 'connect' ? 'status' : action === 'simulate' ? 'start' : action,
        action === 'configure' ? { settings: { exposure_us: p.exposureUs, ...(p.analogGain === null ? {} : { analog_gain: p.analogGain }), fps: p.fps, width: p.width, height: p.height, infrared_profile: p.infrared } }
        : action === 'start' || action === 'simulate' ? { source: action === 'start' ? 'huateng' : 'simulate' } : {});
      this.latestControl = reply;
      this.el('test-device').textContent = JSON.stringify(reply.devices ? { devices: reply.devices, ...reply.status } : reply.status, null, 2);
      this.message(`Acknowledged: ${action}. ${reply.status.running ? 'Acquisition running.' : 'Acquisition stopped.'}`);
    } catch (e) { this.latestControl = null; this.el('test-device').textContent = 'No current acknowledged device state. Refresh status.'; this.message(e instanceof Error ? e.message : String(e)); }
    finally { this.busy = false; this.section.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b => { b.disabled = false; }); if (this.recording) this.setSessionControlsDisabled(true); }
  }
  private setBlackout(active: boolean): void {
    this.blackedOut = active;
    this.callbacks.blackout(active);
    document.getElementById('test-blackout')!.setAttribute('aria-pressed', String(active));
    document.getElementById('test-release')!.setAttribute('aria-pressed', String(!active));
    const bar = document.querySelector<HTMLElement>('.projector-switch');
    if (bar) bar.dataset.state = active ? 'blackout' : 'on';
    this.message(active ? 'All projector output blacked out.' : 'Blackout released. Live output still requires valid calibrated tracking.');
  }
  update(nowMs: number, deltaMs: number, snapshot: RuntimeSnapshot, live: LiveBridgeStatus): void {
    this.latest = snapshot; this.live = live;
    if (this.recording) {
      const key = `${snapshot.world.mode}:${live.source}:${live.connection}:${live.url}`;
      if (!this.metrics.acceptsSource(key)) this.stopRecording('Source changed. Measurement stopped; export this session before starting a new one.');
      else this.metrics.record(deltaMs, key, snapshot.world.sequence,
        snapshot.world.mode === 'live' && live.source === 'physical-huateng' ? live.processingMs : null,
        snapshot.world.diagnostics.sourceAgeMs);
    }
    if (nowMs - this.lastUpdate < 250) return;
    this.lastUpdate = nowMs;
    this.el('test-source').textContent = snapshot.world.mode === 'live' ? `${live.source.toUpperCase()} / ${live.connection.toUpperCase()}` : snapshot.world.mode.toUpperCase();
    const blockReason = this.callbacks.outputBlockReason();
    this.el('test-readiness').textContent = this.blackedOut ? 'OUTPUT BLACKOUT'
      : blockReason ? `Live output blocked: ${describeOutputBlockReason(blockReason)}`
      : snapshot.world.mode === 'live' ? (this.scanLive ? 'Live output allowed / structured-light 2D mapping, exact only at scanned depth' : 'Live output allowed / calibrated tracking')
      : `Simulation output allowed / ${snapshot.world.mode} data, not camera tracking`;
    if (!this.feedRunning && this.feedWanted()) void this.feedLoop();
    if (this.liveOutputShowing()) this.liveSinceMs ??= nowMs; else if (!this.probing) this.liveSinceMs = null;
    if (!this.probeDoneThisSession && this.liveSinceMs !== null && nowMs - this.liveSinceMs > 2000) void this.runDelayProbe();
    const edge = this.callbacks.projectedEdgeNote?.() ?? null;
    const [cxp, cyp] = this.autoCentre.correctionPx;
    const size = this.autoCentre.sizeScale;
    const centring = this.scanLive && (Math.hypot(cxp, cyp) >= 0.5 || Math.abs(size - 1) >= 0.01) ? ` Fit${this.autoFitEnabled ? ' (auto)' : ' (manual)'}: size ${Math.round(size * 100)}%, shifted ${Math.abs(cxp).toFixed(0)} px ${cxp >= 0 ? 'right' : 'left'} and ${Math.abs(cyp).toFixed(0)} px ${cyp >= 0 ? 'down' : 'up'} (camera).` : '';
    const delay = this.probeDoneThisSession && !this.probing ? (this.measuredDelayMs !== null ? ` Delay measured: ${this.measuredDelayMs} ms.` : ' Delay not measured; using 45 ms.') : '';
    this.el('test-quick-readiness').textContent = `Projector: ${this.el('test-readiness').textContent}${edge ? `. Warning: ${edge}.` : ''}${centring}${delay}`;
    const stats = this.metrics.snapshot();
    this.el('test-metrics').textContent = `${this.recording ? 'RECORDING' : 'STOPPED'} / ${stats.frameCount} render samples\n` +
      ([['Cadence', stats.cadenceMs], ['Processing', stats.processingMs], ['Receipt age', stats.receiptAgeMs]] as const).map(([label, d]) => `${label}: ${d ? `P50 ${d.p50.toFixed(2)} / P95 ${d.p95.toFixed(2)} / P99 ${d.p99.toFixed(2)} ms\n  jitter ${d.jitter.toFixed(2)} / max ${d.max.toFixed(2)} ms` : 'not measured'}`).join('\n') + '\nPhysical motion-to-photon: NOT MEASURED\nPhysical mapping error: NOT MEASURED';
  }
  private setAim(on: boolean): void {
    this.aimOn = on;
    this.aimGeneration += 1;
    if (this.aimTimer !== null) { clearTimeout(this.aimTimer); this.aimTimer = null; }
    const button = this.el('test-aim-toggle');
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? 'Hide camera view' : 'Show camera view';
    this.el('test-aim-panel').hidden = !on;
    if (on) { this.showAimMessage('Waiting for the first picture…'); void this.aimTick(this.aimGeneration); }
  }

  private showAimMessage(text: string): void {
    const exposure = this.el('test-aim-exposure');
    exposure.textContent = text;
    exposure.dataset.tone = 'warn';
    this.el('test-aim-ball').textContent = '';
  }

  /** Poll the bridge for a preview about three times a second while the view is open. */
  private async aimTick(generation: number): Promise<void> {
    if (!this.aimOn || generation !== this.aimGeneration) return;
    const next = (ms: number) => {
      if (this.aimOn && generation === this.aimGeneration) this.aimTimer = window.setTimeout(() => void this.aimTick(generation), ms);
    };
    if (!this.client.connected) { this.showAimMessage('Camera link lost. Reconnecting by itself…'); this.markAimStale(); next(1000); return; }
    // Patterns own the projector during a scan, and hidden tabs need no pictures.
    if (document.hidden || this.scan.state === 'running') { next(800); return; }
    const started = performance.now();
    try {
      const reply = await this.client.request('preview');
      if (!this.aimOn || generation !== this.aimGeneration) return;
      await this.drawAim(parseCameraPreview(reply.preview));
    } catch (e) {
      if (this.aimOn && generation === this.aimGeneration) { this.showAimMessage(e instanceof Error ? e.message : String(e)); this.markAimStale(); }
    }
    next(Math.max(120, 330 - (performance.now() - started)));
  }

  private async drawAim(preview: CameraPreview): Promise<void> {
    const canvas = this.el<HTMLCanvasElement>('test-aim-canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.width !== preview.width || canvas.height !== preview.height) { canvas.width = preview.width; canvas.height = preview.height; }
    const w = canvas.width, h = canvas.height;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(await decodePng(preview.framePngBase64), 0, 0, w, h);
    canvas.dataset.stale = 'false';
    if (preview.maskPngBase64 && this.el<HTMLInputElement>('test-aim-mask').checked) {
      const layer = this.aimLayer ??= document.createElement('canvas');
      layer.width = w; layer.height = h;
      const lctx = layer.getContext('2d', { willReadFrequently: true });
      if (lctx) {
        lctx.clearRect(0, 0, w, h);
        lctx.drawImage(await decodePng(preview.maskPngBase64), 0, 0, w, h);
        const image = lctx.getImageData(0, 0, w, h);
        const px = image.data;
        for (let i = 0; i < px.length; i += 4) {
          const on = px[i] > 127;
          px[i] = 94; px[i + 1] = 231; px[i + 2] = 255; px[i + 3] = on ? 105 : 0;
        }
        lctx.putImageData(image, 0, 0);
        ctx.drawImage(layer, 0, 0);
      }
    }
    // Centre cross: aim so the ball sits here with room to move.
    const cx = w / 2, cy = h / 2;
    ctx.strokeStyle = 'rgba(255, 180, 94, 0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
    ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16);
    ctx.stroke();
    if (preview.simulated) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(8, 8, 190, 22);
      ctx.fillStyle = '#f1bc6a';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText('SIMULATED, NOT THE CAMERA', 14, 23);
    }
    const advice = aimAdvice(preview);
    const exposure = this.el('test-aim-exposure');
    exposure.textContent = advice.exposure;
    exposure.dataset.tone = advice.exposureTone;
    const ball = this.el('test-aim-ball');
    ball.textContent = advice.ball;
    ball.dataset.tone = advice.ballTone;
  }

  /** Grey out the last picture so a stalled view never looks live. */
  private markAimStale(): void {
    const canvas = this.el<HTMLCanvasElement>('test-aim-canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.dataset.stale === 'true') return;
    canvas.dataset.stale = 'true';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f1bc6a';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText('NOT LIVE', 16, 28);
  }

  private renderQuickLink(): void {
    const status = this.latestControl?.status;
    const text = !this.client.connected ? 'Camera bridge: not connected. Start it in Terminal if it is not running.'
      : !status ? 'Camera bridge: connected'
      : `Camera bridge: connected / ${status.running ? `${String(status.source ?? 'camera')} running` : 'camera stopped'}`;
    this.el('test-quick-link').textContent = text;
  }

  /** True while the camera bridge answers on the control socket. */
  get bridgeConnected(): boolean { return this.client.connected; }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.client.connected || this.busy || this.connecting) return;
      void this.quickEnsureConnected().then(ok => { if (!ok) this.scheduleReconnect(); });
    }, 2000);
  }

  /** Connect the control link if needed. Quiet: failures only update the link line. */
  private async quickEnsureConnected(): Promise<boolean> {
    if (this.client.connected) return true;
    if (this.connecting) return false;
    this.connecting = true;
    try {
      const url = this.el<HTMLInputElement>('test-url').value.trim() || this.profile.bridgeUrl;
      await this.client.connect(url);
      const reply = await this.client.request('status');
      this.latestControl = reply;
      this.el('test-device').textContent = JSON.stringify(reply.status, null, 2);
      return true;
    } catch {
      return false;
    } finally {
      this.connecting = false;
      this.renderQuickLink();
    }
  }

  private liveOutputShowing(): boolean {
    return this.scanLive && !this.blackedOut && this.callbacks.outputBlockReason() === null;
  }

  private autoCentreActive(): boolean {
    // The delay probe's black frames would read as a badly aligned picture: pause meanwhile.
    return this.autoFitEnabled && this.liveOutputShowing() && !this.probing;
  }

  private setAutoFit(on: boolean): void {
    this.autoFitEnabled = on;
    this.el<HTMLInputElement>('test-fit-auto').checked = on;
    try { localStorage.setItem(AUTO_FIT_KEY, String(on)); } catch { /* per-browser preference */ }
  }

  /**
   * Manual fine-tune: small steps of 1% of the ball width (5% with Shift) and 2% size (5% with
   * Shift). A manual nudge pauses Auto-fit, so the camera does not undo it; tick Auto-fit to hand
   * back. Stored with the scan like the self-fit.
   */
  private fineTune(action: string, big: boolean): void {
    if (!this.scanResult) { this.quickSay('Scan first: fine-tuning adjusts the scan’s mapping.'); return; }
    if (action === 'reset') {
      this.setCalibration(null);
      this.quickSay('Fine-tuning and self-fit cleared for this scan.', 'good');
      return;
    }
    const step = big ? 0.05 : 0.01, size = big ? 1.05 : 1.02;
    const moves: Record<string, [number, number, number]> = {
      left: [-step, 0, 1], right: [step, 0, 1], up: [0, -step, 1], down: [0, step, 1], smaller: [0, 0, 1 / size], bigger: [0, 0, size],
    };
    const move = moves[action];
    if (!move) return;
    if (this.autoFitEnabled) { this.setAutoFit(false); this.quickSay('Auto-fit paused so it keeps your adjustment. Tick Auto-fit to hand control back.'); }
    this.autoCentre.nudge(move[0], move[1], move[2]);
    this.publishCalibration(true);
  }

  /**
   * Once per session, two seconds after live output starts: blink the projected ball
   * off three times and time how long the camera takes to see it, then set the motion
   * lead to that delay instead of the 45 ms estimate.
   */
  private async runDelayProbe(): Promise<void> {
    if (this.probing || !this.callbacks.setProbeDark || !this.callbacks.probeDarkDrawnAtMs) return;
    this.probing = true;
    this.probeDoneThisSession = true;
    try {
      const sent = performance.now();
      const clock = await this.client.request('clock');
      const received = performance.now();
      if (typeof clock.server_monotonic_ns !== 'number' || received - sent > 60) throw new Error('clock sync too slow');
      const offsetMs = (sent + received) / 2 - clock.server_monotonic_ns / 1e6;
      const blinks: Array<{ darkDrawnMs: number }> = [];
      for (let i = 0; i < 3; i++) {
        await sleep(450);
        this.callbacks.setProbeDark(true);
        const start = performance.now();
        let drawn: number | null = null;
        while (drawn === null && performance.now() - start < 400) { await sleep(5); drawn = this.callbacks.probeDarkDrawnAtMs(); }
        await sleep(250);
        this.callbacks.setProbeDark(false);
        if (drawn !== null) blinks.push({ darkDrawnMs: drawn });
      }
      await sleep(250);
      if (!blinks.length) throw new Error('no black frame was drawn');
      const sinceNs = Math.round((blinks[0].darkDrawnMs - 800 - offsetMs) * 1e6);
      const reply = await this.client.request('brightness-trace', { since_ns: sinceNs });
      const trace = (reply.trace ?? []).map(([ns, level]) => [ns / 1e6 + offsetMs, level] as const);
      const delay = measureProjectorDelay(trace, blinks);
      if (delay === null) throw new Error('the blink was not visible on the ball');
      this.measuredDelayMs = Math.round(delay);
      this.callbacks.setProjectionLeadS?.(Math.max(0.015, Math.min(0.15, delay / 1000)));
    } catch {
      // Keep the estimate; the readiness line says the delay was not measured.
      this.measuredDelayMs = null;
    } finally {
      this.callbacks.setProbeDark?.(false);
      this.probing = false;
    }
  }

  private feedWanted(): boolean {
    return (this.callbacks.wantsCameraFeed?.() ?? false) || this.autoCentreActive();
  }

  /**
   * One camera preview stream, about 30 pictures a second, shared by the Camera HUD
   * and auto-centring. It stops by itself when neither needs it.
   */
  private async feedLoop(): Promise<void> {
    if (this.feedRunning) return;
    this.feedRunning = true;
    try {
      while (this.feedWanted()) {
        const started = performance.now();
        if (document.hidden || this.scan.state === 'running' || !this.client.connected) { await sleep(400); continue; }
        // Full pictures with the ball mask only when self-fit measures (about 3 a second);
        // the HUD otherwise gets small, mask-free pictures, which cost the bridge far less.
        const measure = this.autoCentreActive() && started - this.lastCentreMeasureMs >= 300;
        let preview: CameraPreview;
        try { preview = parseCameraPreview((await this.client.request('preview', measure ? {} : { options: { max_width: 384, mask: false } })).preview); }
        catch { await sleep(300); continue; }
        if (preview.simulated && !(this.callbacks.wantsCameraFeed?.() ?? false)) { await sleep(500); continue; }
        const image = await createImageBitmap(base64Blob(preview.framePngBase64));
        this.callbacks.cameraFrame?.({ image, width: preview.width, height: preview.height });
        if (measure && preview.maskPngBase64) {
          const dt = this.lastCentreMeasureMs ? (started - this.lastCentreMeasureMs) / 1000 : 0.3;
          this.lastCentreMeasureMs = started;
          await this.measureCentre(preview, image, dt).catch(() => undefined);
        }
        // About 20 pictures a second: smooth to watch, and light on the bridge and the camera.
        await sleep(Math.max(0, 50 - (performance.now() - started)));
      }
    } finally {
      this.feedRunning = false;
    }
  }

  private async measureCentre(preview: CameraPreview, image: ImageBitmap, dtS: number): Promise<void> {
    // Fast moves show lag, not misalignment: measure only while the ball is fairly slow.
    const speed = this.callbacks.trackedSpeedPxPerS?.() ?? null;
    if (speed === null || speed > 150 || !preview.maskPngBase64) return;
    const mask = await createImageBitmap(base64Blob(preview.maskPngBase64));
    const w = preview.width, h = preview.height;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h).data;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(mask, 0, 0, w, h);
    const maskData = ctx.getImageData(0, 0, w, h).data;
    mask.close();
    const gray = new Uint8Array(w * h), on = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { gray[i] = frame[i * 4]; on[i] = maskData[i * 4]; }
    const measured = measureProjectionOffset(gray, on, w, h);
    if (!measured) return;
    const k = preview.frameWidth / w;
    this.autoCentre.update([measured.errorPx[0] * k, measured.errorPx[1] * k], measured.ballRadiusPx * 2 * k, dtS, measured.litEdge,
      [measured.centerPx[0] * k, measured.centerPx[1] * k]);
    this.publishCalibration(false);
  }

  /** Anchor the live calibration on the scanned ball, so its slopes are per ball-width moved. */
  private anchorCalibration(): void {
    const ball = this.scanResult?.ball_camera;
    if (ball) this.autoCentre.setAnchor([ball.center_px[0], ball.center_px[1]], 2 * ball.radius_px);
  }

  /** Start from a stored model, or from neutral when null. */
  private setCalibration(model: LiveCalibration | null): void {
    this.autoCentre.reset(model ?? undefined);
    if (!model) this.anchorCalibration();
    this.publishCalibration(true);
  }

  private publishCalibration(save: boolean): void {
    this.callbacks.setLiveCalibration?.(this.autoCentre.model);
    const now = performance.now();
    if (save || now - this.lastCentreSaveMs > 2000) {
      this.lastCentreSaveMs = now;
      try { localStorage.setItem(AUTO_CENTRE_KEY, JSON.stringify({ scanCreatedAt: this.scanResult?.created_at ?? null, model: this.autoCentre.model })); } catch { /* per-browser convenience */ }
    }
  }

  private quickSay(text: string, tone: 'wait' | 'good' | 'bad' = 'wait'): void {
    const say = this.el('test-quick-say');
    say.textContent = text;
    say.dataset.tone = tone;
    // Flash and bring the prompt into view, so a new instruction is never missed.
    say.classList.remove('is-new'); void say.offsetWidth; say.classList.add('is-new');
    say.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  /**
   * A button press with no projector window open opens it straight away (it must happen
   * inside the click for the browser to allow the popup) and says what to do next.
   * Returns true when the button's flow should run.
   */
  /** Studio's own full-screen button: no trip to the projector screen needed. */
  private projectorFullscreenFromHere(): void {
    if (!this.callbacks.hasProjectorWindow()) {
      // Opening it moves it to the projector and makes it full screen by itself.
      this.openProjectorWindow();
      this.quickSay('Opening the projector window on the projector, full screen. If Chrome asks to manage windows on your displays, click Allow.');
      return;
    }
    if (this.callbacks.projectorFullscreen?.()) this.quickSay('Projector window set to full screen.', 'good');
    else this.quickSay('Chrome would not make it full screen from here. Click the projector window and press F.', 'bad');
  }

  /**
   * A button press with no projector window linked opens (or, after a Studio update,
   * reconnects) it inside the click, which the browser requires. The flow then carries
   * on by itself once the window is full screen, so one press is enough.
   */
  private quickOpenProjectorFirst(): boolean {
    if (this.quickBusy || this.callbacks.hasProjectorWindow()) return true;
    try { this.openProjectorWindow(); }
    catch (e) { this.quickSay(e instanceof Error ? e.message : String(e), 'bad'); return false; }
    this.quickSay('Connecting the projector window and making it full screen…');
    return true;
  }

  /** Wait briefly for the projector window to be full screen (it goes by itself when opened from a click). */
  private async waitForProjectorFullscreen(timeoutMs = 3000): Promise<void> {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      if (this.callbacks.hasProjectorWindow() && this.callbacks.projectorWindowFullscreen()) return;
      await sleep(100);
    }
  }

  private setQuickBusy(busy: boolean): void {
    this.quickBusy = busy;
    this.el<HTMLButtonElement>('test-quick-scan').disabled = busy;
    this.el<HTMLButtonElement>('test-quick-live').disabled = busy;
    if (!busy) this.el('test-quick-extra').hidden = true;
  }

  private openProjectorWindow(): void {
    if (!this.appliedRig) this.applyRig(this.profile.rig);
    document.querySelector<HTMLButtonElement>('[data-open-output-window="projector-1"]')?.click();
    this.quickSay('The projector window is opening on the projector and going full screen. If it is not full screen, press Projector full screen below. Then press the same button again.');
  }

  /** The one step software cannot do: the projector window must be on the projector, full screen. */
  private quickRequireProjector(): boolean {
    const open = this.callbacks.hasProjectorWindow();
    this.el('test-quick-open-row').hidden = open;
    if (!open) { this.quickSay('First press Open projector window, drag it onto the projector and click Full screen inside it. Then press the button again.'); return false; }
    if (!this.callbacks.projectorWindowFullscreen()) { this.quickSay('Make the projector window full screen: press Projector full screen below, then press the button again.'); return false; }
    return true;
  }

  private async quickEnsureCamera(): Promise<void> {
    if (!(await this.quickEnsureConnected())) throw new Error('The camera bridge is not running. Start it in Terminal (see the runbook), then press the button again.');
    let reply = await this.client.request('status');
    if (!reply.status.running) {
      this.quickSay('Starting the camera…');
      reply = await this.client.request('start', { source: reply.status.source === 'simulate' ? 'simulate' : 'huateng' });
    }
    this.latestControl = reply;
    this.renderQuickLink();
  }

  /** Switch camera exposure and frame rate (stop, configure, start), skipping it when already set. */
  private async quickCamera(wanted: { exposureUs: number; fps: number }, label: string): Promise<void> {
    const current = await this.client.request('status');
    if (current.status.running && cameraSettingsMatch(current.status.settings, wanted)) return;
    this.quickSay(label);
    const source = current.status.source === 'simulate' ? 'simulate' : 'huateng';
    this.busy = true;
    try {
      if (current.status.running) await this.client.request('stop');
      await this.client.request('configure', { settings: { exposure_us: wanted.exposureUs, fps: wanted.fps } });
      this.latestControl = await this.client.request('start', { source });
    } finally {
      this.busy = false;
    }
    // Keep the manual fields in step with the camera.
    this.el<HTMLInputElement>('test-exposure').value = String(wanted.exposureUs);
    this.el<HTMLInputElement>('test-fps').value = String(wanted.fps);
    await new Promise(resolve => window.setTimeout(resolve, 700));
  }

  private async quickPreview(): Promise<CameraPreview | null> {
    try { return parseCameraPreview((await this.client.request('preview')).preview); } catch { return null; }
  }

  /** Show an instruction and wait until the camera confirms it, or the operator presses Continue. */
  private quickWaitFor(text: string, check: () => Promise<boolean>): Promise<void> {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (proceed: boolean) => {
        if (done) return;
        done = true;
        this.quickWaiter = null;
        this.el('test-quick-extra').hidden = true;
        if (proceed) resolve(); else reject(new Error('Cancelled'));
      };
      this.quickWaiter = finish;
      this.quickSay(text);
      this.el('test-quick-extra').hidden = false;
      const poll = async () => {
        if (done) return;
        let ok = false;
        try { ok = await check(); } catch { ok = false; }
        if (ok) finish(true); else window.setTimeout(() => void poll(), 500);
      };
      void poll();
    });
  }

  /**
   * Flash the projector white and shorten the camera exposure until the ball is
   * bright but not clipped, so the stripes stay readable on a glowing balloon.
   */
  private async quickAutoExposeForScan(): Promise<number> {
    const raster = this.callbacks.outputRaster();
    let exposure = QUICK_CAMERA.scan.exposureUs;
    let previousClipped: number | null = null;
    try {
      for (let step = 0; step < 6; step += 1) {
        await this.quickCamera({ exposureUs: exposure, fps: QUICK_CAMERA.scan.fps }, `Measuring the projector on the ball (${exposure} µs)…`);
        await this.callbacks.showPattern({ kind: 'white' }, raster.width, raster.height);
        await new Promise(resolve => window.setTimeout(resolve, 400));
        const preview = await this.quickPreview();
        if (!preview || preview.simulated) return exposure;
        const decision = nextScanExposure(exposure, preview.levels, previousClipped);
        previousClipped = preview.levels.clippedFraction;
        if (decision.done) return exposure;
        exposure = decision.nextUs;
      }
      return exposure;
    } finally {
      this.callbacks.clearPattern();
    }
  }

  private async quickRunScan(): Promise<SessionState> {
    const previous = this.scan.sessionId;
    const finished = new Promise<SessionState>(resolve => { this.scanFinished = resolve; });
    await this.startScan();
    if (this.scan.sessionId === previous) {
      this.scanFinished = null;
      throw new Error(this.el('test-scan-status').textContent || 'The scan could not start.');
    }
    return finished;
  }

  /** Button 1: everything from camera settings to a usable scan, waiting for the operator only at the lights. */
  private async quickScan(): Promise<void> {
    if (this.quickBusy) return;
    this.setQuickBusy(true);
    try {
      await this.quickEnsureCamera();
      await this.waitForProjectorFullscreen();
      if (!this.quickRequireProjector()) return;
      if (this.aimOn) this.setAim(false);
      if (this.scanLive) this.setScanLive(false, false);
      this.setBlackout(true);
      await this.quickCamera(QUICK_CAMERA.tracking, 'Getting the camera ready…');
      await this.quickWaitFor('Switch the infrared light off and the fan off, and keep the ball still. The scan starts by itself once the camera sees the ball go dark. Press Continue to start anyway.',
        async () => { const p = await this.quickPreview(); return !p || p.simulated || infraredLooksOff(p.levels, p.maskFraction); });
      const scanExposure = await this.quickAutoExposeForScan();
      this.el<HTMLInputElement>('test-scan-diameter').value = this.el<HTMLSelectElement>('test-quick-ball').value;
      this.el<HTMLInputElement>('test-scan-baseline').value = '';
      this.quickSay(`Scanning at ${scanExposure} µs. Keep everything still for about a minute while the projector flashes stripes.`);
      let outcome: SessionState;
      try {
        outcome = await this.quickRunScan();
      } finally {
        await this.quickCamera(QUICK_CAMERA.tracking, 'Putting the camera back to tracking…').catch(() => undefined);
      }
      const result = this.scanResult;
      if (outcome !== 'result' || !result) throw new Error(this.el('test-scan-status').textContent || 'The scan did not finish.');
      if (!scanQualifiesForLive(result)) throw new Error(`The scan came back ${result.quality.verdict}. ${result.quality.reasons[0] ?? ''} Check the projector reaches the ball and the room is dark, then scan again.`.trim());
      this.setScanLive(true, false);
      await this.quickWaitFor(`Scan ${result.quality.verdict.toLowerCase()}. Switch the infrared light back on. Press Continue if it is already on.`,
        async () => { const p = await this.quickPreview(); return !p || p.simulated || infraredLooksOn(p.levels, p.maskFraction); });
      this.quickSay('Ready. Turn the fan on when you like, then press Go live.', 'good');
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      if (text === 'Cancelled') this.quickSay('Stopped. Press Scan to try again.');
      else this.quickSay(text, 'bad');
    } finally {
      this.setQuickBusy(false);
    }
  }

  /** Button 2: tracking settings, infrared check, scan mapping, bridge tracking, grid, release blackout. */
  private async quickGoLive(): Promise<void> {
    if (this.quickBusy) return;
    this.setQuickBusy(true);
    try {
      await this.quickEnsureCamera();
      if (!scanQualifiesForLive(this.scanResult)) throw new Error('Press Scan first. Live projection uses the scan to line the picture up with the ball.');
      await this.waitForProjectorFullscreen();
      if (!this.quickRequireProjector()) return;
      await this.quickCamera(QUICK_CAMERA.tracking, 'Setting the camera for tracking…');
      await this.quickWaitFor('Switch the infrared light on. Going live as soon as the camera sees the lit ball. Press Continue to go anyway.',
        async () => { const p = await this.quickPreview(); return !p || p.simulated || infraredLooksOn(p.levels, p.maskFraction); });
      if (!this.appliedRig) this.applyRig(this.profile.rig);
      if (!this.scanLive) this.setScanLive(true, false);
      this.callbacks.connectTracking(this.el<HTMLInputElement>('test-url').value.trim() || this.profile.bridgeUrl);
      this.callbacks.selectLook('geometric-grid');
      this.setBlackout(false);
      this.quickSay('Live. The grid should sit on the ball and follow it. Press B to black out. If the projector stays black, the Projector line below says why.', 'good');
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      if (text === 'Cancelled') this.quickSay('Stopped. Press Go live to try again.');
      else this.quickSay(text, 'bad');
    } finally {
      this.setQuickBusy(false);
    }
  }

  private requireAppliedRig(): void {
    if (testRigSignature(this.readRig()) !== testRigSignature(this.appliedRig)) throw new Error('Apply the pending layout edits before opening output or recording.');
  }
  private requireStopped(): void { if (this.recording) throw new Error('Stop the measurement before changing source or configuration.'); }
  private setSessionControlsDisabled(disabled: boolean): void {
    this.section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, [data-camera], #test-use-live, [data-test-look], #test-apply-rig, #test-reset-rig').forEach(el => { el.disabled = disabled; });
  }
  private stopRecording(message = 'Measurement stopped. Export the session to retain it.'): void {
    this.recording = false; this.sessionStoppedAt = new Date().toISOString();
    this.setSessionControlsDisabled(false); this.el('test-record').textContent = 'Start measurement'; this.message(message);
  }
  private download(kind: string, value: unknown): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `orbital-test-${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.message(`Exported ${kind} JSON.`);
  }
  dispose(): void { this.cancelScan('Scan cancelled.'); this.client.disconnect(); }
}

/** Decode a base64 PNG from the bridge into something drawImage accepts. */
function decodePng(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The camera picture could not be decoded'));
    image.src = `data:image/png;base64,${base64}`;
  });
}
