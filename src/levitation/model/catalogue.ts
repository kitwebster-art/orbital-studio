/**
 * Orbital Levitation Lab: shape, material and preset catalogue.
 *
 * All geometry proportions are in units of the design size s (the largest
 * horizontal extent at rest, metres). Aerodynamic coefficients are
 * reduced-order estimates chosen from textbook bluff-body data and then tuned
 * so the analysis and the simulation tell the same, plausible story. They are
 * not measurements; the Guide page presents them as estimates.
 */

import type {
  DesignConfig,
  DesignPreset,
  FanConfig,
  FanType,
  MaterialDefinition,
  MaterialId,
  ShapeDefinition,
  ShapeGeometrySpec,
  ShapeId,
} from './types';
import { clamp, isFiniteNumber } from './math';

// ---------------------------------------------------------------------------
// Design limits (documented ranges; the UI can build sliders from these)
// ---------------------------------------------------------------------------

export const DESIGN_LIMITS = Object.freeze({
  sizeM: [0.1, 5] as const,
  heliumFraction: [0, 1] as const,
  /** Room ceiling above the outlet. Always raised to fit the body plus 0.3 m. */
  ceilingM: [1.5, 30] as const,
  fan: Object.freeze({
    diameterM: [0.2, 2] as const,
    outletSpeedMps: [0.5, 30] as const,
    turbulence: [0, 1] as const,
  }),
});

export const FAN_TYPES: readonly FanType[] = ['axial', 'axial-straightened', 'plug-flowgrid'];

// ---------------------------------------------------------------------------
// Procedural profiles
// ---------------------------------------------------------------------------

/**
 * Twin ("mitosis") profile: smooth union of two circles in the (radius, height)
 * half-plane, sampled densely near the poles. Lower lobe radius 0.5 (so the
 * largest horizontal extent is exactly s), upper lobe radius 0.44.
 */
function twinProfile(): Array<[number, number]> {
  const lower = { y: 0.5, r: 0.5 };
  const upper = { y: 1.3, r: 0.44 };
  const k = 0.14;
  const field = (r: number, y: number): number => {
    const d1 = Math.hypot(r, y - lower.y) - lower.r;
    const d2 = Math.hypot(r, y - upper.y) - upper.r;
    const h = Math.max(k - Math.abs(d1 - d2), 0) / k;
    return Math.min(d1, d2) - h * h * k * 0.25;
  };
  const bottom = lower.y - lower.r;
  const top = upper.y + upper.r;
  const points: Array<[number, number]> = [];
  const count = 48;
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const y = bottom + (top - bottom) * (1 - Math.cos(Math.PI * t)) * 0.5;
    if (i === 0 || i === count) {
      points.push([0, y]);
      continue;
    }
    let lo = 0;
    let hi = 0.6;
    if (field(lo, y) > 0) {
      points.push([0, y]);
      continue;
    }
    for (let it = 0; it < 48; it += 1) {
      const mid = (lo + hi) * 0.5;
      if (field(mid, y) < 0) lo = mid;
      else hi = mid;
    }
    points.push([Number(lo.toFixed(5)), Number(y.toFixed(5))]);
  }
  return points;
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const ORB_GEOMETRY: ShapeGeometrySpec = { kind: 'ellipsoid', radii: { x: 0.5, y: 0.5, z: 0.5 } };

