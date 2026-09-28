/**
 * Motion evidence extracted from IMG_6021.MOV, recorded in the hall.
 *
 * The 17.67 s clip was sampled at 10 fps and the visible silhouette was fitted
 * in each frame. Pixel measurements are normalised by the mean apparent radius
 * because the clip does not provide a calibrated camera or confirmed diameter.
 * These are reference bands for the digital twin, not material constants or CFD.
 */
export const REAL_BALLOON_REFERENCE = Object.freeze({
  source: "IMG_6021.MOV",
  durationS: 17.670385,
  analysisFps: 10,
  evidenceBoundary: "single uncalibrated monocular hall recording",
  measured: Object.freeze({
    horizontalCenterExcursionRadii: 0.43,
    verticalCenterExcursionRadii: 0.33,
    widthP05ToP95Fraction: 0.04,
    heightP05ToP95Fraction: 0.126,
    aspectRatioP05: 0.907,
    aspectRatioP95: 1.029,
    lowOrderLobeP95RadiusFraction: 0.043,
  }),
  timing: Object.freeze({
    slowCenterDriftS: 17.6,
    broadBreathingS: 5.9,
    deformationPulseS: 5.9,
    secondaryLobeS: 2.95,
  }),
});

/**
 * Perceptual synthesis targets derived from the measured bands above. The
 * primary cycles carry the apparent mass; secondary cycles prevent a perfect,
 * mechanical sine loop without introducing rapid random shake.
 */
export const LATEX_BALLOON_MOTION_PROFILE = Object.freeze({
  centerDriftPeriodS: Object.freeze({
    xPrimary: REAL_BALLOON_REFERENCE.timing.slowCenterDriftS,
    xSecondary: 5.9,
    yPrimary: REAL_BALLOON_REFERENCE.timing.slowCenterDriftS,
    ySecondary: 6.8,
    zPrimary: 15.4,
    zSecondary: 7.6,
  }),
  grossBulgePeriodS: Object.freeze({
    primary: REAL_BALLOON_REFERENCE.timing.broadBreathingS,
    secondary: REAL_BALLOON_REFERENCE.timing.secondaryLobeS,
    vertical: 8.8,
  }),
  grossBulgeAmplitude: Object.freeze({
    primary: 0.022,
    secondary: 0.009,
    vertical: 0.05,
  }),
  principalAxisDriftDegPerS: 0.55,
});

export interface VideoDerivedBalloonMotion {
  centerOffsetM: Readonly<{ x: number; y: number; z: number }>;
  radiiScale: Readonly<{ x: number; y: number; z: number }>;
  principalAxisDeg: number;
  wobble: number;
}

// Fits sampled every 0.5 seconds with the Stage A browser silhouette tracker.
// Each row is [centre x, centre y, major diameter, minor diameter, axis angle].
// Angles are unwrapped around zero so interpolation never spins through 180°.
const VIDEO_FIT_STEP_S = 0.5;
const VIDEO_FIT_TRACE = Object.freeze([
  [0.526291, 0.409649, 53.0987, 48.4876, 11.0271],
  [0.525807, 0.408467, 53.1767, 48.9678, 8.1712],
  [0.523041, 0.409509, 53.1374, 48.3776, 9.8975],
  [0.518152, 0.410923, 52.9861, 48.3734, 16.6368],
  [0.518152, 0.410923, 52.9861, 48.3734, 16.6368],
  [0.509687, 0.406342, 52.1357, 48.1908, 19.1922],
  [0.507151, 0.397795, 51.9209, 48.2327, 15.4987],
  [0.507643, 0.393382, 52.006, 48.3512, 17.8252],
  [0.507643, 0.393382, 52.006, 48.3512, 17.8252],
  [0.510336, 0.392259, 52.0615, 48.4405, 9.3676],
  [0.510336, 0.392259, 52.0615, 48.4405, 9.3676],
  [0.519049, 0.39403, 52.5104, 49.7574, 19.2589],
  [0.520503, 0.397547, 52.9639, 50.0038, 17.8801],
  [0.519518, 0.397892, 53.4146, 49.8179, 16.4052],
  [0.517806, 0.396594, 53.5266, 49.308, 14.9677],
  [0.516385, 0.394196, 53.2586, 49.3687, 8.4018],
  [0.515696, 0.394787, 52.5695, 49.9343, 4.3418],
  [0.514091, 0.397108, 52.3296, 49.1687, -4.0696],
  [0.516469, 0.40487, 52.1203, 48.6578, -8.9514],
  [0.522186, 0.401832, 51.9622, 48.57, -7.393],
  [0.524001, 0.383857, 52.5855, 48.0886, -3.4592],
  [0.526521, 0.369152, 52.9279, 47.87, -1.6863],
  [0.526521, 0.369152, 52.9279, 47.87, -1.6863],
  [0.529406, 0.393608, 53.5447, 48.9502, -3.2117],
  [0.523805, 0.405029, 53.8869, 49.5033, 0.1242],
  [0.520247, 0.392827, 54.2319, 49.4624, 4.1776],
  [0.520247, 0.392827, 54.2319, 49.4624, 4.1776],
  [0.526759, 0.365697, 54.6432, 49.4475, 6.5992],
  [0.528202, 0.364321, 54.6471, 49.4315, 9.4263],
  [0.524193, 0.36893, 54.1249, 49.6927, 11.3123],
  [0.515555, 0.366117, 53.7976, 49.5426, 14.9172],
  [0.508443, 0.360029, 53.3957, 49.7609, 13.819],
  [0.508443, 0.360029, 53.3957, 49.7609, 13.819],
  [0.494319, 0.361964, 53.2242, 50.339, 14.9592],
  [0.492065, 0.35647, 53.055, 50.4474, 12.5766],
] as const);

