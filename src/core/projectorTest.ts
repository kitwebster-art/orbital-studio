export const PROJECTOR_TEST_PATTERNS = [
  { id: "latency", label: "Latency flash" },
  { id: "grid", label: "One-pixel grid" },
  { id: "focus", label: "Focus and edges" },
  { id: "circles", label: "Concentric circles" },
  { id: "white", label: "Full white" },
  { id: "gray", label: "50% gray" },
  { id: "black", label: "Full black" },
  { id: "red", label: "Saturated red" },
  { id: "green", label: "Saturated green" },
  { id: "blue", label: "Saturated blue" },
] as const;

export type ProjectorTestPattern = (typeof PROJECTOR_TEST_PATTERNS)[number]["id"];

export const PROJECTOR_TEST_OBSERVATION_VERDICTS = [
  { id: "not-tested", label: "Not tested" },
  { id: "pass", label: "Pass" },
  { id: "conditional", label: "Conditional" },
  { id: "fail", label: "Fail" },
] as const;

export type ProjectorTestObservationVerdict =
  (typeof PROJECTOR_TEST_OBSERVATION_VERDICTS)[number]["id"];

export const PROJECTOR_TEST_PHYSICAL_VERDICTS = [
  { id: "unmeasured", label: "Unmeasured" },
  { id: "retest", label: "Retest" },
  { id: "reject", label: "Reject" },
  { id: "stage-a-candidate", label: "Stage A candidate" },
  { id: "production-candidate", label: "Production candidate" },
] as const;

export type ProjectorTestPhysicalVerdict =
  (typeof PROJECTOR_TEST_PHYSICAL_VERDICTS)[number]["id"];

export interface ProjectorTestPreset {
  id: string;
  label: string;
  projectorModel: string;
  lens: string;
  requestedResolution: string;
  requestedRefreshHz: number;
  notes: string;
}

export const PROJECTOR_TEST_PRESETS = [
  {
    id: "sharp-p601q",
    label: "Sharp XP-P601Q · evaluation loan",
    projectorModel: "Sharp XP-P601Q-W / XP-P60Q-W",
    lens: "Integrated motorised 1.6× zoom · 1.25–2.0:1 throw · H ±25% / V +55% shift",
    requestedResolution: "1920x1080",
    requestedRefreshHz: 120,
    notes:
      "Sharp evaluation pretest. Start at 1080p120, attempt 1080p240 only if the projector information screen confirms it, then test 4K60 and 1080p60. Record the exact unit, firmware and processing settings. Published synchronization support is not an input-lag measurement. No purchase, loan, publicity or partnership commitment.",
  },
  {
    id: "benq-lk830st",
    label: "BenQ LK830ST · low-latency comparison",
    projectorModel: "BenQ LK830ST",
    lens: "Integrated fixed lens · 0.496 throw · 114% offset",
    requestedResolution: "1920x1080",
    requestedRefreshHz: 120,
    notes:
      "BenQ demonstration pretest. Test LK830ST first at 1080p120, then 1080p240, 4K60 and 1080p60. Confirm every accepted mode on the projector information screen. No purchase, loan or partnership commitment.",
  },
] as const satisfies readonly ProjectorTestPreset[];

export type ProjectorTestPresetId = (typeof PROJECTOR_TEST_PRESETS)[number]["id"];

export const DEFAULT_PROJECTOR_TEST_PRESET_ID: ProjectorTestPresetId = "sharp-p601q";

export function getProjectorTestPreset(id: string): ProjectorTestPreset | undefined {
  return PROJECTOR_TEST_PRESETS.find((preset) => preset.id === id);
}

export interface ProjectorTestRenderState {
  pattern: ProjectorTestPattern;
  frame: number;
  timestampMs: number;
  startedAtMs: number;
  showOverlay: boolean;
  requestedRefreshHz: number;
}

export interface ProjectorTestRecordInput {
  projectorModel: string;
  serialNumber: string;
  firmware: string;
  lens: string;
  signalMode: string;
  imageMode: string;
  throwDistanceM: number | null;
  imageWidthM: number | null;
  requestedResolution: string;
  requestedRefreshHz: number;
  projectorConfirmedMode: boolean;
  observedBrowserHz: number | null;
  recordingFps?: number | null;
  latencyBestMs?: number | null;
  latencyMedianMs?: number | null;
  latencyWorstMs?: number | null;
  focusVerdict?: ProjectorTestObservationVerdict;
  materialVerdict?: ProjectorTestObservationVerdict;
  physicalTestVerdict?: ProjectorTestPhysicalVerdict;
  notes: string;
}

export interface ProjectorTestRecord extends ProjectorTestRecordInput {
  schema: "orbital-projector-test-v1";
  recordedAt: string;
  evidenceBoundary: string;
}

export function patternLabel(pattern: ProjectorTestPattern): string {
  return PROJECTOR_TEST_PATTERNS.find((candidate) => candidate.id === pattern)?.label ?? pattern;
}

