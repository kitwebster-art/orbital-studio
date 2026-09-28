# Orbital Studio

## Physical test bench, 5 September 2026

The default local workspace is now **Test bench**, with an adjustable 50 cm
ball and independent camera/projector positions. Its single-projector starter
uses landscape output; layout edits save to the profile and invalidate prior
alignment. It connects to the native
camera bridge for acknowledged discovery, stop/configure/start and status,
records visible/850/940 nm hardware profiles, imports validated camera and
projector geometry, and exports source-qualified software measurements.
Projector output starts black; **B** blacks out live and pattern windows.

Start the control bridge with `./scripts/serve-test-bridge.sh`, then open
`http://127.0.0.1:4178`. See [the operating guide](docs/test-bench-guide.md),
[acceptance criteria](docs/physical-test-acceptance.md) and
[platform research](docs/platform-comparison-2026-09-05.md).

Physical live output requires a reachable HuaTeng source, synchronised source
clock, fresh valid known-radius spherical geometry and measured projector
calibration. The camera model is a restricted spherical approximation;
orientation and general deforming-balloon reconstruction are unavailable.
Software tests do not establish physical accuracy or motion-to-photon latency.
Actual SDK discovery on this update returned no connected cameras.

The existing creative tools described below remain available in Looks,
Projection, Tracking and System. The legacy camera panel is virtual; real
camera controls are in Test bench. The calibration wizard remains simulated.
The public build linked below has not been deployed by this local update.

Experimental software for developing the visual, tracking and projection
systems behind Kit Webster's Orbital installation.

Live test build: https://kitwebster-art.github.io/orbital-studio/

Orbital Studio is the hardware-independent Phase One shader test bench for the
Orbital installation. It keeps one dominant sphere viewport, a shader-surface
default, a UV coverage proxy and five projector rehearsal views, 43 original
sphere-space algorithms and a
searchable shelf of 688 deterministic looks, four independently assigned
surface regions, shader-rendered balloon thumbnails, camera lifecycle
diagnostics and a safe virtual fan cue. The earlier score, cue bridge, live
transport and quad-audio rehearsal tools remain available under Advanced tools
for later integration, but they are not the default authoring surface.

The optional Cinematic Mosaic is a social-content beauty mode, kept separate
from full-sphere shader testing. It divides the sphere into up to twelve stable
geometric cube-face quadrants, then lets each shader panel breathe, soften,
glitch and flash independently. A lightweight physically based response adds
controllable diffuse, specular, Fresnel and glow detail before ACES tone
mapping. The rustic warehouse now uses panel-jointed concrete with adjustable
patina, warm-to-cool industrial lighting and soft shadows. A Prismatica-style
three-shot camera route interpolates smoothly between any three of five
cinematic angles, with an adjustable hold on each composition and direct eased
movement to Shot A, B or C. Projector bodies, light throws, technical guides,
fan, speakers and room architecture are independently removable. Social Capture exports a high-resolution PNG or
six-second WebM from portrait, square or landscape framing; recorded clips use
the active camera route when the tour is enabled.
This layer is for visual development and presentation. It is not evidence of
physical projector calibration or a replacement for the native show renderer.

All five projectors are modelled in a fixed 90-degree portrait orientation.
The long raster axis runs vertically so the calibrated image area follows the
balloon through its planned rise and fall as fan speed changes.

The Installation Digital Twin defaults to the first physical-test topology:
one selectable projector, one nearby but deliberately offset tracking camera
and one NIR planning light on a truss tower. Production rehearsal enables five
projectors and three camera/NIR stations. Generic projector throw ratios,
camera lenses and 850/940 nm illuminators are clearly labelled as planning
presets. The rectangular beam volume, shader coverage and P1–P5 output raster
share the same projector position, target, vertical field of view and portrait
aspect. Haze density controls both atmospheric visibility and beam strength.
The source-backed design study is in
[installation-visualisation-patterns-2026-08-13.md](research/installation-visualisation-patterns-2026-08-13.md).

