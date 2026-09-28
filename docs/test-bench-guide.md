# Physical test bench

Local application: http://127.0.0.1:4178 . Run `npm run dev` from Orbital Studio if the local service is not already running. This update is local; public hosting is separate.

Start the controllable bridge in a terminal with `./scripts/serve-test-bridge.sh`. It starts simulated acquisition, labelled as such, on 127.0.0.1:8765. Control commands accept the local Studio origin. Stop it with Ctrl-C when finished. Python 3 and the tracker's declared dependencies are required; the HuaTeng SDK is required for physical acquisition.

## Small-ball setup

The Test bench starts with a 50 cm diameter ball, one camera and one projector.
Measure the actual inflated diameter and enter it in centimetres. Positions use
metres from one shared floor reference: X right, Y up, Z towards the equipment.
Enter the lens positions independently; the layout assumes both devices aim at
the ball centre. The starter positions (2 m in front, 1 m high) are editable
examples, not measured room dimensions or an Optoma throw recommendation.

Apply layout saves the ball size, positions, optics and raster, blacks out output
and clears camera/projector alignment. It closes an open projector window only
when the requested raster changes; otherwise the window stays open and simply
goes black until blackout is released. Profiles export and restore the layout.
Pending edits cannot silently become a measurement.

Live nudge buttons under Apply layout move the projector lens (±1 cm, ±10 cm on
each axis), the ball centre (±1 cm) and the projector vertical FOV (±0.25°, ±1°).
A nudge applies immediately in simulation, keeps the output window open and
does not black out, so the grid can be walked onto the physical ball while
watching the projector. It still clears any imported camera or projector
calibration, because the measured pose no longer matches; re-import before
live projection. Nudges are saved into the local profile.

Fit FOV from measurement: aim the projector square at a flat wall, measure the
lens-to-wall distance and the full projected image height in metres, and press
Write vertical FOV. The field is set to 2 · atan(h / 2d). Apply layout or use
the FOV nudges to take it into the scene. Keep the projector zoom fixed after
measuring.

While the Test bench is the active workspace, or any projector window is open,
the control page drops to a light preview: the digital twin redraws at about
5 fps, the five mapping-lab tiles stop updating, and render quality is pinned
to Low. Normal behaviour returns when you leave the Test bench and close the
output windows. While a projector window is open, its own animation frame
is the single clock for the whole runtime (the control page takes over only if
that window stops drawing), and control-page readouts refresh at about 10 Hz.
The Test bench also hides the show transport, mapping-lab
tiles and Looks-only controls; the 3D viewport stays visible.
The stationary synthetic target supports basic focus/framing tests before live
tracking. Physical live projection still requires valid measured calibration.

The default output is 1920 × 1080 landscape at a requested 60 Hz. Confirm the
actual accepted HDMI mode in the projector menu. The reported “Optima 4060”
model is unconfirmed, so no model-specific lens or mounting assumptions are
applied. FOV values are editable planning values. Do not rotate the projector
onto its side based on the older installation workflow.

Imported camera optics and pose use the current entered ball diameter for
known-radius reconstruction. Reuse intrinsics only with unchanged camera optics
and raster; verify/re-solve the pose after moving the camera. Moving the projector
requires its alignment to be re-established. The manually entered positions
alone do not prove either calibration.

What is reachable today: live camera-driven projection stays blocked until
both a camera geometry file and a measured projector calibration file exist,
and neither tool is finished. The projector window and the Test bench readiness
line say so in words ("Live output blocked: ..."). The realistic first test is
therefore the simulation-mode alignment grid on a stationary balloon, adjusted
with the nudges, plus a separate tracking recording from the camera bridge.
Those two results are collected independently and compared afterwards.

Start with the ball stationary. Confirm the grid sits on the sphere, the image
is in focus and B blanks the actual projector. Then connect the camera, verify
source identity and a clean silhouette, import measured alignment and begin
slow motion. Increase speed only after measuring alignment at several positions.

## One-camera workflow

1. Open Test bench. Projector output starts black. Connect controls, then Discover devices.
2. Stop acquisition. Select visible, 850 nm or 940 nm to document the actual optical arrangement. Fit the corresponding physical light/filter yourself. The dropdown does not change an emitter.
3. Enter the camera raster, frame rate and exposure. Leave analogue gain blank to preserve the SDK setting; its units are not dB. Apply while stopped, then Start HuaTeng. Read the acknowledged settings/capabilities. Unsupported values are rejected.
4. Select Use bridge tracking. A connected socket with simulated frames is still simulated evidence. Live physical output requires the HuaTeng source, synchronised source timing and valid calibrated geometry.
5. Import camera geometry JSON and measured projector calibration JSON. Both must use the same world coordinate system. The camera model currently supports a known-radius near-axis sphere, not arbitrary deforming balloons. Lost, clipped, stale or low-confidence observations suppress live projection.
6. Open P1 output. Move it to the intended display, select the correct raster and use Full screen. Confirm the accepted signal on the projector. Release blackout deliberately. B blacks out both live output and projector pattern windows, including frozen output. This is a software display control, not a hardware emergency isolator.
7. Begin with the grid composition, then compare marble and contour visuals. The Looks workspace retains the full deterministic shader library and controls. Keep prediction at zero until an independent physical measurement supports a compensation horizon.
8. Start measurement, run the test, Stop measurement and export session JSON. The record retains starting settings and provenance. Processing is recorded only when reported by the physical source. Physical latency and mapping error remain unmeasured in this software export.

