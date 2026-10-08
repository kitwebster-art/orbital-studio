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

## 7 October 2026: larger-balloon session

Use **4A tonight · 2 m balloon** in Quick start. It preserves the previous profile, retains camera/projector hardware settings and lens positions, sets the proposed diameter to 2 m and clears the previous venue alignment. **Restore previous profile** recovers the former settings without silently reactivating its scan. If the existing positions conflict with a 2 m ball, an explicit pending layout survives reload until corrected. Measure the actual diameter; 2 m is provisional. The larger fan is a session note, not a software-controlled or validated fan model.

At the venue: confirm diameter, frame the entire travel area, place the projector window full screen, keep the balloon stationary with the fan off, then use the existing Scan and Go live flow. Follow the infrared-off/on prompts. A new camera location requires a new scan.

In Looks, the top Movement & New Looks panel contains normal surface mapping, opposite motion with gain 0–4×, world lock and Recenter. Opposite gain 1 means content visibly moves opposite at the balloon's translation speed; gain 3 means three times that speed. World lock cancels translation, but authored shader animation continues. Set animation speed to zero to isolate the optical illusion. Recenter sets the current location as a fresh content reference. Settings persist; tracking anchors do not. These modes never move the silhouette or alter the physical tracking estimate.

Five new algorithms each have 16 deterministic variants: Paint splatter, Interior orbits, Interior crystal, Interior tidal, Back hemisphere mesh. Featured buttons select the first variant; the existing Prev/Next controls explore the others. Paint uses multicoloured impacts and black empty areas. Interiors and rear mesh are virtual, viewpoint-dependent views, not captured balloon interiors, actual rear surfaces or measured rotation. Finite virtual interiors can move out of view under large content offsets. These additions target Studio's WebGL renderer; equivalent native WGSL implementations are not included.

Verified: 300 unit tests in 61 files passed with one worker; TypeScript and stable build passed. Parallel timing tests in the separate levitation module exceeded strict wall-clock thresholds under concurrent browser load, then passed serially with no threshold changes. In-app GPU checks rendered all five new algorithms without console errors; changing motion modes, gain, recenter, saved profile, restore and 2 m reload were exercised. Laptop width 1280 px now has no horizontal document overflow. Mathematical tests cover world/raster cancellation, opposite sign, frame-rate independence, dropped tracking, source changes and invalid samples. This is software evidence, not physical latency, projection accuracy or fan stability.

The Mac login launcher now serves the stable build at port 4178. It previously started the development copy at 4190, leaving the normal address unavailable. The camera bridge was started on 8765 in explicitly simulated mode for software checks. If the Mac restarts, run `./scripts/serve-test-bridge.sh` before opening the bench; the app will connect automatically.

### Further features worth exploring after tonight

1. A/B motion recording and replay: capture one actual trajectory and compare normal, opposite and world-locked content against the same movement. This is the most useful next addition because it makes creative judgement repeatable.
2. Motion-triggered paint: use reliable acceleration peaks or direction reversals to trigger impacts, with debouncing so tracking noise does not produce a burst.
3. Depth-parallax control: smoothly blend a surface graphic into the virtual interior, calibrated for one intended audience position.

These are proposed follow-ups, not implemented capabilities. Keep live fan control out of the visual app until its hardware and operating limits are separately established.

### Per-preset projection controls and outer shell

The visible **Projection colour & shell** panel provides exposure (-3 to +3 stops), linear brightness (0–2×), contrast, saturation (0–3×), hue, scale, rotation, softness and level. Brightness and exposure adjust the native linear light signal. A scalar maximum-channel limiter preserves colour ratios above the output range; the artwork bypasses photographic tone mapping. Brightness zero produces black artwork; saturation zero removes colour from highlights as well as the base shader. Preview light remains a separate scene control.

Every preset selection starts at neutral exposure (0 EV), 100% native brightness, full original colour (saturation 1), neutral contrast and full level. This supersedes the earlier forced +3 EV policy, including older saved grading values. Preview light also returns to 100%. Manual grading applies immediately; selecting a preset restores these bright starting levels. Shape and shell settings remain saved per variant. Reset uses the same bright starting levels for the selected preset. Shader-specific parameter controls are now accessible without expert mode; their Save button retains the existing full-preset override workflow.

Interior orbits, crystal, tidal and rear-hemisphere mesh include an outer shell grid (default strength 0.25). Adjust strength, density and thickness, or set strength to zero to hide it. Its coordinates come from the unrotated balloon surface, independent of the displaced interior artwork. It is a virtual spherical shell, not a reconstruction of physical latex topology.