export const SHAPES: readonly ShapeDefinition[] = Object.freeze([
  {
    id: 'orb',
    name: 'Orb',
    tagline: 'The Orbital baseline: a sphere the jet can hold from any angle',
    description:
      'A plain sphere. It looks the same from every side, so tilt and spin do not matter and projection wraps evenly. A sphere much wider than the jet feels almost the whole jet at any height, so its hover height is sensitive to fan speed.',
    geometry: ORB_GEOMETRY,
    inflatable: true,
    cdAxial: 0.47,
    cdSide: 0.47,
    dragCrisis: true,
    impingementCoeff: 0.55,
    throughFlowFraction: 0,
    coandaCoeff: 0.75,
    strouhal: 0.2,
    sheddingLiftCoeff: 0.05,
    tiltLiftSlope: 0,
    cpOffset: 0,
    cmOffset: 0,
    ballastFraction: 0,
    addedMassCoeff: 0.5,
    swirlCoupling: 0.15,
    smoothness: 1,
    convexity: 1,
    projectionNotes:
      'The best all-round projection surface: continuous curvature, no edges in view, and an even fall-off toward the rim.',
    trackingNotes:
      'A circle from every camera, which is exactly what ellipse fitting wants. Rotation is invisible, so the tracker can ignore it.',
    fabricationNotes:
      'Welded PVC or a latex balloon. Three metre spheres are standard event inflatables; add a stiff valve collar on the underside.',
  },
  {
    id: 'lens',
    name: 'Lens',
    tagline: 'A flying saucer that glides when it tips',
    description:
      'An oblate spheroid, much wider than it is tall. It catches the jet broadside and floats calmly, but if it tips it slides sideways like a skimmed stone. It behaves best over a jet that is at least as wide as it is.',
    geometry: { kind: 'ellipsoid', radii: { x: 0.5, y: 0.18, z: 0.5 } },
    inflatable: true,
    cdAxial: 1.0,
    cdSide: 0.3,
    dragCrisis: false,
    impingementCoeff: 0.85,
    throughFlowFraction: 0,
    coandaCoeff: 0.55,
    strouhal: 0.18,
    sheddingLiftCoeff: 0.07,
    tiltLiftSlope: 0.26,
    cpOffset: 0,
    cmOffset: 0,
    ballastFraction: 0,
    addedMassCoeff: 0.85,
    swirlCoupling: 0.2,
    smoothness: 0.95,
    convexity: 0.95,
    projectionNotes:
      'The broad domed top and underside are good screens for steep throws; the thin rim is hard to hit from the side.',
    trackingNotes:
      'Side cameras see a thin ellipse whose aspect changes with tilt, which is useful for estimating tilt. A camera below sees a steady circle.',
    fabricationNotes:
      'Two welded discs with a narrow gusset, or a round balloon squeezed by a tension band at the rim.',
  },
  {
    id: 'seed',
    name: 'Seed',
    tagline: 'An upright egg with a weighted base',
    description:
      'A tall egg with a small ballast in its base. Long bodies want to turn sideways in an airstream; the heavy base keeps this one standing like a roly-poly toy.',
    geometry: { kind: 'ellipsoid', radii: { x: 0.5, y: 0.78, z: 0.5 } },
    inflatable: true,
    cdAxial: 0.32,
    cdSide: 0.62,
    dragCrisis: true,
    impingementCoeff: 0.48,
    throughFlowFraction: 0,
    coandaCoeff: 0.7,
    strouhal: 0.2,
    sheddingLiftCoeff: 0.05,
    tiltLiftSlope: 0.02,
    cpOffset: 0.12,
    cmOffset: -0.38,
    ballastFraction: 1.2,
    addedMassCoeff: 0.3,
    swirlCoupling: 0.12,
    smoothness: 0.95,
    convexity: 0.97,
    projectionNotes:
      'A tall vertical canvas that suits figures and portraits. Curvature is gentle along the height and tighter around the girth.',
    trackingNotes:
      'An upright ellipse with a known aspect ratio, so a side camera can estimate lean directly.',
    fabricationNotes:
      'Sewn gores or an egg-shaped latex balloon, with a sand or glass-bead ballast pocket in the base.',
  },
  {
    id: 'halo',
    name: 'Halo',
    tagline: 'A spinning ring the jet threads through',
    description:
      'A flat ring. Part of the jet slips through the hole, so it needs more air than a disc. The swirl of a raw axial fan sets it turning, and the faster it spins the more it resists tipping, like a gyroscope.',
    geometry: { kind: 'torus', majorRadius: 0.35, tubeRadius: 0.15 },
    inflatable: true,
    cdAxial: 1.05,
    cdSide: 0.5,
    dragCrisis: false,
    impingementCoeff: 0.8,
    throughFlowFraction: 0.75,
    coandaCoeff: 0.6,
    strouhal: 0.2,
    sheddingLiftCoeff: 0.08,
    tiltLiftSlope: 0.12,
    cpOffset: 0,
    cmOffset: 0,
    ballastFraction: 0,
    addedMassCoeff: 0.6,
    swirlCoupling: 0.9,
    smoothness: 0.85,
    convexity: 0.72,
    projectionNotes:
      'The outer rim reads well from the side and the top can carry a ring of animation. Mask the hole so light does not spill onto the floor.',
    trackingNotes:
      'From the side it is a flat lozenge. From below it is an annulus, which a blob tracker can misread as two objects.',
    fabricationNotes:
      'An inflatable ring in TPU nylon, or a carbon hoop wrapped in washi. Balance it so it spins true.',
  },
  {
    id: 'geode',
    name: 'Geode',
    tagline: 'A faceted crystal of flat projection planes',
    description:
      'An 80-facet geodesic ball. Every flat facet can carry its own image and the edges catch light like a cut stone. The facets roughen the airflow, so it never gets the sudden drag drop of a smooth ball.',
    geometry: { kind: 'icosphere', radius: 0.5, detail: 1 },
    inflatable: false,
    cdAxial: 0.55,
    cdSide: 0.55,
    dragCrisis: false,
    impingementCoeff: 0.62,
    throughFlowFraction: 0,
    coandaCoeff: 0.7,
    strouhal: 0.2,
    sheddingLiftCoeff: 0.06,
    tiltLiftSlope: 0.03,
    cpOffset: 0,
    cmOffset: 0,
    ballastFraction: 0,
    addedMassCoeff: 0.5,
    swirlCoupling: 0.25,
    smoothness: 0.7,
    convexity: 0.97,
    projectionNotes:
      'Each facet is a flat, individually mappable screen. Neighbouring facets face different ways, so brightness steps from facet to facet.',
    trackingNotes:
      'A nearly circular silhouette with small corners; it tracks almost as well as the orb.',
    fabricationNotes:
      'A 2V geodesic frame (120 struts, 42 hubs) skinned with EPS panels, Tyvek or washi.',
  },
  {
    id: 'pebble',
    name: 'Pebble',
    tagline: 'A softly rounded cube',
    description:
      'A box with its corners melted. The flat underside gets a firm push from the jet, but a pebble much wider than the jet can tip and slide off.',
    geometry: { kind: 'superellipsoid', radii: { x: 0.42, y: 0.3, z: 0.42 }, e1: 0.45, e2: 0.5 },
    inflatable: true,
    cdAxial: 0.9,
    cdSide: 0.82,
    dragCrisis: false,
    impingementCoeff: 0.85,
    throughFlowFraction: 0,
    coandaCoeff: 0.55,
    strouhal: 0.16,
    sheddingLiftCoeff: 0.09,
    tiltLiftSlope: 0.16,
    cpOffset: 0,
    cmOffset: 0,
    ballastFraction: 0,
    addedMassCoeff: 0.6,
    swirlCoupling: 0.3,
    smoothness: 0.8,
    convexity: 0.92,
    projectionNotes:
      'Four sides and a top that act like soft screens; the rounded corners hide seams and projector edges.',
    trackingNotes:
      'A rounded-square silhouette; the fitted ellipse sits slightly inside the corners.',
    fabricationNotes:
      'Welded PVC with rounded gussets, or folded Tyvek over a light frame.',
  },
  {
    id: 'shuttle',
    name: 'Shuttle',
    tagline: 'Always lands nose first, so it always stands up',
    description:
      'A shuttlecock: a weighted round nose below and a light flared skirt above. The skirt catches the air far above the heavy nose, so any tilt corrects itself, just like a badminton shuttle in flight.',
    geometry: {
      kind: 'lathe',
      closed: false,
      profile: [
        [0, 0],
        [0.07, 0.012],
        [0.12, 0.045],
        [0.155, 0.095],
        [0.17, 0.16],
        [0.165, 0.22],
        [0.18, 0.3],
        [0.24, 0.5],
        [0.31, 0.7],
        [0.39, 0.9],
        [0.46, 1.08],
        [0.5, 1.2],
      ],
    },
    inflatable: false,
    cdAxial: 0.65,
    cdSide: 0.95,
    dragCrisis: false,
    impingementCoeff: 0.85,
    throughFlowFraction: 0,
    coandaCoeff: 0.6,
    strouhal: 0.2,
    sheddingLiftCoeff: 0.05,
    tiltLiftSlope: 0.05,
    cpOffset: 0.22,
    cmOffset: -0.2,
    ballastFraction: 1.5,
    addedMassCoeff: 0.45,
    swirlCoupling: 0.35,
    smoothness: 0.7,
    convexity: 0.8,
    projectionNotes:
      'The outer skirt is a tall conical screen facing the audience; the nose is small and reads as dark.',
    trackingNotes:
      'A trapezoid silhouette with a steady orientation, convex enough for ellipse fitting.',
    fabricationNotes:
      'A Tyvek or washi skirt on 8 to 16 carbon ribs, glued into a rounded foam or cork nose that carries the ballast.',
  },
  {
    id: 'medusa',
    name: 'Medusa',
    tagline: 'A slow jellyfish that parachutes on the jet',
    description:
      'An open dome, hollow side down, trailing ribbons and a small keel weight. The dome traps the air like a parachute, giving the most push per gram, so it drifts slowly on a gentle jet.',
    geometry: {
      kind: 'lathe',
      closed: false,
      profile: [
        [0.5, 0],
        [0.495, 0.06],
        [0.475, 0.13],
        [0.44, 0.2],
        [0.385, 0.27],
        [0.31, 0.33],
        [0.22, 0.375],
        [0.11, 0.402],
        [0, 0.41],
      ],
    },
    inflatable: false,
    cdAxial: 1.35,
    cdSide: 0.85,
    dragCrisis: false,
    impingementCoeff: 1.3,
    throughFlowFraction: 0,
    coandaCoeff: 0.55,
    strouhal: 0.14,
    sheddingLiftCoeff: 0.07,
    tiltLiftSlope: 0.08,
    cpOffset: 0.12,
    cmOffset: -0.3,
    ballastFraction: 0.8,
    addedMassCoeff: 0.9,
    swirlCoupling: 0.3,
    smoothness: 0.75,
    convexity: 0.8,
    projectionNotes:
      'The dome is a bright, smooth screen; the ribbons catch stray light and add slow movement.',
    trackingNotes:
      'The dome gives a clean half-ellipse. Trailing ribbons can confuse a silhouette tracker unless they are dark or absorb infrared.',
    fabricationNotes:
      'A silnylon or Tyvek dome on a light hoop at the rim, with a short keel line to a small weight on the axis.',
  },
  {
    id: 'twin',
    name: 'Twin',
    tagline: 'Two lobes pulling apart, mid mitosis',
    description:
      'A vertical peanut of two fused lobes. Tall bodies would rather lie down in the jet; a little weight in the lower lobe keeps it standing, but it rocks as it hovers.',
    geometry: { kind: 'lathe', closed: true, profile: twinProfile() },
    inflatable: true,
    cdAxial: 0.38,
    cdSide: 0.72,
    dragCrisis: true,
    impingementCoeff: 0.5,
    throughFlowFraction: 0,
    coandaCoeff: 0.68,
    strouhal: 0.2,
    sheddingLiftCoeff: 0.07,
    tiltLiftSlope: 0.03,
    cpOffset: 0.18,
    cmOffset: -0.3,
    ballastFraction: 0.6,
    addedMassCoeff: 0.35,
    swirlCoupling: 0.12,
    smoothness: 0.88,
    convexity: 0.72,
    projectionNotes:
      'Two stacked spheres read as separate screens with a waist between them; ideal for dividing-cell animation.',
    trackingNotes:
      'The figure-eight silhouette is not convex: ellipse fitting finds the right centre but misjudges the waist.',
    fabricationNotes:
      'Two latex balloons nested and banded at the waist, or sewn TPU gores with a ballast pocket in the lower lobe.',
  },
  {
    id: 'ribbon',
    name: 'Ribbon',
    tagline: 'A Mobius loop: the honest failure',
    description:
      'A single band with one half twist. The twist puts more flat area on one side, so the push is lopsided and the loop keeps turning over. It is in the lab to show what does not work.',
    geometry: { kind: 'ribbon', radius: 0.4, width: 0.2, twists: 1 },
    inflatable: false,
    cdAxial: 1.1,
    cdSide: 0.9,
    dragCrisis: false,
    impingementCoeff: 0.8,
    throughFlowFraction: 0.5,
    coandaCoeff: 0.25,
    strouhal: 0.22,
    sheddingLiftCoeff: 0.22,
    tiltLiftSlope: 0.45,
    cpOffset: -0.05,
    cmOffset: 0,
    ballastFraction: 0,
    addedMassCoeff: 0.9,
    swirlCoupling: 0.6,
    smoothness: 0.4,
    convexity: 0.35,
    projectionNotes:
      'Very little surface, and most of it is edge-on to the audience at any moment.',
    trackingNotes:
      'The silhouette changes completely as it turns over; any tracker will lose it.',
    fabricationNotes:
      'A Mylar strip heat-sealed into a loop with one half twist; a light batten along one edge keeps it open.',
  },
] satisfies ShapeDefinition[]);

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export const MATERIALS: readonly MaterialDefinition[] = Object.freeze([
  {
    id: 'pvc',
    name: 'Matte PVC film, 0.18 mm',
    family: 'inflatable film',
    arealDensityGsm: 250,
    overheadFactor: 1.15,
    reflectance: 0.82,
    gloss: 0.18,
    translucency: 0.08,
    nir850: 0.8,
    elasticity: 0.22,
    compatibleShapes: ['orb', 'lens', 'seed', 'halo', 'pebble', 'twin'],
    swatch: { color: '#f2f1ec', roughness: 0.72, metalness: 0, transmission: 0.02, sheen: 0.05 },
    projectionNotes:
      'The Orbital reference skin: bright, matte and nearly opaque, so projected colour stays saturated and the far side stays dark.',
    fabricationNotes:
      'High-frequency welded gores with a welded valve. Heavy: a 3 m sphere weighs about 8 to 9 kg, which sets the fan size.',
  },
  {
    id: 'latex',
    name: 'Stretched balloon latex',
    family: 'inflatable film',
    arealDensityGsm: 90,
    overheadFactor: 1.05,
    reflectance: 0.78,
    gloss: 0.38,
    translucency: 0.28,
    nir850: 0.72,
    elasticity: 0.9,
    compatibleShapes: ['orb', 'lens', 'seed', 'twin'],
    swatch: { color: '#f5efe4', roughness: 0.42, metalness: 0, transmission: 0.18, sheen: 0.2 },
    projectionNotes:
      'Satin sheen and some translucency: images glow but lose contrast, and a hot spot follows the projector.',
    fabricationNotes:
      'Off-the-shelf giant balloons up to about 1.8 m. Latex slowly leaks helium and ages in UV; the skin squashes and wobbles in the jet.',
  },
  {
    id: 'tpu-nylon',
    name: '20D TPU-coated ripstop nylon',
    family: 'coated fabric',
    arealDensityGsm: 55,
    overheadFactor: 1.3,
    reflectance: 0.76,
    gloss: 0.3,
    translucency: 0.18,
    nir850: 0.74,
    elasticity: 0.1,
    compatibleShapes: ['orb', 'lens', 'seed', 'halo', 'geode', 'pebble', 'shuttle', 'medusa', 'twin'],
    swatch: { color: '#eeede6', roughness: 0.55, metalness: 0, transmission: 0.08, sheen: 0.35 },
    projectionNotes:
      'A good compromise: light, fairly opaque and only mildly glossy. The ripstop grid is invisible from the audience.',
    fabricationNotes:
      'Sewn and seam-taped gores, or heat-welded TPU seams. Airtight enough for helium over a show day.',
  },
  {
    id: 'silnylon',
    name: '30D silicone-coated spinnaker nylon',
    family: 'coated fabric',
    arealDensityGsm: 40,
    overheadFactor: 1.3,
    reflectance: 0.74,
    gloss: 0.34,
    translucency: 0.24,
    nir850: 0.7,
    elasticity: 0.12,
    compatibleShapes: ['orb', 'lens', 'seed', 'halo', 'geode', 'pebble', 'shuttle', 'medusa', 'twin'],
    swatch: { color: '#ecebe4', roughness: 0.48, metalness: 0, transmission: 0.12, sheen: 0.4 },
    projectionNotes:
      'Light and slippery with a soft sheen; slightly translucent, so a dark lining helps the far side stay dark.',
    fabricationNotes:
      'Sewn only (silicone will not glue or tape well); seal seams with silicone. The lightest fabric that holds shape.',
  },
  {
    id: 'tyvek',
    name: 'Tyvek-style HDPE nonwoven',
    family: 'nonwoven',
    arealDensityGsm: 43,
    overheadFactor: 1.25,
    reflectance: 0.88,
    gloss: 0.08,
    translucency: 0.3,
    nir850: 0.85,
    elasticity: 0.05,
    compatibleShapes: ['orb', 'lens', 'seed', 'halo', 'geode', 'pebble', 'shuttle', 'medusa', 'twin'],
    swatch: { color: '#fbfbf8', roughness: 0.9, metalness: 0, transmission: 0.1, sheen: 0 },
    projectionNotes:
      'Very white and very matte, the brightest diffuse screen here. Thin sheets let some light through.',
    fabricationNotes:
      'Folds, tapes and sews like paper that will not tear. Not airtight, so shapes need a light frame or ribs.',
  },
  {
    id: 'washi-carbon',
    name: 'Kite washi on a carbon-rod frame',
    family: 'paper on frame',
    arealDensityGsm: 25,
    overheadFactor: 1.8,
    reflectance: 0.8,
    gloss: 0.06,
    translucency: 0.45,
    nir850: 0.8,
    elasticity: 0,
    compatibleShapes: ['geode', 'shuttle', 'pebble', 'halo'],
    swatch: { color: '#f3eee2', roughness: 0.95, metalness: 0, transmission: 0.3, sheen: 0 },
    projectionNotes:
      'Beautifully soft and lantern-like, but translucent: projections show through to the far side and look paler.',
    fabricationNotes:
      'Kite-maker construction: 1 to 2 mm carbon rods, glued washi panels. The frame roughly doubles the paper weight.',
  },
  {
    id: 'mylar',
    name: 'Metallised BoPET (Mylar) film, 12 um',
    family: 'inflatable film',
    arealDensityGsm: 17,
    overheadFactor: 1.25,
    reflectance: 0.1,
    gloss: 0.95,
    translucency: 0.02,
    nir850: 0.35,
    elasticity: 0.02,
    compatibleShapes: ['orb', 'lens', 'seed', 'halo', 'pebble', 'twin', 'ribbon'],
    swatch: { color: '#c9ccd2', roughness: 0.08, metalness: 1, transmission: 0, sheen: 0 },
    projectionNotes:
      'A mirror, not a screen: projected light bounces off in one direction, so most of the audience sees only reflections.',
    fabricationNotes:
      'Heat-sealed foil balloon film. Extremely light and holds helium for weeks, but creases permanently.',
  },
  {
    id: 'eps-shell',
    name: 'Thin EPS foam shell, 4 mm',
    family: 'rigid foam',
    arealDensityGsm: 80,
    overheadFactor: 1.15,
    reflectance: 0.85,
    gloss: 0.05,
    translucency: 0.1,
    nir850: 0.85,
    elasticity: 0,
    compatibleShapes: ['orb', 'lens', 'seed', 'halo', 'geode', 'pebble', 'shuttle', 'twin'],
    swatch: { color: '#f6f6f2', roughness: 0.85, metalness: 0, transmission: 0.03, sheen: 0 },
    projectionNotes:
      'Bright, matte and rigid: a crisp screen that never wobbles. Paint it with projection paint for even better contrast.',
    fabricationNotes:
      'Hot-wire or thermoformed panels glued into a closed shell. Rigid, so nothing squashes, but it dents and snaps if dropped.',
  },
] satisfies MaterialDefinition[]);