The projector pattern workspace provides grids, focus marks, colour fields and frame-counted timing flashes. Global blackout also covers its output window. The legacy Projection wizard generates simulated calibration examples; it does not capture structured light. Use Test bench step 4 for the real structured-light scan. The Tracking workspace's older virtual camera controls remain rehearsal-only. Use Test bench for real bridge controls.

## Scan and calibrate (structured light)

Test bench step 4 measures where the projector lands on the ball using the
camera, instead of hand-entered positions. The projector shows black, white and
Gray-code stripe patterns; the bridge photographs each one, decodes which
projector pixel lights each camera pixel, and returns a mapping. Camera images
never reach the browser. The shared message contract is
`../orbital-tracker/docs/STRUCTURED_LIGHT_CALIBRATION_CONTRACT.md`.

1. Hold the ball completely still and darken the room.
2. Connect controls (step 2) and start the camera: Start HuaTeng for the real
   rig. To rehearse with a synthetic camera, run the tracker launcher in
   `rehearse` mode, which starts the simulated bridge.
3. Open P1 output, move it to the projector and press Full screen. It must stay
   open for the whole scan. Patterns are drawn over blackout in exactly the same
   box and pixel grid as the live output, so any window scaling applies equally
   to both; in full screen at the projector's native resolution this is one
   canvas pixel per projector pixel. The window's on-screen layout is recorded
   with the scan.
4. Enter two tape measurements: the distance between the camera lens and the
   projector lens, and the ball diameter (circumference divided by 3.14), both
   in metres. Either one gives the 3D estimate a real scale. With both, the
   scan also works out the true camera and projector lenses and can rate the
   layout high confidence; with one, it is capped at medium because the two
   lenses trade off. Leave the camera lens at 6 mm unless it differs.
5. Press Start scan. The progress bar follows the patterns. Cancel stops it on
   both sides. If no next pattern arrives within 3 s the scan fails safely.
   Every end state (result, error, cancel) removes the pattern and blacks out.
6. Read the result card: verdict (GOOD, USABLE or POOR), decoded coverage,
   estimated ball diameter, ball distance, projector offset from the camera,
   outline mapping error against its limit, the projector lens (field of view
   and lens-axis height, found by the scan or as entered), the camera lens, the
   3D layout confidence and notes.

Use scanned ball size and positions writes the estimated diameter, ball centre,
projector lens position and (when the scan found it) projector FOV into step 1
as pending edits, relative to the camera position already entered there and
assuming the camera faces the ball horizontally. It is disabled for a
low-confidence estimate. Check the numbers, then press Apply layout.

Use scan for live projection switches P1 to a 2D mapping: the tracked ball
outline in the camera is mapped through the scan homography (centre) and its
local Jacobian (size and squash), and the output draws the sphere so its
silhouette matches that ellipse in projector pixels. It is exact only at the
depth where the ball was scanned and degrades as the ball moves towards or away
from the camera; the Test bench shows this note while the mode is on. It is
available for GOOD or USABLE scans whose outline mapping error is within
max(4 px, 1.2% of the projected ball diameter), the same limit the bridge uses
for its verdict.
In this mode the scan stands in for the camera geometry file and the projector
calibration file, and is labelled `structured-light`, never `measured`. Live
output still requires the physical HuaTeng source and synchronised clock. In
simulation the output rehearses using the scanned ball outline. Apply layout
keeps the mode on, because the scan measured the physical equipment rather than
the typed numbers; a nudge switches it off. If the P1 window leaves full
screen, moves or resizes after the scan, output blacks out with the reason
"the projector window changed since the scan": put it back or scan again.
Re-scan after physically moving the camera, projector or ball stand. The last
scan is kept in this browser and restored on reload.

## Calibration requirements

`orbital.monocular-calibration/1.0` requires image dimensions, fx/fy/cx/cy, Brown distortion [k1,k2,p1,p2,k3], a proper row-major camera-to-world rotation, translation in metres, measured sphere radius and tolerances. Camera coordinates are x right, y down, z forward. See `src/core/monocularCalibration.ts` for the validated contract. Distortion inversion tolerance is not a physical projection-accuracy measurement.

`orbital.projection-calibration/1.0` records measured projector camera poses, lens shift, four warp corners and blend settings. Import validates IDs and geometry. A measured file can contain one to five projector records; only imported measured heads can enable physical output. A simulated dataset never grants measured status. Projector calibration must be independently obtained and checked; do not relabel a rehearsal export as measured. The output gate currently requires selected-head maximum calibration error at or below 2 px, an initial software threshold that does not replace held-out physical error checks.

See `physical-test-acceptance.md` for the measurement protocol and `platform-comparison-2026-09-05.md` for researched design references.

## Limits

Browser cadence is not projector refresh confirmation. Synchronising host/browser clocks bounds source staleness but cannot establish true camera exposure time or light output timing. The HuaTeng camera timestamp origin is estimated against host reception. Native Engine now fails closed for unavailable live input, but its own 2D-to-world mapping remains an uncalibrated preview; use Studio's calibrated test path for the restricted known-radius experiment.

World-class fast-motion performance remains a physical validation target. No current software test establishes venue accuracy, infrared suitability, rotation tracking, multi-camera fusion, multi-projector calibration or motion-to-photon latency.

Camera calibration tooling and measured-observation format: `../orbital-tracker/docs/STAGE_A_OFFLINE_CALIBRATION.md`. The offline solver uses independent validation observations and exports the camera JSON accepted here.