Verification: 303 tests passed; final grading refinement passed 14 focused surface/control tests; TypeScript and stable build passed. Browser checks verified independent preset values, reload persistence, brightness zero, saturation zero, grid on/off and crystal-with-shell appearance, with no console errors. Physical brightness and clipping remain on-site checks.

Historical +3 EV selection update, superseded by the native-colour correction below: 15 focused tests passed, TypeScript and stable build passed. Browser checks confirmed that switching away from a dimmed, desaturated preset and returning restores +3 EV and saturation 1, with no console errors. Stable version: 2026-10-07T14:06:50. Physical projection brightness remains unverified.

### Rendering and live-look workflow review, 7 October

The Looks workspace now starts with six authored balloon compositions. These reuse existing shaders with deliberate parameters, seeds, animation speeds and movement settings, adding no rendering passes:

- Confetti blasts: fast small paint impacts over black.
- Wet paint layers: larger retained splashes and ragged trails.
- Suspended crystal: slow virtual crystal with a fine outer shell grid.
- Orbital mechanism: virtual rings and orbiting cores inside a visible cage.
- Anchored grid: frozen animation with world-locked translation.
- Counterflow filaments: electric threads with 3× opposite translation.

Each composition now loads at 0 EV, brightness 1 and saturation 1; the earlier +3 EV starting policy has been superseded. Recipes alter artwork and content movement. Their virtual interiors remain view-dependent illusions. They do not change camera, rig, output release or fan settings. Individual test looks and manual movement controls remain available in compact disclosure panels.

Search, family and GPU filters now browse without changing the active artwork. Select a card explicitly to switch. The active name, favourites, animation speed and shader-specific controls sit above the catalogue. Favourites persist in this browser for both catalogue variants and named compositions. Composition favourites recall their authored settings and movement; they are not snapshots of unsaved manual edits. Audiovisual Show Controls remain available below the shader shelf.

Coverage diagnostics run at most ten times per second for changing geometry, skip unchanged geometry and refresh immediately after explicit rig edits. Mapping preview GPU readbacks run only for visible heads, at ten Hz aggregate, and stop completely while a direct projector window is open. Standby heads are skipped. Direct projector output retains its existing cadence and raster. Thumbnails render one visible card per idle turn, suspend during projector output, and reuse a bounded 96-entry pixel cache (about 8.3 MB maximum cached pixels).

Runtime counters on the viewport expose coverage updates, mapping readbacks, thumbnail readbacks/cache hits and output priority. These are software diagnostics, not GPU timings or measured camera-to-projector latency. A CPU-only coverage microbenchmark on this Mac measured about 0.405 ms per 512-sample/five-head analysis; this does not establish physical latency.

The dashboard can close projector windows together. Dashboard reload/unload closes owned output windows and cancels their frame loops. Mapping preview tiles visibly identify pauses during output priority.

Verification: 317 tests across 64 files were exercised. Three pre-existing wall-clock timing checks in the separate levitation model failed during the full run, then all 29 tests in those three files passed in isolation without changing thresholds. TypeScript and the stable build passed. Browser checks confirmed all six compositions, +3 EV/full-colour settings, filters preserving active content, favourites surviving reload and restoring movement. Projector-window checks kept blackout enabled. Physical output latency and venue performance remain on-site checks.

Recommended next creative extension: movement-triggered paint density or impacts, driven by tracked speed with a clear sensitivity control. This is a proposed follow-up, not an implemented capability.

### Native shader colour correction, 7 October

The source artwork now supplies projection-ready colour at neutral exposure. Increasing exposure was whitening patches because the previous path multiplied HDR drive and then used per-channel ACES compression. The correction changes source palettes, opacity and signal ownership, rather than relying on that gain.