It is designed so the real tracker, custom native Orbital Engine, production
audio runtime and independent fan controller can replace the simulated
adapters without changing the content model. TouchDesigner is an optional
comparison and fallback tool, not a required production dependency.

## Current evidence boundary

This software does not prove:

- infrared tracking
- multi-camera 3D reconstruction
- projector calibration or attachment
- multi-projector overlap and black level
- physical motion-to-photon latency
- calibrated quadraphonic reproduction
- balloon material suitability
- fan control, airflow stability or machinery safety

Live mode now connects to a local fused-state bridge, but the supplied capture
source is still simulated. Airflow hardware writes are impossible in this
application. The fan panel is telemetry simulation only. The camera panel
exercises discovery, configuration, hardware-trigger arming and stream health
with three virtual heads, but it does not open a camera transport or claim a
physical frame.

The Runtime Health panel also exposes a browser-only preview quality control.
Adaptive mode starts at Balanced and moves between High, Balanced and Low
after sustained frame-budget evidence. Balanced caps preview DPR at 1.25, Low
caps it at 1 and disables preview shadows, and High retains the 2x cap. The
quality status reports P95 against the 16.7 ms 60 Hz target. This is an
authoring control and does not describe the eventual projector renderer.

The Projector Test workspace provides deterministic fullscreen patterns for
prototype hardware sessions: frame-counted black/white latency flashes, a
one-pixel calibration grid, focus text and edge markers, concentric circles,
and full-field white, gray, black, red, green and blue. It measures browser
output cadence and exports an `orbital-projector-test-v1` JSON record. The
projector information screen must still confirm the accepted signal mode, and
motion-to-photon latency still requires a physical high-speed-camera test.
The test record includes evidence-safe presets for the offered Sharp
XP-P601Q evaluation and the BenQ LK830ST low-latency comparison, plus a custom
option for other hardware. Export filenames include the UTC timestamp,
projector model, requested resolution and refresh rate so repeated sessions
remain sortable and cannot silently replace each other. Saved records can be
imported back into the workspace two at a time for an evidence-safe comparison
of confirmed signal, measured latency, throw ratio, curved-surface focus,
material response and physical-test verdict. Missing measurements remain
labelled as unmeasured.