// ---------------------------------------------------------------------------
// Presets (tuned against analyseDesign and LevitationSimulation)
// ---------------------------------------------------------------------------

function fan(diameterM: number, outletSpeedMps: number, type: FanType, turbulence: number): FanConfig {
  return { diameterM, outletSpeedMps, type, turbulence };
}

export const PRESETS: readonly DesignPreset[] = Object.freeze([
  {
    id: 'orbital-3m',
    name: 'Orbital, 3 m sphere',
    description:
      "Kit's installation baseline: a 3 m matte PVC sphere over an 800 mm plug-fan outlet with a flow grid (two 710 mm plug fans feeding one outlet). At 15.5 m/s its centre hovers about 2.5 m up, bobbing slowly; a few percent more fan speed lifts it a long way.",
    design: {
      shapeId: 'orb',
      sizeM: 3,
      materialId: 'pvc',
      heliumFraction: 0,
      fan: fan(0.8, 15.5, 'plug-flowgrid', 0.3),
      ceilingM: 9,
    },
  },
  {
    id: 'home-60cm',
    name: 'Home test, 60 cm balloon',
    description:
      'A 60 cm latex balloon over a 40 cm pedestal fan with its cage removed: the kitchen-table version of Orbital. It hovers about 1.7 m up while the swirl and turbulence of a raw axial fan keep it moving.',
    design: {
      shapeId: 'orb',
      sizeM: 0.6,
      materialId: 'latex',
      heliumFraction: 0,
      fan: fan(0.4, 4.7, 'axial', 0.45),
      ceilingM: 2.7,
    },
  },
  {
    id: 'halo',
    name: 'Spinning halo',
    description:
      'A 1 m TPU-nylon ring over a raw 55 cm axial fan. It rides just above the end of the jet core while the fan swirl turns it slowly; spin it faster and it resists tipping like a gyroscope.',
    design: {
      shapeId: 'halo',
      sizeM: 1,
      materialId: 'tpu-nylon',
      heliumFraction: 0,
      fan: fan(0.55, 3.85, 'axial', 0.3),
      ceilingM: 4.5,
    },
  },
  {
    id: 'shuttle',
    name: 'Always-upright shuttle',
    description:
      'A 0.9 m Tyvek shuttlecock on carbon ribs with a weighted nose, over a 40 cm straightened axial fan. However it is knocked, it swings back upright.',
    design: {
      shapeId: 'shuttle',
      sizeM: 0.9,
      materialId: 'tyvek',
      heliumFraction: 0,
      fan: fan(0.4, 5.0, 'axial-straightened', 0.3),
      ceilingM: 4,
    },
  },
  {
    id: 'medusa',
    name: 'Medusa, slow drift',
    description:
      'A 1 m silnylon dome with trailing ribbons over a gentle 40 cm plug-fan jet. It parachutes on the air, climbing slowly to about 3.7 m and drifting there.',
    design: {
      shapeId: 'medusa',
      sizeM: 1,
      materialId: 'silnylon',
      heliumFraction: 0,
      fan: fan(0.4, 3.2, 'plug-flowgrid', 0.25),
      ceilingM: 5.5,
    },
  },
  {
    id: 'geode',
    name: 'EPS geode',
    description:
      'A 1 m faceted geodesic ball in thin EPS panels over a 45 cm straightened axial fan. Rigid, bright and matte: every facet is a flat projection plane.',
    design: {
      shapeId: 'geode',
      sizeM: 1,
      materialId: 'eps-shell',
      heliumFraction: 0,
      fan: fan(0.45, 5.5, 'axial-straightened', 0.25),
      ceilingM: 4.5,
    },
  },
  {
    id: 'twin',
    name: 'Twin lobes',
    description:
      'A 0.8 m two-lobed latex form with a little ballast in the lower lobe, over a 50 cm plug fan. It hovers upright but rocks, like a cell about to divide.',
    design: {
      shapeId: 'twin',
      sizeM: 0.8,
      materialId: 'latex',
      heliumFraction: 0,
      fan: fan(0.5, 7.5, 'plug-flowgrid', 0.35),
      ceilingM: 4,
    },
  },
  {
    id: 'ribbon',
    name: 'Mylar ribbon (fails)',
    description:
      'A 1 m Mylar Mobius loop over a gentle 40 cm axial fan. The lopsided push flips it over and throws it out of the jet: the honest failure that shows why Orbital uses a sphere.',
    design: {
      shapeId: 'ribbon',
      sizeM: 1,
      materialId: 'mylar',
      heliumFraction: 0,
      fan: fan(0.4, 1.8, 'axial', 0.35),
      ceilingM: 4,
    },
  },
] satisfies DesignPreset[]);

