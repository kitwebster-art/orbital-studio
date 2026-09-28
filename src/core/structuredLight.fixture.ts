/** Contract example result, shared by tests. */
export const SAMPLE_RESULT = {
  method: 'structured-light-gray-code', created_at: '2026-09-24T10:00:00Z', source_uri: 'simulate://synthetic-scene',
  camera: { width: 1024, height: 768 }, projector: { width: 1920, height: 1080 }, decoded_fraction: 0.62,
  ball_camera: { center_px: [512, 380], radius_px: 150, fit_rms_px: 1.1 },
  ball_projector: { center_px: [960, 540], major_px: 420, minor_px: 410, angle_deg: 3 },
  mapping: { kind: 'homography', camera_to_projector: [1, 0, 0, 0, 1, 0, 0, 0, 1], rms_px: 1.4, points: 5231, region: 'ball' },
  estimate3d: { available: true, scale_source: 'measured_baseline_m', frame: 'camera', ball_center_m: [0, 0, 2], ball_diameter_m: 0.62, camera_position_m: [0, 0, 0], projector_position_m: [0.35, 0.02, 0.01], projector_rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], reprojection_rms_px: 2.3, confidence: 'high', notes: [] },
  quality: { verdict: 'GOOD', reasons: [] },
};