## Run

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:4178`.

The development server is pinned to port 4178 with `--strictPort`, so the
browser URL cannot silently move to another port. `npm run health` performs a
fast reachability check. `scripts/serve-local.sh` provides a portable local
launcher for macOS and other systems with zsh and npm available.

Validation:

```sh
npm run check
```

## Phase One mapping lab

The default workflow is deliberately short:

1. Choose a shader family shortcut, open the New collection, or search for a
   look such as ocean, ink, grid, fire, nebula or turbulence.
2. Click a preset card to put the original bounded procedural look on the
   sphere, then tune its up-to-five algorithm controls. Every numeric control
   is passed into the preview renderer. Open Shape & Colour for eight additional
   renderer controls shared by every look: animation speed, global scale, surface
   rotation, hue, saturation, contrast, edge softness and shader level. Shader
   motion now starts at 1.75x and can be raised to 4x. Every preset icon is
   rendered from its real shader and seed on a balloon, rather than a generic
   colour swatch.
3. Use the Recent rail to jump back through the last six looks in this
   session without repeating a search. Restoring a look clears only search or
   family/GPU filters that would otherwise hide it.
4. Use Prev and Next in the variant navigator to audition all 16 deterministic
   looks for the selected shader algorithm. Navigation clears only a search
   phrase that would hide the next variant, while keeping the family filter.
5. Use Load more presets beneath the shelf to expand the unfiltered catalogue
   from the initial 72 cards in bounded pages until all 688 generated looks are
   visible. Family and search filters reset the window so the browser stays
   quick while every preset remains reachable.
6. Assign the selected look to the active sphere region when a mixed-surface
   test is useful. The region proxy currently covers North, Equator, South and
   Residual Rim bands, and each row keeps the assigned preset variant visible.
7. Turn on Seam test and rotate the sphere to inspect the continuous three-axis
   diagnostic grid, then restore the shader surface.
8. Use Balloon Physics to compare drift, breathing, squash, lower bulge,
   asymmetry, damping, mass and turbulence. Use Projection Material to compare
   latex, opaque latex and parachute-style reflectance, translucency, internal
   bleed and roughness.
9. Open Projection to inspect the live red, amber and green envelope coverage
   heatmap, then run the six-stage guided calibration rehearsal. It captures six
   alignment points, solves the five camera views, widens them across the hover
   envelope, builds blend masks and enables calibration JSON export.
   Before calibration, use Installation Digital Twin to choose the one-head or
   five-projector rehearsal, isolate P1–P5, compare generic throw ratios,
   camera lenses and NIR beam angles, and adjust haze. These are provisional
   planning values until the exact venue and hardware are measured.
10. Use Open P1 through Open P5 for clean 10:16 portrait output monitors at the
    chosen raster and refresh rate. The default rotated raster is 1200 × 1920.
    Each open monitor has its own direct WebGL backing buffer at that pixel size,
    while the five dashboard tiles remain 300 × 480 previews. Each monitor
    includes identify, freeze, resume and full-screen controls. Projector rasters
    use a high-output authoring floor and ACES highlight roll-off, so low-energy
    rehearsal cues cannot accidentally crush shader visibility. Each projector
    window owns its render clock and can take over the complete runtime heartbeat
    when the control page is throttled. Shader animation, Bernoulli lift,
    deformation, fan simulation and tracking updates therefore continue in both
    HTML fullscreen and macOS window fullscreen. Native EDID routing,
    photometric calibration and frame-lock remain production gates.
11. Open Tracking when checking the changing envelope, camera lifecycle or UV
    coverage proxy.
12. Select P1–P5 to move the main Three.js viewport to each simulated projector
   camera. UV and tile panels remain clearly labelled coverage proxies. Use
   Inspect to enlarge a live render and confirm its post-warp blend mask.
13. Use the virtual fan test cue only to inspect ramp behaviour. Hardware writes
   remain impossible in this browser application.
14. Click **Export to Orbital Engine** after choosing and adjusting a look. The
    downloaded `orbital.render-project/1.2` JSON carries that preset, shared
    look controls, four surface-region assignments, shader-event sound intent,
    and the one-head prototype or five-head production installation plan. The
    five portrait raster slots remain stable while inactive heads are routed
    black. It never contains fan commands. Engine returns a versioned
    acknowledgement only when its bundled 43-shader manifest checksum and all
    active hardware counts agree.
15. Open **Cinematic Mosaic** when creating social-media material. Enable it only
    when you want multiple geometric shader quadrants; leave it off to audition
    one shader across the full sphere. Tune variety, independent flashes,
    breathing, boundaries, beauty lighting and glow. Shader Event Sound can
    cycle space, metal, bass, sweep and attack pings through a generated reverb
    on the same fragmentation clock. Choreography modes include random glitch,
    orbital cascade, cube-face scan, eruption build and slow breathing, with
    evolving shader identities, event hold and attack-sharpness controls.
    Choose three Scene Camera shots, a move
    duration and hold time for a smooth loop. Hide technical scene layers for
    clean presentation. Under Social Capture, choose a ratio and
    camera angle, then export a PNG still or record a six-second WebM clip.

The preset shelf and region assignment contract are preview-adapter data. Region
rows retain the selected preset ID for comparison, while the current sphere
renderer routes the assigned algorithm through a shared bounded parameter set
until calibrated per-region uniforms are available. They do not claim that 688 native GPU modules have been compiled, that camera
reconstruction is physically correct, or that any projector or fan endpoint
has been opened.

The 43 algorithms are organised around twelve readable families: neutral membrane,
contour lines, fluid membrane, water caustics, turbulence and smoke, fire and
embers, matrix rain glyphs, fracture, particles, geometric grids, planetary
atmosphere and residual fault. The expanded set adds ocean swell, ink bloom,
magnetic fields, moiré interference, bioluminescent plankton, foam bubbles,
frost crystals, woven fibres, topographic erosion, cosmic nebula, holographic
scan, coral growth, space tunnel, kaleidoscopic warp, fractal circuits,
black-hole lensing, concentric rings and Truchet tiles. The procedural previews are original bounded
approximations informed by the [ShaderToy browse taxonomy](https://www.shadertoy.com/results?query=tag%3Dsphere&sort=popular),
[The Book of Shaders examples](https://thebookofshaders.com/examples/) and
live shader galleries such as [ShaderSpace](https://shaderspace.pro/) and
[neowall](https://neowall.net/). Community shader source is not copied into
this project. The current sphere-mapping and source decision record is in
`research/seamless-sphere-shader-study-2026-08-04.md`. The current
[ISF popularity and relevance audit](research/isf-coverage-audit-2026-08-07.md)
records the official ranking coverage, public repositories checked and the
generator, filter and multipass boundary.

The Matrix rain branch uses monotonic trail shaping rather than reversed GLSL
`smoothstep` edges, so the look remains deterministic across browser GPU
implementations while the sphere is kept at a restrained preview luminance.

## Development modes

- **Simulation:** opens by default with a smooth motion curve reconstructed from
  frame-by-frame centre, width, height and principal-axis fits in the
  17.67-second hall test clip. The curve is mirrored into a seamless 34-second
  presentation loop, then coupled to fan-driven hover height and flow
  attachment. No video needs to be loaded. It remains explicitly uncalibrated
  until the full physical rig is measured.
- **Replay:** imports JSONL from `../orbital-tracker`. The existing monocular
  2D state is mapped into a clearly flagged simulated depth and gross-form
  representation for content development only.
- **Live:** connects to the local fused-state bridge at
  `ws://127.0.0.1:8765`. The browser handles reconnects, sequence gaps, stale
  state expiry and explicit source unavailability. The native service can use
  either the connected HuaTeng camera or the simulated three-camera fusion
  rehearsal. Raw frames remain outside browser JavaScript.

