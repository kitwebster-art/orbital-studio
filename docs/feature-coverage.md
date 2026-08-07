# Orbital Studio feature coverage

Updated: 2026-08-04T22:56:00+10:00

This matrix maps the overnight programme brief to the current software state.
“Simulated” means the behaviour is exercised locally without claiming a
physical result. “Open gate” is work that must be validated with the installed
camera, projector, audio, network or fan system.

| Brief requirement | Current state | Evidence or open gate |
| --- | --- | --- |
| Five-projector mapping | Simulated | Existing five-output rig, blend, warp, lens shift, black level and shape-locked 3D surface state are represented in the digital twin. P1–P5 now move the main viewport to the corresponding simulated projector camera. Tile and UV panels remain coverage proxies; physical calibration is open. |
| Ball tracking and changing shape | Simulated | Five-camera GenICam lifecycle, synthetic tracking, residual and loss fallback are present. Native NIR/global-shutter capture, multi-camera reconstruction and motion-to-photon measurement are open. |
| Material rotation independent from content lock | Simulated | Normalised 3D procedural coordinates remain bound to the changing envelope while material rotation is intentionally independent. Physical balloon or parachute material testing is open. |
| Sequencer | Implemented | Versioned timeline contract with cues, 13 tracks, beat/bar/phrase timing, interpolation, event crossing, loops, score-derived timeline and deterministic fallback. |
| Shader library | Implemented, physical renderer integration open | Forty-three original procedural algorithms are grouped into twelve browse families and expanded into 688 deterministic parameter looks. Every algorithm has a unique renderer slot, up to five bounded local controls, eight shared renderer finishing controls, seeded repeatability and tagged search. Animation uses an independent preview clock, remains active while the show transport is stopped, scales from 0× to 2.5× and freezes continuously at 0×. The renderer uses continuous normalised 3D coordinates, tri-planar grids and 3D cellular/noise fields rather than longitude/latitude UV conversion. A 56-look Start here set promotes four variants from fourteen shape-readable algorithms. Preview light is independent from show energy. Native TouchDesigner, Notch or calibrated projector integration remains open. |
| Live Ableton / OSC / MIDI / Link / MTC | Contract and simulator implemented | Receive-only transport envelope, protocol selection, source-age diagnostics, stale-clock fallback and virtual pulse recovery are present. Native sockets, Web MIDI, Ableton Link and MTC adapters are open. |
| Ableton sound sync | Contract boundary implemented | Beat and phase can drive the sequencer without owning Ableton. A Max for Live or native bridge and real audio-clock acceptance test are open. |
| Quadraphonic soundscape | Preview only | Four-channel level model and browser fold-down are present. Calibrated room playback, routing, sub-bass level and acoustic masking tests are open. |
| Fan speed and DMX | No-write simulation | Fan cue is part of the score and telemetry is visible. DMX or Art-Net output must remain behind an independent safety controller and physical commissioning gate. |
| 40 to 60 minute experience | Advanced authoring data | Bundled 48-minute score remains available under Advanced tools. Full-duration rehearsal with hardware, audio and audience conditions is open. |
| Runtime health | Browser instrumentation | Frame rate, average and P95 frame time are visible. This is not projector motion-to-photon or camera latency evidence. |
| Preview render quality | Implemented at renderer edge | High, Balanced, Low and Adaptive modes cap browser DPR and optionally disable preview shadows. The policy is hysteretic and reports P95 against a 60 Hz target. This is an authoring control, not physical GPU or projector evidence. |
| Expert panel | Implemented as research and QA contract | Source-backed capability matrix, 16 capabilities, 20 official or local sources and six gates are stored in `research/`. No external app is connected by this simulator. |
| Phase One mapping lab | Implemented in browser | Focused sphere bench with 688 looks, a New collection, a 16-variant navigator, actual algorithm routing for the main surface and four region bands, automatic visible selection after filtering, eight shared shape-and-colour controls, a continuous three-axis seam stress pattern, preview exposure and distinct catalogue thumbnails. UV and P1–P5 panels remain simulated coverage proxies rather than calibrated render targets. Camera lifecycle and fan controls are explicitly virtual. Native shader outputs, per-region uniform blocks, calibrated masks, reconstruction and hardware outputs remain open. |

## Recommended integration posture

Keep the canonical cue and timeline data in versioned JSONL/JSON contracts.
Use local OSC as the first cue data plane, TouchDesigner as the primary visual
integration for Stage A, Ableton Live with Max for Live for audio, and an
independent fan safety controller. Treat Notch, Ableton Link and native camera
adapters as staged options rather than assumptions. The source-backed rationale
is in [the expert-panel capability matrix](../research/expert-panel-capability-matrix.md).
