# Shader registry contract

`shaderRegistry.ts` is the renderer-neutral catalogue for Orbital visual
families. It deliberately does not import Three.js or shader source modules,
so the browser preview, TouchDesigner bridge and a later native renderer can
consume the same metadata.

## UI and renderer entry points

```ts
import {
  CURATED_SHADER_REGISTRY,
  createShaderPreset,
  listShaders,
  selectShader,
  serialiseShaderPreset,
  validateShaderParameters,
} from "./core/shaderRegistry";
```

- `listShaders({ family, gpuCost, tag, projectorCount })` returns picker-ready
  definitions.
- `selectShader(id)` returns the requested definition or the neutral fallback.
- `validateShaderParameters(id, values)` clamps neither silently nor outside
  the declared range. It returns defaults for omitted controls and throws for
  unknown or unsafe values.
- `createShaderPreset` and `serialiseShaderPreset` produce deterministic,
  versioned JSON. `parseShaderPreset` is the strict import boundary;
  `resolveShaderPreset` converts malformed input into the neutral preset and
  preserves the issue for operator diagnostics.

Each audio input names its source `AudiovisualParameters` field and a
`targetParameterId`. The runtime can apply the declared response, depth and
smoothing without inventing an unbounded mapping. `gpuCost` is a coarse tier;
`gpuEstimate` carries the relative score, pass count and texture-read estimate.
Projector metadata describes the rehearsal limits only. It does not claim
physical calibration, brightness or motion-to-photon validation.

The registry fallback is intentionally a dark, low-cost neutral membrane. A
shader implementation adapter should use `fallbackShaderId` when compilation,
capability checks or preset validation fail, and should keep the fallback
authored state independent from fan, tracking and emergency-control paths.

