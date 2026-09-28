/**
 * Orbital Levitation Lab: shared model contract.
 *
 * Pure TypeScript. Nothing under src/levitation/model may import three.js or
 * touch the DOM, so the physics can be unit-tested and reused by the scene.
 *
 * Coordinates: metres, seconds, newtons. World Y is up. The fan outlet is a
 * horizontal disc centred on the origin at y = 0, blowing up +Y. Body axes:
 * body +Y is the shape's "up" (its symmetry axis at rest).
 *
 * This is a reduced-order model for exploring ideas, not CFD. Every number the
 * UI shows must be presentable as an estimate. The Guide page says so.
 */

export interface Vec3 { x: number; y: number; z: number }
/** Unit quaternion, body-to-world rotation. */
export interface Quat { x: number; y: number; z: number; w: number }

// ---------------------------------------------------------------------------
// Catalogue identifiers
// ---------------------------------------------------------------------------

export type ShapeId =
  | 'orb'      // sphere, the Orbital baseline
  | 'lens'     // oblate spheroid
  | 'seed'     // upright prolate spheroid with a weighted base
  | 'halo'     // torus lying flat; air can pass through the hole
  | 'geode'    // faceted icosphere (flat facets as projection planes)
  | 'pebble'   // superellipsoid, a softly rounded cube
  | 'shuttle'  // shuttlecock: weighted rounded nose below, light flared skirt above
  | 'medusa'   // jellyfish dome, concave side down, hanging keel weight and ribbons
  | 'twin'     // vertical peanut, two fused lobes ("mitosis")
  | 'ribbon';  // Mobius ribbon loop: the deliberately unstable one

export type MaterialId =
  | 'latex'        // balloon latex, stretched
  | 'pvc'          // 0.18 mm matte PVC film (Orbital 3 m sphere reference)
  | 'tpu-nylon'    // 20D TPU-coated ripstop nylon, sewn inflatable
  | 'silnylon'     // 30D silicone-coated spinnaker nylon
  | 'tyvek'        // Tyvek-style HDPE nonwoven, matte white
  | 'washi-carbon' // kite washi paper on a carbon-rod frame
  | 'mylar'        // metallised BoPET film: very light, but a mirror
  | 'eps-shell';   // thin expanded-polystyrene shell, rigid

export type FanType = 'axial' | 'axial-straightened' | 'plug-flowgrid';

// ---------------------------------------------------------------------------
// Geometry (single source of truth for physics AND rendering)
// ---------------------------------------------------------------------------

/**
 * Proportions are in units of the design size s (metres), where s is the
 * shape's largest horizontal extent at rest. buildShapeMesh() must honour
 * these so the physics (areas, volume, inertia computed from the same mesh)
 * and the rendered mesh always agree.
 */
export type ShapeGeometrySpec =
  | { kind: 'ellipsoid'; radii: Vec3 }                        // orb, lens, seed
  | { kind: 'torus'; majorRadius: number; tubeRadius: number } // halo, axis = body Y
  | { kind: 'icosphere'; radius: number; detail: number }      // geode, flat facets
  | { kind: 'superellipsoid'; radii: Vec3; e1: number; e2: number } // pebble
  | { kind: 'lathe'; profile: Array<[number, number]>; closed: boolean } // shuttle, medusa, twin: [radius, height] from bottom to top
  | { kind: 'ribbon'; radius: number; width: number; twists: number };  // ribbon (Mobius when twists = 1)

export interface ShapeMesh {
  /** xyz triples in metres, body frame, centred on the geometric centre. */
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Render facets flat (geode) rather than smooth. */
  flatShading: boolean;
  /** Optional decorative polylines in body frame (medusa ribbons), xyz triples per line. */
  strands?: Float32Array[];
  /** Double-sided surfaces (skirt, dome, ribbon) must render both faces. */
  doubleSided: boolean;
}