### Run the local live bridge

In one terminal:

```sh
cd /Users/kitwebster/Documents/Work/Orbital/Software/orbital-tracker
PYTHONPATH=src python3 -m orbital_tracker bridge \
  --config configs/bridge-huateng-ge134.json
```

In another terminal, run this app at `http://127.0.0.1:4178/`, open Tracking,
then choose **Live gate**. The Local Live Bridge card reports connection,
received states and inferred dropped states. Simulation and recorded replay
remain available when the bridge is not running.

For a finite native-side rehearsal without the browser, run
`orbital_tracker fusion-test`. It writes the public tracking states and a
separate JSONL diagnostics log containing camera sequences, capture skew,
unsynchronized-frame rejections, per-camera gaps and fusion latency. This is a
software timing rehearsal, not evidence of physical camera synchronization.

The current Stage A boundary is one HuaTeng HT-GE134GM-T1P-C configured to
1024 × 768 Mono8 at a 91 fps target. The verified native macOS SDK performs
capture and a downsampled detection pass outside the browser. A later switch and
multi-camera uplink can replace this one-camera source without changing the
browser contract. Raw camera feeds must never be routed into browser JavaScript.

## Software boundaries

```text
simulation / replay / future live tracker
                  |
                  v
       orbital.world-state/1.0
                  |
                  v
        Phase One mapping lab
          /       |        |        \
         v        v        v         v
   sphere +    shader    UV and    camera and
   regions     presets   P1 to P5   fan tests
                  |
                  v
        advanced score and live bridge
             (opt-in, simulation only)
```

