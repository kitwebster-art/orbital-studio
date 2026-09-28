# Projection platform review

Primary-source review, 5 September 2026. These are feature references, not evidence that Orbital matches their performance.

| Reference | Relevant features | Orbital decision |
| --- | --- | --- |
| [TouchDesigner mapping](https://derivative.ca/UserGuide/Projection_Mapping) | 2D mapping/masks and known-model 3D calibration | Separate image alignment, camera geometry and projector calibration. |
| [MadMapper](https://madmapper.com/madmapper/features) | Mesh warp, 3D calibration, structured light, cues, generative materials | Retain the existing sphere shader library; add reusable test profiles and honest calibration import. |
| [Resolume Arena](https://resolume.com/support/en/output-transformation) | Input/output transforms, mesh warps, masks and slice colour correction | Keep composition separate from projector geometry; preserve projector aspect. |
| [Disguise](https://www.disguise.one/en/solutions/projection-mapping) | Previsualisation, physical alignment, tracked objects and dynamic blending | Establish one calibrated projector before expanding the physical rig. |
| [Disguise tracking](https://help.disguise.one/designer/devices/camera-tracking) | Receive smoothing, buffers and diagnostics | Distinguish receipt age, acquisition timing, prediction and display latency. |
| [Disguise tracker delay](https://help.disguise.one/workflows/xr/spatial-tracker-delay) | Timing alignment between video and tracking | Require independently measured compensation, default prediction horizon zero. |

## Dynamic projection research

[VarioLight 2](https://ishikawa-vision.org/mvf/VarioLight2/index-e.html) combines a 500 fps projection system and circumferential sphere markers. Encoded markers recover absolute posture. This is a relevant future route to rotation-locked content; an unmarked sphere silhouette does not reveal material orientation.

[DPM-1000](https://ishikawa-vision.org/vision/hscp/index-e.html) combines 1,000 fps sensing, processing and projection. [DynaFlash v2](https://ishikawa-vision.org/vision/dynaflashv2/index-e.html) reports 947 fps colour projection. Conventional projectors cannot inherit those timings through software optimisation alone.

Engineering calculation: 60 Hz is a 16.67 ms refresh interval, not an end-to-end latency. At 2 m/s, 20 ms uncompensated delay is 40 mm displacement. Prediction must be compared at reversals and acceleration, not only steady motion.

## Infrared

[OptiTrack active markers](https://docs.optitrack.com/v3.3/virtual-reality/active-marker-tracking) use 850 nm in that system. This does not establish the sensitivity of Orbital's camera at either 850 or 940 nm. [Basler image-quality guidance](https://docs.baslerweb.com/optimizing-image-quality) discusses short exposure and image motion; increased gain also increases noise.

Orbital's visible/850/940 nm selection records an illumination and filter profile. Physical emitters, filters and measured sensor response determine the usable wavelength. SDK readbacks establish applied camera settings; they do not establish illumination suitability or photobiological safety.

## Scope and deferred work

Implement first: acknowledged devices, calibration validation, world geometry provenance, stale-output blackout, timing distributions, independent session records and one-camera physical procedure. Existing curated sphere-space compositions remain available.

Still requires physical evidence or a later hardware-specific implementation: automatic projected-pattern capture, surface orientation markers, multi-camera reconstruction, nonlinear balloon deformation calibration, production multi-projector blending, independently measured exposure-to-photon timing and validated venue illumination.