- Reauthored saturated native palette endpoints across the coloured shader families. Pale shared highlights are richer pigments; metallic chrome retains its identity. The neutral membrane is a brighter cyan texture with its old standby attenuation removed.
- Paint uses source-over coverage and returns straight colour. Orbital rings, tidal layers and the rear mesh also return straight colour plus coverage. Coverage is applied once in the output compositor, preserving faded droplets and thin lines rather than squaring their opacity.
- Crystal faces have a brighter coloured shadow range and pigment-tinted edges. Directional face shading, wet-paint variation and interior depth remain. The outer shell grid is cyan rather than pale white.
- Native palettes are authored in display sRGB, bounded without normalising shaded pixels below one, decoded once to linear light, adjusted by brightness/exposure, then encoded once for display. Values above range use a shared scalar limiter, preserving linear RGB chromaticity instead of clipping each channel into white.
- The sphere artwork bypasses ACES; the room retains it. Direct and structured-light projector rendering use the same native signal. Thumbnail targets now store sRGB bytes so their readback images use the correct transfer.
- Preset selection restores 0 EV, brightness 100%, saturation 100% and neutral contrast. Exposure remains an optional manual adjustment. Legacy score brightness and energy no longer multiply the entire projector colour signal. Optical feathering, black correction, confidence and the existing output gate remain outside the source-colour normalization.
- Material preview lighting and glow start at zero. Optional material response affects the twin through a scalar brightness proxy, without whitening pigment or changing physical projector colour. It is illustrative, not measured latex transmission.

Verification: 37 focused tests passed across source colour, shader contracts, starting controls, recipes, saved overrides, living skins, render export and output gating. The final palette refinement passed 15 shader/colour tests. TypeScript and stable build passed. Browser checks exercise all 48 algorithms at 0 EV/100% brightness/100% saturation and check the creative recipes and manual grading; no physical brightness or projector gamut measurement is inferred from these checks.

Iridescent film refinement, 7 October: removed the film's dark navy palette blend and its global contrast attenuation. The unshaded spectral palette now reaches full native colour through a common RGB gain, followed by gentle band relief. At default Bands, coverage ranges from approximately 0.801 to 1.0, instead of 0.204 to 0.728. Bands still changes the interference frequency and ripple depth; flow, sheen and colour shift remain adjustable. This is a source-level change shared by all 16 variants, with no extra passes or exposure boost. Exposure remains 0 EV, brightness and saturation 100%. Twenty focused tests, TypeScript and the stable build passed. All 16 variants were selected in the browser with no console errors, and the stronger colour was visually checked in paused and animated previews. Stable version: 2026-10-07T15:21:58. Physical projector brightness remains an on-site check.

### Iridescent line studies, 7 October

Three new one-click studies sit at the top of Looks, above the existing six balloon compositions:

- Rainbow filaments: dense fine rainbow contours over black, with bends through multiple axes.
- Chromatic contours: broader curling colour ribbons paired with narrower contrasting lines and separated by black gaps.
- Monochrome squiggles: a different warped closed-ridge field, resembling fingerprints and topography. Bright white lines on black; Black / white polarity reverses them above halfway.

All three authored studies use Iridescent film / 01's flow setting (approximately 0.524), texture scale setting (approximately 0.720), and 1.75× animation clock. Their different line geometry changes the visible motion, but the underlying advection and carrier drift use the same gentle rates. Selecting a study restores 0 EV, brightness 100%, saturation 100%, neutral hue and surface-following content. Texture scale, Flow, Line density, Line width and Colour shift (or Black / white polarity) are available under Shader-specific controls. Existing favourites also recall these studies.

The line mask is derived from a shared flowing 3D field on the sphere, with bounded antialiasing from the current raster height, camera optics and distance. Shader derivatives were isolated as the cause of a faint triangular artefact during preview testing, so they do not control the new line masks. Unresolved ink fades when a contour period becomes subpixel, preserving black gaps rather than averaging grey coverage across the surface. Pigment stays separate from coverage. These are three new single-pass WebGL algorithms, with no textures, added render passes or readback loops. Renderer slots 48–50 are appended so existing look IDs keep their meanings. The catalogue now contains 51 algorithms and 816 parameter variants; the nine featured compositions include the three authored line studies. No equivalent new native WGSL implementation is claimed.

Verification: the eight-file focused run passed 50 tests. The final raster-filter refinement passed 16 shader/colour tests, including one new test for raster and camera changes, giving 51 distinct focused tests across those runs. TypeScript, stable build and diff checks passed. Browser checks confirmed all three one-click studies at 1.75×, neutral exposure and full native brightness/colour, density and width extremes, monochrome reversal, paused frames and animated previews. Final previews have clean black gaps and continuous strokes without the earlier triangular overlay; no console errors. Stable version: 2026-10-07T15:57:10. These checks establish software appearance, not physical projector brightness, latency or calibrated tracking performance. Review images are in `/Users/kitwebster/Generated with AI/Images/2026-10-07-Orbital/`: `Orbital_Rainbow_Filaments.jpg`, `Orbital_Chromatic_Contours.jpg`, and `Orbital_Monochrome_Squiggles.jpg`.