Production intent:

The complete migration, five-output topology and provisional show-server
specification are recorded in
`../../Planning/Orbital_Production_Runtime_Architecture_v1.md`.

- a native tracker publishes timestamped 3D world state
- a native GenICam/GigE Vision process captures three camera feeds and publishes
  camera health plus one compact fused ball state, never raw feeds to JavaScript
- the custom native Orbital Engine consumes the versioned installation JSON,
  including explicit active head routing, planning-only optics and camera/NIR
  metadata, then later consumes calibrated
  projection matrices, warp meshes, edge blends and black levels; the first
  five-output WGSL proof lives in `../orbital-engine`
- `content/render-contracts/shader-manifest-v1.json` is the generated 43-shader
  handoff and `default-render-project-v1.json` is its deterministic smoke-test
  project. `production-render-project-v1.json` proves five-head routing and
  `creative-render-project-v1.json` proves native region plus Living Skins
  compositing. `calibrated-creative-render-project-v1.json` proves the simulated
  calibration handoff. `native-tier-two-showcase-render-project-v1.json` and
  `native-tier-three-showcase-render-project-v1.json` prove full-sphere and
  region selection across the first twenty-four native algorithms; regenerate all
  contracts with `npm run export:render-contracts`
- Ableton with Max for Live, standalone Max, or another approved audio runtime
  consumes the same future-cued show events and produces real quad output
- a deterministic PLC or controller owns all fan limits, faults, recovery and
  emergency isolation
- the artwork runtime receives airflow telemetry but cannot bypass that
  controller

## Content system

`content/show-score-v1.json` contains the current eight-movement 48-minute
supercycle. Image and sound parameters are derived from the same score state,
then modulated by observed motion, prediction error and tracking confidence.

The SHOW AUTHORING panel edits one movement at a time. It exposes start, local
peak and end values for every shared parameter, local-peak position, movement
duration, major-peak state and versioned save/load. Save uses this browser's
local storage. Export and Load use the `orbital.content-preset/1.0` JSON
contract. Reset score returns to the bundled score. These actions change the
authored software score only, never projector calibration, camera data or fan
commands.

The operator can also temporarily add a manual content layer. The current-state
snapshot export and full show-preset export contain no projector calibration,
camera data or hardware commands.

The CUE BRIDGE records the raw runtime frame, before any temporary manual layer,
at 20 Hz as newline-delimited `orbital.cue-state/1.0` JSON. Each line carries a
monotonic bridge timestamp, show time, movement progress, shared audiovisual
parameters, quad levels, five projector levels, tracking state and simulated
fan telemetry. It is a platform-neutral handoff for later Ableton, Max,
Orbital Engine or another approved runtime. Exporting it does not connect to
hardware or issue fan commands.

## Musical sequencer and live transport contract

`src/core/sequencer.ts` provides the deterministic `Sequencer` class and the
versioned `orbital.timeline/1.0` contract. A timeline contains value or event
tracks, beat-addressed cues, linear/smoothstep/step interpolation, and explicit
tempo, bar and phrase settings. `createDefaultTimeline()` converts the bundled
48-minute score into a musical timeline. `createGeneratedFallbackTimeline()`
provides a sparse, deterministic phrase loop for a live clock outage. The
sequencer only advances from explicit `tick(deltaS)` calls, so browser rehearsal
and offline renders produce the same frames.

`src/core/liveTransport.ts` provides `LiveTransport`, an Ableton-neutral state
machine. MIDI, OSC, Ableton Link and MTC bridges exchange the same
`orbital.transport-command/1.0` envelope through `makeTransportCommand()` and
the protocol helpers. Native bridges call `ingestClock()` and
`receiveCommand()`, while `send()` and `drainOutgoing()` keep command transport
outside this browser runtime. The state reports `disconnected`, `connecting`,
`connected`, `reconnecting` or `clock-lost`, plus clock lock, fallback activity,
source age, clock loss, reconnect, dropped-clock and source-to-runtime latency
diagnostics. Clock loss never writes to audio, projector or fan hardware.