export interface ShapeDefinition {
  id: ShapeId;
  name: string;           // short display name, e.g. "Halo"
  tagline: string;        // one line, e.g. "A spinning ring the jet threads through"
  description: string;    // two or three plain sentences for the shape card
  geometry: ShapeGeometrySpec;
  /** Can be made as a sealed, inflated envelope. */
  inflatable: boolean;
  /** Aerodynamics. Cd values are for the body upright (axial) and on its side. */
  cdAxial: number;
  cdSide: number;
  /** Smooth rounded bodies lose drag in the supercritical Reynolds regime. */
  dragCrisis: boolean;
  /** Force factor kappa when the body is much wider than the jet (jet fully turned). */
  impingementCoeff: number;
  /** Fraction of a centred, narrow jet that passes straight through an opening (halo hole). */
  throughFlowFraction: number;
  /** Strength of Coanda / pressure-gradient self-centering, 0..1. */
  coandaCoeff: number;
  /** Strouhal number for vortex shedding, typically 0.15 to 0.25. */
  strouhal: number;
  /** Fluctuating side-force amplitude coefficient from shedding. */
  sheddingLiftCoeff: number;
  /** Side force per unit tilt for flat or plate-like bodies (causes gliding off-axis). */
  tiltLiftSlope: number;
  /** Centre of pressure above the geometric centre, fraction of s (+ is up). */
  cpOffset: number;
  /** Centre of mass above the geometric centre including built-in ballast, fraction of s. */
  cmOffset: number;
  /** Built-in ballast mass as a fraction of the shell mass (weighted nose, keel). */
  ballastFraction: number;
  /** Added-mass coefficient for translation (sphere 0.5). */
  addedMassCoeff: number;
  /** How strongly the fan's swirl spins the body about its axis, 0..1. */
  swirlCoupling: number;
  /** 0..1 continuity of the surface for projection (smooth curvature is best). */
  smoothness: number;
  /** 0..1 silhouette convexity; convex silhouettes track most reliably. */
  convexity: number;
  projectionNotes: string;
  trackingNotes: string;
  fabricationNotes: string;
}

export interface MaterialDefinition {
  id: MaterialId;
  name: string;
  family: 'inflatable film' | 'coated fabric' | 'nonwoven' | 'paper on frame' | 'rigid foam';
  /** Areal density of the skin in grams per square metre. */
  arealDensityGsm: number;
  /** Multiplier for seams, valves, tapes and frames (1.0 = none). */
  overheadFactor: number;
  /** Diffuse visible reflectance 0..1 (matte white ~0.85). */
  reflectance: number;
  /** Specular gloss 0..1; high gloss sends projector light away from the audience. */
  gloss: number;
  /** Visible transmission 0..1; Orbital prefers low so the far side stays dark. */
  translucency: number;
  /** Reflectance at 850 nm for near-infrared camera tracking, 0..1. */
  nir850: number;
  /** 0..1 how much it stretches and wobbles (latex high, EPS zero). */
  elasticity: number;
  /** Shapes this material can realistically be made into. */
  compatibleShapes: ShapeId[] | 'all';
  /** Rendering hints for the Material view. */
  swatch: { color: string; roughness: number; metalness: number; transmission: number; sheen: number };
  projectionNotes: string;
  fabricationNotes: string;
}

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

export interface FanConfig {
  /** Fan outlet (blade) diameter in metres, 0.2 to 2.0. */
  diameterM: number;
  /** Mean air speed at the outlet in m/s, 0.5 to 30. */
  outletSpeedMps: number;
  type: FanType;
  /** User turbulence scale 0..1 on top of the fan type's baseline. */
  turbulence: number;
}

export interface DesignConfig {
  shapeId: ShapeId;
  /** Largest horizontal extent at rest, metres, 0.1 to 5. */
  sizeM: number;
  materialId: MaterialId;
  /** Fraction of the enclosed gas that is helium, 0..1 (inflatables only; ignored otherwise). */
  heliumFraction: number;
  fan: FanConfig;
  /** Room ceiling height above the outlet, metres. */
  ceilingM: number;
}

export interface DesignPreset {
  id: string;
  name: string;
  description: string;
  design: DesignConfig;
}

// ---------------------------------------------------------------------------
// Derived quantities
// ---------------------------------------------------------------------------

export interface FanDerived {
  outletAreaM2: number;
  flowM3s: number;
  /** Jet momentum flux rho * Q * U0, the most force a fully turned jet can give. */
  momentumFluxN: number;
  airPowerW: number;
  /** Estimated electrical power at a typical fan efficiency. */
  electricalPowerW: number;
  /** Rough axial-fan rotational speed from a typical tip-speed ratio. */
  approxRpm: number;
  coreLengthM: number;
  swirlRatio: number;
  turbulenceIntensity: number;
}

