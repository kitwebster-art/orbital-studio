# Verification record, 5 September 2026

## Delivered software

- Dedicated local Test bench, with real native camera-control acknowledgements and capability readbacks.
- Visible/850/940 nm metadata profiles; optional SDK-unit gain; validated saved profiles.
- Validated one-to-five-head measured calibration imports, per-head residual gates, known-radius camera geometry and conservative clock-synchronised freshness checks.
- Corrected projector warp depth, raster aspect, lens-shift mask and live sphere scale/deformation behaviour.
- Blackout covers normal, frozen and projector-pattern windows. Freeze is unavailable for live tracking output.
- Source-qualified P50/P95/P99 software diagnostics, bounded recording and session exports with starting configuration/calibration/shader state. No physical latency is invented.
- Offline camera calibration from measured observations, independent held-out validation and an evidence hash.
- Native renderer fail-closed startup, expiry and reconnection.

## Verification

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Studio Vitest | 169 passed | Includes clock delay, partial calibration, geometry, warp and control lifecycle |
| TypeScript and Vite build | Passed | Build still reports the existing large bundled renderer warning |
| Python tracker | 37 passed | SDK lifecycle tested with controlled fixtures; real socket protocol exercised |
| Optional OpenCV calibration tests | 10 passed | Agent used temporary OpenCV 5.0.0.93/numpy 2.0.2; synthetic ground-truth and invalid observations. Environment removed after testing. Default Python run skips these 10 without optional dependencies. |
| Rust native tests | 28 passed | Current macOS run; other host clock paths not executed |
| Native GPU blackout | 720,000 pixels exactly black | Apple M4/Metal offscreen, unavailable source |
| Headless browser | 15 regression checks passed; zero page errors | Isolated profile, no visible browser takeover |
| Actual HuaTeng SDK discovery | No devices returned | Physical capture, infrared response and projector alignment not tested |

Browser regression covers: visible simulation raster after explicit release; frozen blackout; pattern initial blackout/release/B shortcut; malformed calibration rejection; profile persistence; blackout on reload; local bridge source labels; immutable record export; absent simulated processing statistics; acquisition stop/restart gates; three compositions; desktop and compact layout. Pixel checks examine actual rendered surfaces.

A short simulated browser session observed roughly 16.7 ms median cadence. This is a scheduling observation, not a performance guarantee, camera latency or projector refresh measurement. No ten-minute physical run has been completed by this update.

The local Vite service was restarted after an outdated dependency-cache error, then verified in the actual browser. Existing unrelated workspace changes were preserved. No public deployment or procurement occurred.

## Reproduce

- Studio: `npm run check`.
- Tracker: `PYTHONPATH=src python3 -m unittest discover -s tests -v`.
- Offline calibration: install `tools/calibration-requirements.txt` in a temporary environment and run its documented tests.
- Browser: start a simulated control bridge on port 8766, retain local Studio port 4178 (permitted Origin), then run `scripts/verify-test-bench.cjs`. Set `ORBITAL_PLAYWRIGHT_MODULE`, `ORBITAL_SHARP_MODULE` and `ORBITAL_TEST_OUTPUT` to available dependency modules and a task scratch directory. `ORBITAL_BROWSER_EXECUTABLE` is optional; it defaults to the installed macOS Chrome binary with a separate headless profile. The test does not open physical hardware.

## Outstanding physical gates

Camera connection and SDK discovery; measured camera/projector observations; full working-volume alignment; short-exposure visible/850/940 nm comparison; motion-to-photon and boundary error across speeds/reversals; ten-minute sustained acquisition. Native Engine's own world mapping is still a preview. Studio's calibrated monocular path is restricted to a near-axis, known-radius sphere. Arbitrary balloon deformation, material orientation and production multi-camera/multi-projector validation are not complete.

## Small-ball setup follow-up

Added a saved 50 cm starter rig with editable diameter, ball centre, independent projector/camera lens positions, planning FOVs and requested output raster. The overview fits all three objects and labels P1/C1. Simulation uses the actual selected diameter and centre. Applying a different layout clears measured alignment, closes old output windows and restores blackout.

Headless browser verification passed: default 50 cm; independent equipment positions; 70 cm profile persistence; unapplied-edit gate; invalid diameter and intersecting lens rejection; reset; actual 1920 × 1080 output canvas; output closure when layout changes; zero page errors. Overview screenshot inspected. Run `scripts/verify-small-test-rig.cjs` with `ORBITAL_PLAYWRIGHT_MODULE` and `ORBITAL_TEST_OUTPUT` as above.

Kit reports the ball, camera and projector are now available. The reported projector name “Optima 4060” remains unconfirmed; no manufacturer specifications have been assumed. Fresh SDK discovery again returned no devices. Physical capture, optical calibration and real moving-ball projection remain unverified.

The full 15-check Test bench browser regression was repeated after the small-rig update and passed with zero page errors, using a temporary simulated bridge on port 8766. The temporary bridge was stopped after testing.