/**
 * The design shown on first load: the Orbital 3 m sphere, because it is the
 * real installation and the most striking thing to watch lift off.
 */
export const DEFAULT_DESIGN: DesignConfig = {
  ...PRESETS[0].design,
  fan: { ...PRESETS[0].design.fan },
};

/** Private, frozen copy used for defaults so app-side edits cannot leak in. */
const BASE_DEFAULTS: Readonly<DesignConfig> = Object.freeze({
  ...PRESETS[0].design,
  fan: Object.freeze({ ...PRESETS[0].design.fan }),
});

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const SHAPE_BY_ID = new Map<ShapeId, ShapeDefinition>(SHAPES.map((shape) => [shape.id, shape]));
const MATERIAL_BY_ID = new Map<MaterialId, MaterialDefinition>(MATERIALS.map((m) => [m.id, m]));

export function getShape(id: ShapeId): ShapeDefinition {
  const shape = SHAPE_BY_ID.get(id);
  if (!shape) throw new Error(`Unknown shape id: ${String(id)}`);
  return shape;
}

export function getMaterial(id: MaterialId): MaterialDefinition {
  const material = MATERIAL_BY_ID.get(id);
  if (!material) throw new Error(`Unknown material id: ${String(id)}`);
  return material;
}

export function isShapeId(value: unknown): value is ShapeId {
  return typeof value === 'string' && SHAPE_BY_ID.has(value as ShapeId);
}