export interface ShapeProperties {
  surfaceAreaM2: number;
  volumeM3: number;
  frontalAreaAxialM2: number;
  frontalAreaSideM2: number;
  heightM: number;
  shellMassKg: number;
  ballastMassKg: number;
  /** Shell plus ballast. */
  massKg: number;
  enclosedGasKg: number;
  /** Shell + ballast + enclosed gas + added air mass: what the jet must accelerate. */
  inertialMassKg: number;
  buoyancyN: number;
  /** Weight the jet must hold up: shell + ballast + gas weight - buoyancy. */
  netWeightN: number;
  /** Principal moments of inertia about body X, Y, Z through the centre of mass. */
  inertiaBody: Vec3;
  cpOffsetM: number;
  cmOffsetM: number;
  /** Radius of the equivalent frontal disc, sqrt(A_axial / pi). */
  footprintRadiusM: number;
}

export type Verdict =
  | 'stable-hover'
  | 'wobbly-hover'
  | 'too-heavy'
  | 'blown-to-ceiling'
  | 'unstable-tumble'
  | 'escapes-jet'
  | 'buoyant';

export type FlowRegime = 'laminar' | 'subcritical' | 'transitional' | 'supercritical';

export interface DesignAnalysis {
  verdict: Verdict;
  /** Short label for the verdict chip, e.g. "Hovers steadily". */
  verdictLabel: string;
  /** One plain sentence, e.g. "Hovers at 1.9 m with a gentle 0.6 Hz sway." */
  summary: string;
  /** 0..100 overall levitation quality. */
  score: number;
  equilibriumHeightM: number | null;
  /** Jet force available just above the outlet divided by net weight. */
  liftMargin: number;
  /** Lowest outlet speed that lifts the design off the fan, m/s (null if never). */
  minimumOutletSpeedMps: number | null;
  terminalVelocityMps: number;
  reynoldsAtHover: number | null;
  regime: FlowRegime | null;
  verticalHz: number | null;
  swayHz: number | null;
  sheddingHz: number | null;
  /** Expected RMS sideways wander at hover, metres. */
  swayAmplitudeM: number | null;
  tiltStability: 'stable' | 'neutral' | 'unstable';
  projectionScore: number;
  trackingScore: number;
  /** Plain-language reasons behind the verdict and scores. */
  reasons: string[];
  fan: FanDerived;
  properties: ShapeProperties;
}

export interface EnvelopeCell { verdict: Verdict; score: number }
export interface LevitationEnvelope {
  speedsMps: number[];
  sizesM: number[];
  /** cells[sizeIndex][speedIndex] */
  cells: EnvelopeCell[][];
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export type SimStatus =
  | 'hovering'      // inside the jet, held up, not tumbling
  | 'rising'
  | 'falling'
  | 'tumbling'      // turning over end to end rather than holding an attitude
  | 'on-fan'
  | 'at-ceiling'
  | 'escaped'       // well outside the jet, whatever its speed
  | 'buoyant-drift';

export interface ForceBreakdown {
  weight: Vec3;
  buoyancy: Vec3;
  /** Jet drag / impingement force. */
  jet: Vec3;
  /** Coanda self-centering. */
  centering: Vec3;
  /** Vortex shedding side force. */
  shedding: Vec3;
  /** Turbulent buffeting. */
  turbulence: Vec3;
  total: Vec3;
}

export interface SimState {
  timeS: number;
  /** Geometric centre in world metres. */
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
  /** World-frame angular velocity, rad/s. */
  angularVelocity: Vec3;
  forces: ForceBreakdown;
  status: SimStatus;
  /** Air speed the body effectively feels, m/s. */
  effectiveSpeedMps: number;
  heightM: number;
  lateralOffsetM: number;
  tiltDeg: number;
  spinRps: number;
  /** Visual squash 0..0.25 along the flow axis from dynamic pressure (elastic skins only). */
  squash: number;
  /** Visual membrane wobble 0..1 for elastic skins. */
  wobble: number;
}

export interface VirtualCamera {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  verticalFovDeg: number;
  widthPx: number;
  heightPx: number;
}

/** The part of orbital.tracking-state/1.0 geometry a single camera measures. */
export interface TrackedEllipse {
  centerPx: [number, number];
  centerNorm: [number, number];
  /** Full diameters in pixels, like the tracker's major_diameter_px. */
  majorPx: number;
  minorPx: number;
  angleDeg: number;
  areaPx: number;
}

export interface ProjectionPose {
  position: Vec3;
  orientation: Quat;
  /** Distance between where the projection is drawn and where the body really is, metres. */
  errorM: number;
}
