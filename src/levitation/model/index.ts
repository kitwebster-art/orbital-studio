/**
 * Orbital Levitation Lab model: public API.
 *
 * Pure TypeScript (no three.js, no DOM). The app imports everything from here.
 * Every number it produces is a reduced-order estimate, not CFD.
 */

export * from './types';

// Catalogue
export {
  SHAPES,
  MATERIALS,
  PRESETS,
  DEFAULT_DESIGN,
  DESIGN_LIMITS,
  FAN_TYPES,
  getShape,
  getMaterial,
  isMaterialCompatible,
  compatibleMaterials,
  canUseHelium,
  normaliseDesign,
} from './catalogue';
export type { DesignInput } from './catalogue';

// Geometry
export { buildShapeMesh } from './geometry';
export type { MeshDetail } from './geometry';

// Jet
export {
  FAN_TYPE_DATA,
  fanDerived,
  jetCentrelineSpeed,
  jetHalfWidth,
  jetMomentumFlux,
  sampleJet,
} from './jet';

// Physics
export { shapeProperties } from './aero';
export { analyseDesign, levitationEnvelope } from './analysis';
export { LevitationSimulation, SUBSTEP_S } from './simulation';
export type { ResetOptions } from './simulation';
export { StateHistory } from './history';

// Tracking and projection
export { projectionPose, observeSilhouette, transformPoints, MAX_PREDICTION_TRAVEL_M } from './tracking';

// Math helpers
export {
  RHO_AIR,
  RHO_HELIUM,
  GRAVITY,
  NU_AIR,
  clamp,
  lerp,
  smoothstep,
  vec3,
  v3add,
  v3sub,
  v3scale,
  v3addScaled,
  v3dot,
  v3cross,
  v3length,
  v3distance,
  v3normalize,
  v3lerp,
  v3copy,
  quatIdentity,
  quatMultiply,
  quatConjugate,
  quatNormalize,
  quatFromAxisAngle,
  quatFromTilt,
  quatRotate,
  quatRotateInverse,
  quatUp,
  quatIntegrate,
  slerp,
  eulerTilt,
} from './math';