const VIDEO_CENTER_MEAN = Object.freeze({ x: 0.5169905429, y: 0.3889644286 });
const VIDEO_BASELINE_DIAMETER_PX = (53.0987 + 48.4876) * 0.5;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * b +
    (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t2 +
    (-a + 3 * b - 3 * c + d) * t3
  );
}

function mirroredTraceTime(timeS: number): number {
  const duration = (VIDEO_FIT_TRACE.length - 1) * VIDEO_FIT_STEP_S;
  const cycle = duration * 2;
  const wrapped = ((timeS % cycle) + cycle) % cycle;
  return wrapped <= duration ? wrapped : cycle - wrapped;
}

function sampleTrace(timeS: number): readonly number[] {
  const position = mirroredTraceTime(timeS) / VIDEO_FIT_STEP_S;
  const index = Math.min(VIDEO_FIT_TRACE.length - 2, Math.floor(position));
  const fraction = position - index;
  const at = (offset: number) => VIDEO_FIT_TRACE[
    Math.max(0, Math.min(VIDEO_FIT_TRACE.length - 1, index + offset))
  ];
  const previous = at(-1);
  const current = at(0);
  const next = at(1);
  const following = at(2);
  return current.map((_, component) => catmullRom(
    previous[component] ?? 0,
    current[component] ?? 0,
    next[component] ?? 0,
    following[component] ?? 0,
    fraction,
  ));
}

/**
 * Smooth presentation motion reconstructed from IMG_6021.MOV. The trace is
 * mirrored at each end, so the default loop has no position or shape seam.
 */
export function sampleVideoDerivedBalloonMotion(timeS: number): VideoDerivedBalloonMotion {
  const sample = sampleTrace(Number.isFinite(timeS) ? timeS : 0);
  const centerX = sample[0] ?? VIDEO_CENTER_MEAN.x;
  const centerY = sample[1] ?? VIDEO_CENTER_MEAN.y;
  const major = sample[2] ?? VIDEO_BASELINE_DIAMETER_PX;
  const minor = sample[3] ?? VIDEO_BASELINE_DIAMETER_PX;
  const angleDeg = sample[4] ?? 0;
  const angle = angleDeg * Math.PI / 180;
  const cos2 = Math.cos(angle) ** 2;
  const sin2 = Math.sin(angle) ** 2;
  const majorScale = major / VIDEO_BASELINE_DIAMETER_PX;
  const minorScale = minor / VIDEO_BASELINE_DIAMETER_PX;
  const scaleX = majorScale * cos2 + minorScale * sin2;
  const scaleY = majorScale * sin2 + minorScale * cos2;
  const scaleZ = 1 / Math.max(0.82, scaleX * scaleY);
  const axisRatio = major / Math.max(1, minor);
  return {
    centerOffsetM: {
      x: (centerX - VIDEO_CENTER_MEAN.x) * 4,
      y: (VIDEO_CENTER_MEAN.y - centerY) * 3,
      z: 0,
    },
    radiiScale: { x: scaleX, y: scaleY, z: scaleZ },
    principalAxisDeg: angleDeg,
    wobble: clamp01(0.05 + Math.abs(axisRatio - 1) * 0.9),
  };
}
