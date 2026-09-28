# Orbital Levitation Lab

A second page inside Orbital Studio for exploring which lightweight shapes and
skins will hover in a fan's vertical air jet, how they behave, and how they look
when projection mapped and camera tracked.

## Open it

```bash
npm run dev            # then open http://127.0.0.1:4178/levitation.html
npm run build          # emits dist/index.html and dist/levitation.html
npm run preview        # then open http://127.0.0.1:4179/levitation.html
```

The Guide opens on the first visit (remembered in `localStorage`). Reopen it
with the `?` button or `G`.

### Shortcuts

| Key | Action |
| --- | --- |
| `Space` | Pause or resume the flight |
| `R` | Reset the flight (drop onto the fan and lift off again) |
| `N` | Nudge the shape sideways |
| `1` `2` `3` | Projection, Pressure, Material views |
| `G` or `?` | Open or close the Guide |
| Mouse | Drag to orbit, scroll to zoom, right-drag to pan, double-click to reframe |

### URL parameters

Useful for sharing a set-up or for tests. All are optional.

| Parameter | Example | Effect |
| --- | --- | --- |
| `preset` | `preset=halo` | Load a preset (`orbital-3m`, `home-60cm`, `halo`, `shuttle`, `medusa`, `geode`, `twin`, `ribbon`) |
| `view` | `view=pressure` | `projection`, `pressure` or `material` |
| `latency`, `prediction` | `latency=120&prediction=0` | Tracking latency in ms, prediction on or off |
| `air`, `forces`, `tracking` | `forces=1` | Toggle overlays (`1` or `0`) |
| `look`, `projectors` | `look=aurora-ribbons&projectors=1` | Projection look id and projector count (1 to 5) |
| `quality` | `quality=high` | `auto` (default governor), `high` or `low` |
| `guide` | `guide=0` | Force the Guide open (`1`) or closed (`0`) on load |
| `settle` | `settle=1` | Start at the analysed hover height instead of lifting off |

## What it does

- **Scene.** A dark gallery void with a faintly reflective floor, haze, a 1.75 m
  figure for scale (faded out for tabletop-scale designs) and the fan drawn from
  the design: outlet diameter, housing, and a rotor that depends on the fan type
  (plain axial with a finger guard, axial with stator vanes, or a plug impeller
  under a honeycomb FlowGrid). The shape comes from the model's
  `buildShapeMesh` and is posed every frame from `LevitationSimulation.state`
  (position, orientation, and volume-preserving squash). Medusa ribbons sway.
- **Air.** 8,192 to 16,384 flow particles are advected on the CPU through the
  model's `sampleJet` into typed arrays and drawn as additive, speed-coloured
  streaks. Near the body they slide along the skin (the jet is turned, not
  stopped), cling round the curvature and peel off at the shoulder; bodies
  narrower than the jet bend the streamlines with a potential-flow dipole on the
  bounding ellipsoid; rings (halo, ribbon) let air through the middle. A soft
  volumetric envelope follows `jetHalfWidth(h)`.
- **Views.**
  - *Projection* uses Orbital Studio's own surface shader and look registry.
  - *Pressure* paints a Bernoulli pressure-coefficient style map,
    `Cp = 1 - (1.5 sin theta)^2`, relaxing to a separated base pressure on the
    lee side and weighted by where the jet and its wall jet actually reach.
  - *Material* is a physically based preview from each material's swatch (matte
    films, fabric sheen, mirror Mylar in a dark-room environment map, washi
    transmission).
- **Forces.** Log-scaled arrows for weight, jet push, centring, vortex shedding
  (and buoyancy when helium matters) from `SimState.forces`, with CP and CM
  markers and live labels.
- **Tracking and latency.** A picture-in-picture camera modelled on the HuaTeng
  Stage A feed (1024 x 768 Mono8, 91 fps) is scissor-rendered on the main
  renderer as a monochrome silhouette. The model's `observeSilhouette` ellipse is
  drawn over it (solid green), with the ellipse of where the projector is
  drawing (dashed amber) and a readout using `orbital.tracking-state/1.0` field
  names. The projected look is drawn at `projectionPose(history, now, latency,
  prediction)`, so latency makes the image slide, parts of the skin go dark, and
  a faint amber ghost shows light that misses the shape. Misregistration is
  shown live in millimetres.
- **Results.** Verdict banner and summary from `analyseDesign`, six metric
  tiles, a 10 s sparkline of height and drift, and a clickable levitation
  envelope (`levitationEnvelope` over 36 speeds x 26 sizes). Analysis and the
  envelope run in a Web Worker, debounced, with a main-thread fallback.
