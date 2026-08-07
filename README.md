# Orbital Studio

Experimental software for developing the visual, tracking and projection
systems behind Kit Webster's Orbital installation.

Live test build: https://kitwebster-art.github.io/orbital-studio/

Orbital Studio is the hardware-independent Phase One shader test bench for the
Orbital installation. It keeps one dominant sphere viewport, a shader-surface
default, a UV coverage proxy and five projector rehearsal views, 43 original
sphere-space algorithms and a
searchable shelf of 688 deterministic looks, four independently assigned
surface regions, camera lifecycle
diagnostics and a safe virtual fan cue. The earlier score, cue bridge, live
transport and quad-audio rehearsal tools remain available under Advanced tools
for later integration, but they are not the default authoring surface.

It is designed so the real tracker, TouchDesigner renderer, production audio
runtime and independent fan controller can replace the simulated adapters
without changing the content model.

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

The Live mode remains explicitly unavailable. Airflow hardware writes are
impossible in this application. The fan panel is telemetry simulation only.
The camera panel is the same kind of boundary: it exercises discovery,
configuration, hardware-trigger arming and stream health with five virtual
heads, but it does not open a camera transport or claim a physical frame.

The Runtime Health panel also exposes a browser-only preview quality control.
Adaptive mode starts at Balanced and moves between High, Balanced and Low
after sustained frame-budget evidence. Balanced caps preview DPR at 1.25, Low
caps it at 1 and disables preview shadows, and High retains the 2x cap. The
quality status reports P95 against the 16.7 ms 60 Hz target. This is an
authoring control and does not describe the eventual projector renderer.

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
   rotation, hue, saturation, contrast, edge softness and shader level.
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
8. Open Tracking and output tests only when checking the changing envelope,
   camera lifecycle, UV coverage proxy or projector rehearsal views.
9. Select P1–P5 to move the main Three.js viewport to each simulated projector
   camera. UV and tile panels remain clearly labelled coverage proxies. Use
   Inspect to enlarge a proxy; calibrated render-target windows remain a later
   native-output gate.
10. Use the virtual fan test cue only to inspect ramp behaviour. Hardware writes
   remain impossible in this browser application.

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

- **Simulation:** deterministic three-dimensional movement, gross deformation,
  wobble, prediction and residual error.
- **Replay:** imports JSONL from `../orbital-tracker`. The existing monocular
  2D state is mapped into a clearly flagged simulated depth and gross-form
  representation for content development only.
- **Live:** deliberately unavailable until a machine-vision adapter passes
  timestamp, trigger, dropped-frame, loss-recovery and physical attachment
  tests.

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

- a native tracker publishes timestamped 3D world state
- a native GenICam/GigE Vision bridge publishes camera health and frames
- TouchDesigner or another approved renderer consumes the five-head rig JSON,
  calibrated projection matrices, warp meshes, edge blends and black levels
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
TouchDesigner or another approved runtime. Exporting it does not connect to
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
field of view, lens shift, brightness, gamma, black level and four edge-blend
values. The mapping mode is `shape-locked-world`: authored content can rotate
independently, while the projector contribution stays locked to the changing
tracked envelope.

The PREVIEW PATTERN control exposes authored, coverage, calibration-grid,
seam-stress and black/alignment modes. The scene renders five frustums, five beam channels and a
surface shader that approximates cone coverage and edge weighting. This is a
calibration and content-development surface, not evidence that five physical
projectors are aligned.

## Camera control and shortlist

The camera panel uses `orbital.camera-rig/1.0`, and native bridge intents are
represented by `orbital.camera-command/1.0`. Its lifecycle is intentionally
the same as the eventual native bridge: discover, configure, arm, start/stop
stream and inspect per-camera fps, latency, frame age and dropped-frame state.
The browser implementation is a deterministic no-write simulator.

The current software shortlist is:

1. **Primary NIR path:** Basler ace 2 `a2A2048-114g5mBAS`, represented by the
   `basler-ace2-nir` profile. The integration target is a GenICam/GigE Vision
   bridge using Basler pylon.
2. **Visible-light benchmark:** Teledyne FLIR Blackfly S `BFS-U3-51S5P`,
   represented by `flir-blackfly-s-5mp`, with Spinnaker as the native SDK.
3. **Jetson or IPC cabling option:** Basler ace 2 `a2A2448-90mgm`, represented
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