export function buildProjectorTestRecord(
  input: ProjectorTestRecordInput,
  recordedAt = new Date().toISOString(),
): ProjectorTestRecord {
  return {
    schema: "orbital-projector-test-v1",
    recordedAt,
    ...input,
    recordingFps: input.recordingFps ?? null,
    latencyBestMs: input.latencyBestMs ?? null,
    latencyMedianMs: input.latencyMedianMs ?? null,
    latencyWorstMs: input.latencyWorstMs ?? null,
    focusVerdict: input.focusVerdict ?? "not-tested",
    materialVerdict: input.materialVerdict ?? "not-tested",
    physicalTestVerdict: input.physicalTestVerdict ?? "unmeasured",
    evidenceBoundary:
      "Requested and browser-observed modes are software evidence only. Accepted signal mode must be confirmed on the projector information screen, and motion-to-photon latency requires a physical high-speed-camera measurement.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== "string") throw new Error(`Projector test ${field} must be text`);
  return value;
}

function requiredBoolean(source: Record<string, unknown>, field: string): boolean {
  const value = source[field];
  if (typeof value !== "boolean") throw new Error(`Projector test ${field} must be true or false`);
  return value;
}

function nullableNumber(source: Record<string, unknown>, field: string): number | null {
  const value = source[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Projector test ${field} must be a non-negative number or null`);
  }
  return value;
}

function parseObservationVerdict(value: unknown): ProjectorTestObservationVerdict {
  return PROJECTOR_TEST_OBSERVATION_VERDICTS.some((candidate) => candidate.id === value)
    ? value as ProjectorTestObservationVerdict
    : "not-tested";
}

function parsePhysicalVerdict(value: unknown): ProjectorTestPhysicalVerdict {
  return PROJECTOR_TEST_PHYSICAL_VERDICTS.some((candidate) => candidate.id === value)
    ? value as ProjectorTestPhysicalVerdict
    : "unmeasured";
}

export function parseProjectorTestRecord(source: unknown): ProjectorTestRecord {
  if (!isRecord(source) || source.schema !== "orbital-projector-test-v1") {
    throw new Error("File is not an orbital-projector-test-v1 record");
  }
  const recordedAt = requiredString(source, "recordedAt");
  if (!Number.isFinite(new Date(recordedAt).getTime())) {
    throw new Error("Projector test recordedAt must be a valid date");
  }
  const requestedRefreshHz = nullableNumber(source, "requestedRefreshHz");
  if (requestedRefreshHz === null || requestedRefreshHz <= 0) {
    throw new Error("Projector test requestedRefreshHz must be greater than zero");
  }
  return buildProjectorTestRecord({
    projectorModel: requiredString(source, "projectorModel"),
    serialNumber: requiredString(source, "serialNumber"),
    firmware: requiredString(source, "firmware"),
    lens: requiredString(source, "lens"),
    signalMode: requiredString(source, "signalMode"),
    imageMode: requiredString(source, "imageMode"),
    throwDistanceM: nullableNumber(source, "throwDistanceM"),
    imageWidthM: nullableNumber(source, "imageWidthM"),
    requestedResolution: requiredString(source, "requestedResolution"),
    requestedRefreshHz,
    projectorConfirmedMode: requiredBoolean(source, "projectorConfirmedMode"),
    observedBrowserHz: nullableNumber(source, "observedBrowserHz"),
    recordingFps: nullableNumber(source, "recordingFps"),
    latencyBestMs: nullableNumber(source, "latencyBestMs"),
    latencyMedianMs: nullableNumber(source, "latencyMedianMs"),
    latencyWorstMs: nullableNumber(source, "latencyWorstMs"),
    focusVerdict: parseObservationVerdict(source.focusVerdict),
    materialVerdict: parseObservationVerdict(source.materialVerdict),
    physicalTestVerdict: parsePhysicalVerdict(source.physicalTestVerdict),
    notes: requiredString(source, "notes"),
  }, recordedAt);
}

export function projectorTestThrowRatio(record: ProjectorTestRecord): number | null {
  if (
    record.throwDistanceM === null ||
    record.imageWidthM === null ||
    record.throwDistanceM <= 0 ||
    record.imageWidthM <= 0
  ) return null;
  return record.throwDistanceM / record.imageWidthM;
}

export function projectorTestObservationVerdictLabel(
  verdict: ProjectorTestObservationVerdict,
): string {
  return PROJECTOR_TEST_OBSERVATION_VERDICTS.find((candidate) => candidate.id === verdict)?.label
    ?? "Not tested";
}

export function projectorTestPhysicalVerdictLabel(
  verdict: ProjectorTestPhysicalVerdict,
): string {
  return PROJECTOR_TEST_PHYSICAL_VERDICTS.find((candidate) => candidate.id === verdict)?.label
    ?? "Unmeasured";
}

function filenameSlug(value: string, fallback: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

export function buildProjectorTestFilename(record: ProjectorTestRecord): string {
  const recordedDate = new Date(record.recordedAt);
  const timestamp = Number.isFinite(recordedDate.getTime())
    ? recordedDate.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
    : filenameSlug(record.recordedAt, "unknown-time");
  const model = filenameSlug(record.projectorModel, "unknown-projector");
  const resolution = filenameSlug(record.requestedResolution, "unknown-resolution");
  const refresh = Number.isFinite(record.requestedRefreshHz)
    ? `${record.requestedRefreshHz}hz`
    : "unknown-refresh";
  return `orbital-projector-test_${timestamp}_${model}_${resolution}_${refresh}.json`;
}

function drawOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: ProjectorTestRenderState,
): void {
  if (!state.showOverlay) return;
  const elapsedMs = Math.max(0, state.timestampMs - state.startedAtMs);
  const boxHeight = Math.max(44, Math.round(height * 0.075));
  context.fillStyle = "rgba(0, 0, 0, 0.76)";
  context.fillRect(0, 0, width, boxHeight);
  context.fillStyle = "#fff";
  context.textBaseline = "middle";
  context.font = `700 ${Math.max(14, Math.round(boxHeight * 0.28))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.fillText(
    `ORBITAL  ${patternLabel(state.pattern).toUpperCase()}  FRAME ${String(state.frame).padStart(7, "0")}`,
    Math.round(boxHeight * 0.3),
    boxHeight * 0.38,
  );
  context.fillStyle = "#9cf5dd";
  context.font = `500 ${Math.max(10, Math.round(boxHeight * 0.2))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.fillText(
    `${elapsedMs.toFixed(1)} ms  REQUESTED ${state.requestedRefreshHz} Hz  PROJECTOR CONFIRMATION REQUIRED`,
    Math.round(boxHeight * 0.3),
    boxHeight * 0.76,
  );
}

function drawEdgeMarkers(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const marker = Math.max(12, Math.round(Math.min(width, height) * 0.025));
  context.strokeStyle = "#fff";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
  for (const [x, y, sx, sy] of [
    [0, 0, 1, 1],
    [width, 0, -1, 1],
    [0, height, 1, -1],
    [width, height, -1, -1],
  ] as const) {
    context.beginPath();
    context.moveTo(x, y + sy * marker);
    context.lineTo(x, y);
    context.lineTo(x + sx * marker, y);
    context.stroke();
  }
}

export function renderProjectorTestPattern(
  canvas: HTMLCanvasElement,
  state: ProjectorTestRenderState,
): void {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);

  if (state.pattern === "latency") {
    const white = state.frame % 2 === 0;
    context.fillStyle = white ? "#fff" : "#000";
    context.fillRect(0, 0, width, height);
    context.fillStyle = white ? "#000" : "#fff";
    const fontSize = Math.max(72, Math.round(Math.min(width, height) * 0.22));
    context.font = `900 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(state.frame).padStart(6, "0"), width / 2, height / 2);
    context.textAlign = "start";
  } else if (state.pattern === "grid") {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#fff";
    context.lineWidth = 1;
    const spacing = Math.max(16, Math.round(Math.min(width, height) / 24));
    context.beginPath();
    for (let x = 0.5; x < width; x += spacing) {
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let y = 0.5; y < height; y += spacing) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();
    drawEdgeMarkers(context, width, height);
  } else if (state.pattern === "focus") {
    context.fillStyle = "#111";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#fff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const sizes = [12, 16, 24, 36, 54, 80];
    sizes.forEach((size, index) => {
      context.font = `500 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.fillText(`ORBITAL FOCUS ${size}px 0123456789`, width / 2, height * (0.2 + index * 0.105));
    });
    context.textAlign = "start";
    drawEdgeMarkers(context, width, height);
  } else if (state.pattern === "circles") {
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#fff";
    context.lineWidth = 1;
    const radiusStep = Math.max(12, Math.min(width, height) / 24);
    for (let radius = radiusStep; radius < Math.hypot(width, height) * 0.55; radius += radiusStep) {
      context.beginPath();
      context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(0, height / 2 + 0.5);
    context.lineTo(width, height / 2 + 0.5);
    context.moveTo(width / 2 + 0.5, 0);
    context.lineTo(width / 2 + 0.5, height);
    context.stroke();
    drawEdgeMarkers(context, width, height);
  } else {
    const colours: Record<Exclude<ProjectorTestPattern, "latency" | "grid" | "focus" | "circles">, string> = {
      white: "#fff",
      gray: "#808080",
      black: "#000",
      red: "#f00",
      green: "#0f0",
      blue: "#00f",
    };
    context.fillStyle = colours[state.pattern];
    context.fillRect(0, 0, width, height);
  }

  drawOverlay(context, width, height, state);
  context.restore();
}
