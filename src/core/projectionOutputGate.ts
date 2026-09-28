import type { WorldState } from './contracts';
import type { ProjectionRigConfig } from './projectionRig';
/**
 * Structured-light 2D mapping mode. When active, a qualifying scan (GOOD/USABLE,
 * homography rms <= 3 px) replaces both the monocular camera geometry and the
 * measured projector calibration requirements. Provenance is `structured-light`.
 */
export interface StructuredLightGateInput { active: boolean; qualifies: boolean }
export type OutputCalibrationProvenance = 'measured' | 'structured-light' | null;
export function outputCalibrationProvenance(scan: StructuredLightGateInput | null | undefined): OutputCalibrationProvenance {
  return scan?.active ? (scan.qualifies ? 'structured-light' : null) : 'measured';
}
export function projectionOutputBlockReason(blackout: boolean, world: WorldState | null, rig: ProjectionRigConfig, projectorIndex = 0, scan: StructuredLightGateInput | null = null): string | null {
  if (blackout) return 'OPERATOR_BLACKOUT';
  if (!world) return 'WAITING_FOR_TRACKING';
  if (world.mode !== 'live') return null;
  if (!world.stateValid || !world.measurementValid || world.status !== 'tracking' || world.confidence < 0.7 || world.diagnostics.sourceAgeMs > 80) return 'LIVE_TRACKING_NOT_READY';
  if (!world.diagnostics.flags.includes('HUATENG_HT_GE134GM_T1P_C')) return 'PHYSICAL_SOURCE_REQUIRED';
  if (!world.diagnostics.flags.includes('SYNCHRONISED_SOURCE_CLOCK')) return 'PHYSICAL_CLOCK_SYNC_REQUIRED';
  if (scan?.active) return scan.qualifies ? null : 'STRUCTURED_LIGHT_SCAN_NOT_USABLE';
  if (!world.diagnostics.flags.includes('CALIBRATED_MONOCULAR_SPHERE_APPROXIMATION')) return 'CALIBRATED_WORLD_GEOMETRY_REQUIRED';
  if (rig.calibration.state !== 'calibrated') return 'MEASURED_PROJECTOR_CALIBRATION_REQUIRED';
  if (!rig.calibration.calibratedProjectorIds?.includes(rig.projectors[projectorIndex]?.id)) return 'SELECTED_PROJECTOR_NOT_CALIBRATED';
  const error = rig.calibration.projectorErrorsPx?.[rig.projectors[projectorIndex]?.id] ?? rig.calibration.reprojectionErrorPx;
  if (error === null || !Number.isFinite(error) || error > 2) return 'PROJECTOR_REPROJECTION_ERROR_EXCEEDS_2PX';
  return null;
}

const BLOCK_REASON_TEXT: Readonly<Record<string, string>> = Object.freeze({
  OPERATOR_BLACKOUT: 'operator blackout is active',
  WAITING_FOR_TRACKING: 'waiting for the first tracking frame',
  LIVE_TRACKING_NOT_READY: 'live tracking is not valid, confident and fresh',
  LIVE_TRACKING_EXPIRED: 'live tracking frame is older than 80 ms',
  PHYSICAL_SOURCE_REQUIRED: 'a physical HuaTeng camera source is required',
  PHYSICAL_CLOCK_SYNC_REQUIRED: 'the camera source clock is not synchronised',
  CALIBRATED_WORLD_GEOMETRY_REQUIRED: 'camera geometry calibration has not been imported',
  MEASURED_PROJECTOR_CALIBRATION_REQUIRED: 'measured projector calibration has not been imported',
  SELECTED_PROJECTOR_NOT_CALIBRATED: 'this projector is not in the imported calibration',
  PROJECTOR_REPROJECTION_ERROR_EXCEEDS_2PX: 'projector calibration error exceeds 2 px',
  STRUCTURED_LIGHT_SCAN_NOT_USABLE: 'the structured-light scan is not rated good or usable, or its outline mapping error is above 4 px or 1.2% of the ball width',
  STRUCTURED_LIGHT_NO_ELLIPSE: 'no tracked ball outline is available for the structured-light mapping',
  PROJECTOR_WINDOW_CHANGED_SINCE_SCAN: 'the projector window changed size or position since the scan: put it back in full screen or scan again',
  PROJECTOR_DISABLED: 'this projector head is disabled in the rig',
});
/** Human-readable text for an output block code. Unknown codes are lower-cased rather than hidden. */
export function describeOutputBlockReason(code: string | null | undefined): string | null {
  if (!code) return null;
  return BLOCK_REASON_TEXT[code] ?? code.toLowerCase().replace(/_/g, ' ');
}