REHEARSAL PLAYBACK loads that JSONL back into a deterministic local player. It
supports play, pause, reset, rate changes and scrubbing while the same stage,
tracking metrics, quad meters and fan telemetry render the recorded frame. A
loaded stream pauses the live simulation and can be cleared without changing
the authored score. Malformed frames, backwards timestamps, unsupported schema
versions and streams over the frame cap are rejected before playback.

## Five-projector mapping

`schemas/projection-rig-v1.schema.json` and `src/core/projectionRig.ts` define
the five-head rehearsal rig. Each head has a world-space position and target,
field of view, fixed portrait orientation, 90-degree rotation, portrait raster,
lens shift, brightness, gamma, black level and four edge-blend values. The
mapping mode is `shape-locked-world`: authored content can rotate
independently, while the projector contribution stays locked to the changing
tracked envelope.

The PREVIEW PATTERN control exposes authored, coverage, calibration-grid,
seam-stress and black/alignment modes. The scene renders five frustums, five beam channels and a
surface shader that visualises uncovered, single-projector and overlapping
regions. A sampled sphere analysis reports total envelope coverage, overlap and
per-projector edge clipping. The guided rehearsal applies five post-warp camera
solves, four-corner meshes, feather masks, gamma and black level, and deliberately
aims through the balloon's expected hover envelope to prevent top-edge clipping.
This is a
calibration and content-development surface, not evidence that five physical
projectors are aligned.

## Camera control and shortlist

The camera panel uses `orbital.camera-rig/1.0`, and native bridge intents are
represented by `orbital.camera-command/1.0`. Its lifecycle is intentionally
the same as the eventual native bridge: discover, configure, arm, start/stop
stream and inspect per-camera fps, latency, frame age and dropped-frame state.
The browser implementation is a deterministic no-write simulator.

The Tracking workspace also includes a Stage A recorded-footage lab. Load a
locked-off balloon video, press **Play tracking**, then tune the white threshold
until the silhouette panel isolates the balloon. The lab shows the source,
binary mask and fitted envelope side by side, and feeds the measured 2D centre,
squash, stretch and principal axis into the simulated sphere in real time. This
is a visible-light rehearsal tool. It does not replace calibrated NIR capture,
multi-camera 3D reconstruction or a physical latency measurement.

The current software shortlist is:

1. **Current Stage A target:** HuaTeng Vision `HT-GE134GM-T1P-C`, represented by
   the `huateng-ge134` profile. The working Mac configuration is 1024 × 768
   Mono8 at a 91 fps target through the native HuaTeng bridge.
2. **Alternative NIR path:** Basler ace 2 `a2A2048-114g5mBAS`, represented by
   `basler-ace2-nir`.
3. **Visible-light benchmark:** Teledyne FLIR Blackfly S `BFS-U3-51S5P`,
   represented by `flir-blackfly-s-5mp`, with Spinnaker as the native SDK.
4. **Jetson or IPC cabling option:** Basler ace 2 `a2A2448-90mgm`, represented
   by `basler-ace2-gmsl2`, when GMSL2 is more useful than the NIR-enhanced GigE
   path.

This is a technical shortlist, not a purchase decision. Lens focal length,
camera distance, NIR illuminator wavelength, exposure budget, compute host and
network topology still need a physical Stage A test. The browser cannot prove
silhouette quality, reconstruction accuracy or motion-to-photon latency.

## Next physical gate

The next evidence step remains the one-camera, one-projector Stage A test. It
must measure projected boundary error and true physical motion-to-photon
latency using the real balloon, intended material, active NIR illumination and
planned camera distance. The software is ready to receive that measured rig
configuration when the hardware is available.