export function isMaterialId(value: unknown): value is MaterialId {
  return typeof value === 'string' && MATERIAL_BY_ID.has(value as MaterialId);
}

export function isMaterialCompatible(materialId: MaterialId, shapeId: ShapeId): boolean {
  const material = MATERIAL_BY_ID.get(materialId);
  if (!material || !SHAPE_BY_ID.has(shapeId)) return false;
  return material.compatibleShapes === 'all' || material.compatibleShapes.includes(shapeId);
}

/** Materials that can be made into the given shape, in catalogue order. */
export function compatibleMaterials(shapeId: ShapeId): MaterialDefinition[] {
  return MATERIALS.filter((material) => isMaterialCompatible(material.id, shapeId));
}

/**
 * True when the design is a sealed envelope that can hold helium: the shape is
 * inflatable and the skin is an airtight film or coated fabric.
 */
export function canUseHelium(shapeId: ShapeId, materialId: MaterialId): boolean {
  const shape = SHAPE_BY_ID.get(shapeId);
  const material = MATERIAL_BY_ID.get(materialId);
  if (!shape || !material) return false;
  return shape.inflatable && (material.family === 'inflatable film' || material.family === 'coated fabric');
}

/** Height of the shape at rest in units of s, straight from its geometry spec. */
export function unitShapeHeight(spec: ShapeGeometrySpec): number {
  switch (spec.kind) {
    case 'ellipsoid':
      return 2 * spec.radii.y;
    case 'torus':
      return 2 * spec.tubeRadius;
    case 'icosphere':
      return 2 * spec.radius;
    case 'superellipsoid':
      return 2 * spec.radii.y;
    case 'lathe': {
      let min = Infinity;
      let max = -Infinity;
      for (const [, y] of spec.profile) {
        min = Math.min(min, y);
        max = Math.max(max, y);
      }
      return max - min;
    }
    case 'ribbon':
      return spec.width;
    default:
      return 1;
  }
}

