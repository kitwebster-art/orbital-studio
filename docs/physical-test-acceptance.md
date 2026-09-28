# Orbital physical test acceptance

Implementation specification, 5 September 2026. This is an engineering record, not a physical validation certificate.

Baseline: 142 Studio tests pass and production build succeeds. Existing Studio, tracker and native engine contain substantial uncommitted work; preserve it.

## Required software gates

- Real bridge controls report success only after acknowledged acquisition/configuration. Unsupported controls return errors.
- Visible, 850 nm and 940 nm profiles describe actual illumination/filter requirements; software never claims to switch an unconnected emitter.
- Live, simulated and replay data remain distinguishable. Uncalibrated image coordinates cannot authorise physical world projection.
- Blackout clears every projector raster. Lost, disconnected or expired physical tracking fails closed.
- Calibration imports reject non-finite geometry, invalid identities and malformed transforms. Simulated solves remain explicitly simulated.
- Software cadence, processing and source receipt age have separate statistics; physical motion-to-photon stays unmeasured until observations are entered.
- Session profiles validate before restoration. Recording/export retains configuration and evidence provenance.
- Headless browser validation covers actual operator controls, output windows, disconnect/reconnect and console errors.

## Physical gates

Use one camera, one projector and a measured sphere first. Record camera/optics/filter/illuminator, exposure, gain, ROI, confirmed projector signal and known sphere radius. Calibrate intrinsics, distortion and camera/projector poses in one coordinate system. Verify stationary residuals across the image and working depth before motion.

Measure latency with an independent high-speed recording or suitable sensor method covering exposure-to-projected-light, documenting sampling uncertainty. Measure projected boundary error in millimetres and projector pixels for stationary, steady motion, reversals, occlusion and reacquisition. Record target speed and distance for every comparison. Compare prediction disabled with measured horizons.

Targets must be selected from baseline and artwork tolerance, not asserted from simulated benchmarks. Run for at least ten minutes and report P50/P95/P99, maximum frame gap, drops, confidence loss and reacquisition time. Repeat under intended visible/projector/NIR lighting. No physical pass is implied by unit tests, imported calibration or a browser preview.