- **Guide.** Start here, the controls, reading the results, how it floats (with
  diagrams), shapes and materials for projection mapping, tracking and latency,
  and what the model is and isn't.

## Flight status and verdict

The status pill describes the flight right now; the verdict in the dock is the
analysis of the design as a whole.

| Status | Meaning |
|---|---|
| Hovering | Inside the jet (within 1.25 x jet half-width plus footprint), held up and not tumbling |
| Lifting off / Falling | Moving up or down faster than 0.25 m/s, or drifting outside the jet core |
| Tumbling | Turning end over end faster than about 1.2 rad/s (smoothed, slow to clear) |
| Escaped the jet | More than 1.6 x (jet half-width plus footprint) from the axis, whatever its speed |
| Resting on the fan, Pinned to the ceiling, Floating away | Boundary and buoyancy states |

The Hover height tile only shows a height for designs that hover (steadily or
wobbly). A balance height the body never holds is shown as a dash with the
reason. The tracking readout reports lost when the silhouette centre leaves the
virtual camera frame, as the Orbital Tracker would.

## How it reuses Orbital Studio

- `createOrbitalSurfaceMaterial()` provides the projection material. Its vertex
  shader (which forces geometry into an ellipsoid) is replaced by one that keeps
  the mesh and supplies the same varyings (`vWorldPosition`,
  `vSurfaceDirection`, `vWorldNormal`, `vDeformation`); `uOutputWarp` is unused.
  `vSurfaceDirection` is computed from the pose the projector believes in, so
  latency shows up as the image sliding over the real surface.
- The fragment shader is kept and patched in three places
  (`src/levitation/scene/projectionSurface.ts`, unit tested against the real
  Studio shader):
  1. each projector's contribution is multiplied by a visibility term from a
     per-projector atlas (shadowing plus, with latency, whether the lagged
     content covers that projector pixel);
  2. in the authored pattern, light is gated by the rig coverage so only
     projector-lit areas glow;
  3. normals flip for back faces so double-sided shells light correctly.
- Projector uniforms are filled with Studio's `updateOrbitalSurfaceMaterial`
  and `ProjectorShaderInput`. Beams use Studio's `createProjectionBeamMaterial`.
- Looks come from the shader registry (`listShaderDefinitions`,
  `createShaderPreset`, `deriveDeterministicShaderSeed`) and
  `shaderRenderModeIndex`, applied exactly as `OrbitalScene.setShaderPreset`
  does. The shelf: geometric grid, fluid membrane, contour field, water
  caustics, aurora ribbons, reaction diffusion, holographic scan, iridescent
  film.

## Code map

```
levitation.html                 page entry (repo root)
src/levitation/main.ts          WebGL2 check and boot
src/levitation/app/             LevitationApp (frame loop, wiring), store,
                                analysis worker and client, quality governor,
                                jet sampler
src/levitation/scene/           LabScene (renderer, bloom, camera), environment,
                                fan, body, air particles, jet envelope,
                                projectors and visibility atlas, forces,
                                tracking PiP, thumbnails, Studio shader adapter
src/levitation/ui/              panels, dock, charts, guide, controls, icons
src/levitation/model/           physics model (separate, pure TypeScript)
```

## Performance

WebGL2, ACES filmic tone mapping, `UnrealBloomPass` (half resolution
internally) and `OutputPass`, 4x MSAA on the composer target, device pixel
ratio capped at 1.5. A governor drops particles, resolution and then bloom if
frames average over 22 ms, and recovers after a quiet spell. Geometry is
disposed on rebuild and the particle loop allocates nothing.

Headless Chrome on an Apple M4 (ANGLE Metal) held a steady 60 fps (16.7 ms mean
and p95 frame interval over 3 s) at 1440 x 900 with a Retina device scale
(pixel ratio 1.5), 16,384 particles and bloom on. Headless numbers are
indicative only; check on the target MacBook Air.

## What the model is and isn't

The Lab is a reduced-order estimate, not computational fluid dynamics:

- The jet, drag, centring, shedding and stability come from a handful of
  textbook relations with tuned coefficients. Treat hover heights, sway and
  scores as comparisons between options, not predictions to the millimetre.
- The flow particles and the pressure map are illustrative. They follow the
  model's jet and simple wall-jet and potential-flow rules around the body; they
  do not solve the airflow around the exact shape.
- Rooms matter: draughts, vents, people and walls change real behaviour.
- The projection view shows coverage, shadowing and latency from virtual
  projectors on a fixed rig covering the rise and hover zone. It is a preview,
  not a calibration.

Always confirm with a physical test: a balloon over a pedestal fan at home,
then a sample of the real skin over the real fan, filmed from where the
tracking camera will be.