function pickNumber(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(isFiniteNumber(value) ? value : fallback, min, max);
}

/**
 * Make any partial or out-of-range design valid: clamps every field to its
 * documented range, swaps an incompatible material for the first compatible
 * one, zeroes helium for shapes or skins that cannot hold it, and raises the
 * ceiling so the body fits. Missing fields come from DEFAULT_DESIGN.
 */
export type DesignInput = Omit<Partial<DesignConfig>, 'fan'> & { fan?: Partial<FanConfig> };

/**
 * Note on the signature: the brief's `Partial<DesignConfig> & { fan?: Partial<FanConfig> }`
 * intersects the two `fan` types, which still demands a complete FanConfig.
 * DesignInput accepts everything that type accepts, plus the partial fan it intends.
 */
export function normaliseDesign(input: DesignInput): DesignConfig {
  const base = BASE_DEFAULTS;
  const source = input ?? {};
  const shapeId: ShapeId = isShapeId(source.shapeId) ? source.shapeId : base.shapeId;
  const sizeM = pickNumber(source.sizeM, base.sizeM, DESIGN_LIMITS.sizeM[0], DESIGN_LIMITS.sizeM[1]);

  let materialId: MaterialId = isMaterialId(source.materialId) ? source.materialId : base.materialId;
  if (!isMaterialCompatible(materialId, shapeId)) {
    const first = compatibleMaterials(shapeId)[0];
    materialId = first ? first.id : base.materialId;
  }

  let heliumFraction = pickNumber(
    source.heliumFraction,
    base.heliumFraction,
    DESIGN_LIMITS.heliumFraction[0],
    DESIGN_LIMITS.heliumFraction[1],
  );
  if (!canUseHelium(shapeId, materialId)) heliumFraction = 0;

  const fanInput: Partial<FanConfig> = source.fan ?? {};
  const fanConfig: FanConfig = {
    diameterM: pickNumber(fanInput.diameterM, base.fan.diameterM, DESIGN_LIMITS.fan.diameterM[0], DESIGN_LIMITS.fan.diameterM[1]),
    outletSpeedMps: pickNumber(
      fanInput.outletSpeedMps,
      base.fan.outletSpeedMps,
      DESIGN_LIMITS.fan.outletSpeedMps[0],
      DESIGN_LIMITS.fan.outletSpeedMps[1],
    ),
    type: FAN_TYPES.includes(fanInput.type as FanType) ? (fanInput.type as FanType) : base.fan.type,
    turbulence: pickNumber(fanInput.turbulence, base.fan.turbulence, DESIGN_LIMITS.fan.turbulence[0], DESIGN_LIMITS.fan.turbulence[1]),
  };

  const bodyHeight = unitShapeHeight(getShape(shapeId).geometry) * sizeM;
  let ceilingM = pickNumber(source.ceilingM, base.ceilingM, DESIGN_LIMITS.ceilingM[0], DESIGN_LIMITS.ceilingM[1]);
  ceilingM = Math.max(ceilingM, bodyHeight + 0.3);

  return { shapeId, sizeM, materialId, heliumFraction, fan: fanConfig, ceilingM };
}
