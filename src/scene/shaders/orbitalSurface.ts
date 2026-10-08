import * as THREE from "three";
import { INTERIOR_LOOKS_GLSL } from "./interiorLooks";
import { SQUIGGLE_LOOKS_GLSL } from "./squiggleLooks";
import { PROJECTION_COLOUR_GLSL } from "./projectionColour";
import type { ProjectorShaderInput, ProjectionPattern } from "../../core/projectionRig";
import {
  DEFAULT_SHADER_LOOK_CONTROLS,
  normaliseShaderLookControls,
  type ShaderLookControls,
} from "../../core/shaderLookControls";

export interface OrbitalSurfaceState {
  timeS: number;
  centerM: THREE.Vector3;
  radiiM: THREE.Vector3;
  principalAxisRad: number;
  wobble: number;
  deformationRate: number;
  energy: number;
  brightness: number;
  visualDensity: number;
  fluidity: number;
  fracture: number;
  glitch: number;
  organic: number;
  melody: number;
  residualGain: number;
  residualM: THREE.Vector3;
  trackingConfidence: number;
  stateValid: boolean;
  projectors: readonly ProjectorShaderInput[];
  projectionPattern: ProjectionPattern;
  regionCenters: ArrayLike<number>;
  regionWidths: ArrayLike<number>;
  regionStyles: ArrayLike<number>;
  regionIntensities: ArrayLike<number>;
}

export const ORBITAL_SURFACE_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform mat4 uOutputWarp;
  uniform vec3 uCenter;
  uniform vec3 uRadii;
  uniform float uShapeAngle;
  uniform float uWobble;
  uniform float uDeformationRate;
  uniform float uLowerBulge;
  uniform float uAsymmetry;

  varying vec3 vWorldPosition;
  varying vec3 vSurfaceDirection;
  varying vec3 vContentLocalPosition;
  varying vec3 vWorldNormal;
  varying float vDeformation;

  mat2 rotate2d(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
  }

  void main() {
    float shaderTime = uTime;
    vec3 direction = normalize(position);

    vec2 alignedXY = rotate2d(-uShapeAngle) * direction.xy;
    vec3 alignedDirection = vec3(alignedXY, direction.z);
    vec3 shaped = alignedDirection * uRadii;
    shaped.xy = rotate2d(uShapeAngle) * shaped.xy;

    // Large latex moves as a few broad, heavy lobes. Low spatial frequencies
    // and slow phase changes avoid the rapid liquid-noise vibration that made
    // the previous preview feel too small and too light.
    float broadBulge =
      sin(direction.y * 3.2 + direction.x * 1.4 + shaderTime * (0.42 + uDeformationRate * 0.55)) *
      cos(direction.z * 2.7 - shaderTime * 0.28);
    float secondaryBulge =
      sin((direction.x + direction.z) * 4.6 - shaderTime * 0.68) *
      sin(direction.y * 2.4 + shaderTime * 0.34);
    float meanRadius = (uRadii.x + uRadii.y + uRadii.z) / 3.0;
    float lowerEnvelope = 1.0 - smoothstep(-0.75, 0.45, direction.y);
    float asymmetricLobe =
      sin(direction.x * 2.1 - direction.z * 2.8 + shaderTime * 0.31) *
      lowerEnvelope * uAsymmetry;
    float deformation =
      (broadBulge * 0.68 + secondaryBulge * 0.2 + asymmetricLobe * (0.04 + uLowerBulge * 0.14)) *
      uWobble * meanRadius * 0.13;
    vec3 deformed = shaped + direction * deformation;
    vContentLocalPosition = deformed;

    vec3 alignedNormal = normalize(alignedDirection / max(uRadii, vec3(0.01)));
    alignedNormal.xy = rotate2d(uShapeAngle) * alignedNormal.xy;

    vec4 worldPosition = modelMatrix * vec4(deformed, 1.0);
    vWorldPosition = worldPosition.xyz;
    // The procedural coordinate belongs to the envelope topology, not the
    // fabric rotation or an equirectangular texture. It therefore stretches
    // with the tracked ellipsoid without creating a longitude join.
    vSurfaceDirection = normalize(mat3(modelMatrix) * direction);
    vWorldNormal = normalize(mat3(modelMatrix) * alignedNormal);
    vDeformation = deformation;

    vec4 clip = projectionMatrix * viewMatrix * worldPosition;
    vec4 warped = uOutputWarp * clip;
    // Warp raster XY without changing camera depth or near/far clipping.
    gl_Position = vec4(warped.xy * clip.w / max(warped.w, 0.000001), clip.z, clip.w);
  }
`;

export const ORBITAL_SURFACE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uEnergy;
  uniform float uEstimatedOpacity;
  uniform float uSilhouetteEnabled;
  uniform vec2 uSilhouetteCenter;
  uniform sampler2D uSilhouetteRadii;
  uniform float uFullFrameArtworkTest;
  uniform float uTrackingFill;
  uniform float uBrightness;
  uniform float uDensity;
  uniform float uFluidity;
  uniform float uFracture;
  uniform float uGlitch;
  uniform float uOrganic;
  uniform float uMelody;
  uniform float uResidualGain;
  uniform vec3 uResidual;
  uniform float uTrackingConfidence;
  uniform float uStateValid;
  uniform float uPreviewExposure;
  uniform float uAngularPixelSpan;
  uniform vec3 uProjectorPositions[5];
  uniform vec3 uProjectorDirections[5];
  uniform vec3 uProjectorRights[5];
  uniform vec3 uProjectorUps[5];
  uniform vec3 uProjectorRaster[5]; // aspect, horizontal shift, vertical shift
  uniform float uProjectorCosHalfFov[5];
  uniform float uProjectorTanHalfFov[5];
  uniform float uProjectorLevels[5];
  uniform vec3 uProjectorColours[5];
  uniform vec4 uProjectorBlendEdges[5];
  uniform float uProjectorBlendGamma[5];
  uniform float uProjectorBlackLevels[5];
  uniform float uProjectorEnabled[5];
  uniform vec3 uRadii;
  uniform float uContentMotionEnabled;
  uniform float uContentMotionScale;
  uniform vec3 uContentMotionOffset;
  uniform float uOutputPreviewMode;
  uniform float uOutputPreviewProjector;
  uniform float uProjectionPattern;
  uniform float uShaderMode;
  uniform float uShaderSeed;
  uniform float uShaderParamA;
  uniform float uShaderParamB;
  uniform float uShaderParamC;
  uniform float uShaderParamD;
  uniform float uShaderParamE;
  uniform float uLookScale;
  uniform float uLookRotation;
  uniform float uLookHue;
  uniform float uLookSaturation;
  uniform float uLookContrast;
  uniform float uLookExposure;
  uniform float uLookBrightness;
  uniform float uLookShellGrid;
  uniform float uLookShellGridDensity;
  uniform float uLookShellGridWidth;
  uniform float uLookSoftness;
  uniform float uLookLevel;
  uniform float uMaterialReflectance;
  uniform float uMaterialTranslucency;
  uniform float uMaterialInternalBleed;
  uniform float uMaterialRoughness;
  uniform float uRegionCenters[4];
  uniform float uRegionWidths[4];
  uniform float uRegionStyles[4];
  uniform float uRegionIntensities[4];
  uniform float uLivingSkinsEnabled;
  uniform float uLivingSkinPatchCount;
  uniform float uLivingSkinVariety;
  uniform float uLivingSkinGlitch;
  uniform float uLivingSkinFlashRate;
  uniform float uLivingSkinSequenceMode;
  uniform float uLivingSkinEventHold;
  uniform float uLivingSkinAttackSharpness;
  uniform float uLivingSkinBreath;
  uniform float uLivingSkinEdgeSoftness;
  uniform float uLivingSkinBpm;
  uniform float uLivingSkinPhraseEvolution;
  uniform float uBeautyLighting;
  uniform float uSphereGlow;

  varying vec3 vWorldPosition;
  varying vec3 vSurfaceDirection;
  varying vec3 vContentLocalPosition;
  varying vec3 vWorldNormal;
  varying float vDeformation;

  const float PI = 3.141592653589793;
  const float TAU = 6.283185307179586;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  vec3 hash33(vec3 p) {
    return vec3(
      hash31(p + vec3(17.17, 4.13, 8.31)),
      hash31(p + vec3(3.71, 29.41, 11.73)),
      hash31(p + vec3(13.19, 7.97, 41.11))
    );
  }

  float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    float total = 0.0;
    float amplitude = 0.56;
    for (int i = 0; i < 4; i++) {
      total += valueNoise(p) * amplitude;
      p = p * 2.03 + vec3(1.7, 4.2, 2.8);
      amplitude *= 0.48;
    }
    return total;
  }

  mat2 rotate2d(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
  }

  float gridLine(float coordinate, float frequency, float width) {
    float distanceToLine = abs(fract(coordinate * frequency + 0.5) - 0.5);
    return 1.0 - smoothstep(width, width + 0.035, distanceToLine);
  }

  float seamlessGrid(vec3 p, float frequency, float width) {
    vec3 weights = pow(abs(p), vec3(4.0));
    weights /= max(weights.x + weights.y + weights.z, 0.0001);
    float xProjection = max(
      gridLine(p.y, frequency, width),
      gridLine(p.z, frequency, width)
    );
    float yProjection = max(
      gridLine(p.x, frequency, width),
      gridLine(p.z, frequency, width)
    );
    float zProjection = max(
      gridLine(p.x, frequency, width),
      gridLine(p.y, frequency, width)
    );
    return dot(vec3(xProjection, yProjection, zProjection), weights);
  }

  float hexDistance(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
  }

  float hexEdge2d(vec2 p) {
    vec2 lattice = vec2(1.0, 1.7320508);
    vec2 halfLattice = lattice * 0.5;
    vec2 a = mod(p, lattice) - halfLattice;
    vec2 b = mod(p - halfLattice, lattice) - halfLattice;
    vec2 cell = dot(a, a) < dot(b, b) ? a : b;
    return smoothstep(0.34, 0.48, hexDistance(cell));
  }

  float seamlessHex(vec3 p, float frequency) {
    vec3 weights = pow(abs(p), vec3(4.0));
    weights /= max(weights.x + weights.y + weights.z, 0.0001);
    return dot(
      vec3(
        hexEdge2d(p.yz * frequency),
        hexEdge2d(p.xz * frequency),
        hexEdge2d(p.xy * frequency)
      ),
      weights
    );
  }

  float truchetLine(vec2 p, float seed, float width) {
    vec2 cell = floor(p);
    vec2 local = fract(p) - 0.5;
    float flip = step(0.5, hash31(vec3(cell, seed)));
    vec2 firstCentre = mix(vec2(-0.5, -0.5), vec2(-0.5, 0.5), flip);
    vec2 secondCentre = -firstCentre;
    float firstArc = abs(length(local - firstCentre) - 0.5);
    float secondArc = abs(length(local - secondCentre) - 0.5);
    float arcDistance = min(firstArc, secondArc);
    return 1.0 - smoothstep(width, width + 0.045, arcDistance);
  }

  float cellular3(vec3 p, out float secondNearest) {
    vec3 base = floor(p);
    vec3 local = fract(p);
    float nearest = 10.0;
    secondNearest = 10.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 offset = vec3(float(x), float(y), float(z));
          vec3 point = offset + hash33(base + offset);
          float distanceToPoint = length(point - local);
          if (distanceToPoint < nearest) {
            secondNearest = nearest;
            nearest = distanceToPoint;
          } else if (distanceToPoint < secondNearest) {
            secondNearest = distanceToPoint;
          }
        }
      }
    }
    return nearest;
  }

  vec3 spectralPalette(float t) {
    return 0.5 + 0.5 * cos(TAU * (vec3(0.02, 0.34, 0.67) + t));
  }

  vec3 rotateHue(vec3 colour, float turns) {
    vec3 axis = normalize(vec3(1.0));
    float angle = turns * TAU;
    return colour * cos(angle) + cross(axis, colour) * sin(angle) +
      axis * dot(axis, colour) * (1.0 - cos(angle));
  }

  vec3 finishShaderColour(vec3 colour) {
    vec3 shifted = rotateHue(colour, uLookHue);
    float luminance = dot(shifted, vec3(0.2126, 0.7152, 0.0722));
    shifted = mix(vec3(luminance), shifted, uLookSaturation);
    // Power contrast around middle grey preserves exact black at every setting.
    // Contrast=1 is an identity, including existing HDR colours above one.
    shifted = vec3(0.18) * pow(max(shifted, vec3(0.0)) / 0.18, vec3(uLookContrast));
    return max(shifted, vec3(0.0)) * uLookLevel;
  }

  ${PROJECTION_COLOUR_GLSL}

  float digitalRainPlane(
    vec2 p,
    float time,
    float seed,
    float columns,
    float rows,
    float speed,
    float glyphDensity
  ) {
    float column = floor(p.x * columns);
    float columnSeed = hash31(vec3(column, seed, 4.0));
    float phase = fract(p.y * rows + time * speed + columnSeed * 7.0);
    float trail = 1.0 - smoothstep(0.16, 0.96, phase);
    float glyphWave = sin(
      (p.x * columns * 1.71 + p.y * rows * 2.37 + floor(phase * 9.0) + columnSeed * 11.0) * PI
    ) * 0.5 + 0.5;
    float glyph = step(mix(0.86, 0.56, glyphDensity), glyphWave);
    return glyph * trail;
  }

  // Geometry-locked shell: never use the translated/rotated contentPoint here.
  // Great-circle planes form meridians; equally spaced polar angles form parallels.
  // This avoids a UV seam and keeps the grid independent of the interior animation.
  float outerShellGrid(vec3 geometryDirection) {
    vec3 shell = normalize(geometryDirection);
    float halfCount = max(3.0, floor(uLookShellGridDensity * 0.5 + 0.5));
    float width = max(uLookShellGridWidth, 0.0001);
    float grid = 0.0;
    for (int line = 0; line < 20; line++) {
      float index = float(line);
      if (index < halfCount) {
        float angle = index * PI / halfCount;
        float meridianDistance = dot(shell.xz, vec2(cos(angle), sin(angle)));
        float meridianAA = max(fwidth(meridianDistance), 0.0005);
        grid = max(grid, 1.0 - smoothstep(width, width + meridianAA, abs(meridianDistance)));
      }
      if (index > 0.0 && index < halfCount) {
        float polarAngle = index * PI / halfCount;
        float parallelDistance = (shell.y - cos(polarAngle)) / max(sin(polarAngle), 0.05);
        float parallelAA = max(fwidth(parallelDistance), 0.0005);
        grid = max(grid, 1.0 - smoothstep(width, width + parallelAA, abs(parallelDistance)));
      }
    }
    return grid;
  }

  ${INTERIOR_LOOKS_GLSL}

  ${SQUIGGLE_LOOKS_GLSL}

  vec4 evaluateShader(
    float mode,
    vec3 p,
    float time,
    float seed,
    float controlA,
    float controlB,
    float controlC,
    float controlD,
    float controlE,
    float residualFault
  ) {
    // New looks bypass the generic multi-octave noise work entirely.
    if (mode > 47.5 && mode < 50.5) {
      return squiggleField(mode, p, time, seed, controlA, controlB, controlC, controlD, controlE);
    }
    if (mode > 42.5 && mode < 47.5) {
      if (mode < 43.5) return paintImpacts(p, time, seed, controlA, controlB, controlC, controlD, controlE);
      return imaginaryInterior(mode, p, time, seed, controlA, controlB, controlC, controlD, controlE);
    }
    // Native palette peaks carry vivid pigment. Coverage and scalar shading
    // remain independent; no per-pixel peak normalisation flattens the field.
    vec3 deepCyan = vec3(0.015, 0.72, 1.0);
    vec3 mineralBlue = vec3(0.055, 0.16, 1.0);
    vec3 warmLumen = vec3(1.0, 0.28, 0.035);
    vec3 brightCyan = vec3(0.06, 0.88, 1.0);
    vec3 darkBody = vec3(0.0025, 0.0032, 0.0042);

    float scale = mix(1.8, 9.0, controlA) * uLookScale;
    float speed = mix(0.08, 1.5, controlB);
    float contrast = mix(0.32, 1.0, controlC);
    float detail = mix(0.16, 0.94, controlD);
    float accent = clamp(controlE, 0.0, 1.0);
    vec3 seedOffset = vec3(seed * 97.0, seed * -41.0, seed * 23.0);
    vec3 moving = p * scale + seedOffset + vec3(time * speed * 0.05, -time * speed * 0.035, time * speed * 0.027);
    float field = fbm(moving);
    float signal = 0.0;
    vec3 colour = darkBody;

    if (mode < 0.5) {
      // A usable native projection texture, rather than the old dim standby
      // membrane. Keep the field's shadows and quiet cyan identity.
      signal = smoothstep(0.22, 0.66, field);
      colour = mix(vec3(0.015, 0.08, 0.14), vec3(0.06, 0.82, 1.0), signal);
    } else if (mode < 1.5) {
      float contour = abs(sin((field * 1.7 + dot(p, normalize(vec3(0.37, 0.82, -0.43)))) * mix(14.0, 42.0, controlA) * PI));
      contour = pow(contour, mix(24.0, 5.0, controlB));
      signal = contour * contrast;
      colour = mix(deepCyan, brightCyan, contour);
    } else if (mode < 2.5) {
      vec3 warp = vec3(
        fbm(moving + vec3(7.2, 1.4, 3.1)),
        fbm(moving + vec3(2.6, 9.1, 5.7)),
        fbm(moving + vec3(4.8, 3.3, 8.6))
      ) - 0.5;
      float membrane = fbm(moving + warp * mix(0.8, 3.2, detail));
      signal = smoothstep(0.28, 0.76, membrane) * contrast;
      colour = mix(deepCyan, mineralBlue, membrane);
      colour = mix(colour, brightCyan, pow(membrane, 4.0) * accent);
    } else if (mode < 3.5) {
      float waveA = sin(dot(p, normalize(vec3(0.81, 0.32, -0.49))) * scale * 7.0 + field * 5.0 + time * speed);
      float waveB = sin(dot(p, normalize(vec3(-0.28, 0.91, 0.31))) * scale * 8.5 - field * 4.0 - time * speed * 0.73);
      float waveC = sin(dot(p, normalize(vec3(0.44, -0.18, 0.88))) * scale * 5.7 + time * speed * 0.41);
      float caustic = pow(clamp(1.0 - abs(waveA + waveB + waveC) / 3.0, 0.0, 1.0), mix(8.0, 1.8, detail));
      signal = smoothstep(0.28, 0.9, caustic) * contrast;
      colour = mix(vec3(0.006, 0.055, 0.09), vec3(0.025, 0.9, 1.0), caustic);
    } else if (mode < 4.5) {
      float smoke = smoothstep(mix(0.58, 0.24, controlC), 0.8, field);
      signal = smoke * mix(0.5, 1.0, contrast);
      colour = mix(vec3(0.008, 0.018, 0.024), vec3(0.16, 0.5, 1.0), smoke);
    } else if (mode < 5.5) {
      vec3 flameP = p * scale + seedOffset + vec3(0.0, -time * speed * 0.48, 0.0);
      float flame = fbm(flameP + vec3(field * 1.7));
      float body = smoothstep(0.2, 0.68, flame) * smoothstep(-0.92, 0.72, p.y);
      float hot = smoothstep(0.48, 0.78, flame) * body;
      float sparkHash = hash31(floor((p + 1.0) * mix(18.0, 46.0, detail)) + floor(time * speed * 5.0));
      float sparks = step(mix(0.995, 0.94, accent), sparkHash);
      signal = clamp(body * 1.25 + sparks, 0.0, 1.0) * contrast;
      colour = mix(vec3(0.3, 0.006, 0.001), vec3(1.0, 0.16, 0.012), hot);
      colour = mix(colour, vec3(1.0, 0.64, 0.035), sparks);
    } else if (mode < 6.5) {
      vec3 weights = pow(abs(p), vec3(4.0));
      weights /= max(weights.x + weights.y + weights.z, 0.0001);
      float columns = mix(18.0, 58.0, controlA);
      float rows = mix(8.0, 24.0, detail);
      float rain = dot(
        vec3(
          digitalRainPlane(p.yz, time, seed, columns, rows, speed, detail),
          digitalRainPlane(p.xz, time, seed + 0.31, columns, rows, speed, detail),
          digitalRainPlane(p.xy, time, seed + 0.67, columns, rows, speed, detail)
        ),
        weights
      );
      signal = rain * max(contrast, 0.58);
      colour = mix(vec3(0.002, 0.03, 0.008), vec3(0.025, 1.0, 0.18), rain * max(accent, 0.45));
    } else if (mode < 7.5) {
      float secondCell = 0.0;
      float firstCell = cellular3(moving * 0.82, secondCell);
      float borderDistance = secondCell - firstCell;
      float cracks = 1.0 - smoothstep(0.02, mix(0.08, 0.2, detail), borderDistance);
      signal = max(residualFault, cracks * contrast);
      colour = mix(warmLumen, brightCyan, cracks * 0.72);
    } else if (mode < 8.5) {
      float secondParticle = 0.0;
      float particleDistance = cellular3(moving * mix(1.2, 2.8, detail), secondParticle);
      float particle = 1.0 - smoothstep(0.02, mix(0.08, 0.24, controlB), particleDistance);
      float alive = step(1.0 - mix(0.12, 0.64, controlA), hash31(floor(moving * 1.7)));
      signal = particle * alive * max(contrast, 0.52);
      colour = mix(mineralBlue, warmLumen, particle * alive);
    } else if (mode < 9.5) {
      float grid = seamlessGrid(p + vec3(time * speed * 0.006), mix(6.0, 24.0, controlA) * uLookScale, mix(0.012, 0.095, controlB));
      signal = grid * contrast;
      colour = mix(deepCyan, brightCyan, grid);
    } else if (mode < 10.5) {
      float atmosphere = smoothstep(0.04, 0.86, 1.0 - abs(p.y));
      float cloud = smoothstep(0.24, 0.8, field);
      float storm = fbm(moving * 0.58 + vec3(field * 2.0));
      signal = clamp(atmosphere * (0.32 + cloud * 0.48 + storm * 0.24) * contrast, 0.0, 1.0);
      colour = mix(mineralBlue, brightCyan, atmosphere * 0.68 + cloud * 0.28);
    } else if (mode < 11.5) {
      float residualBands = abs(sin((dot(p, normalize(vec3(0.72, -0.41, 0.56))) * mix(18.0, 48.0, controlA) + field * 2.0 + time * speed) * PI));
      residualBands = pow(residualBands, mix(18.0, 4.0, detail));
      signal = max(residualFault, residualBands * contrast);
      colour = mix(vec3(0.02, 0.18, 0.2), warmLumen, residualBands);
    } else if (mode < 12.5) {
      float width = mix(0.085, 0.018, controlB);
      float density = mix(1.0, 4.0, controlA) * uLookScale;
      float circleA = 1.0 - smoothstep(width, width * 1.8, abs(sin(dot(p, normalize(vec3(1.0, 0.0, 0.0))) * density * PI)));
      float circleB = 1.0 - smoothstep(width, width * 1.8, abs(sin(dot(p, normalize(vec3(0.0, 1.0, 0.0))) * density * PI)));
      float circleC = 1.0 - smoothstep(width, width * 1.8, abs(sin(dot(p, normalize(vec3(0.0, 0.0, 1.0))) * density * PI)));
      float circleD = 1.0 - smoothstep(width, width * 1.8, abs(sin(dot(p, normalize(vec3(0.577, 0.577, 0.577))) * density * PI)));
      float subdivision = seamlessGrid(p, mix(4.0, 10.0, detail) * uLookScale, 0.018) * accent;
      float wire = max(max(circleA, circleB), max(circleC, circleD));
      wire = max(wire, subdivision * 0.72);
      signal = wire * max(contrast, 0.6);
      colour = mix(vec3(0.008, 0.12, 0.16), vec3(0.035, 1.0, 0.64), wire);
    } else if (mode < 13.5) {
      vec3 warpedP = p + (vec3(field) - 0.5) * controlD * 0.2;
      float hex = seamlessHex(warpedP + vec3(time * speed * 0.01), mix(3.0, 11.0, controlA) * uLookScale);
      float fill = smoothstep(0.52, 0.82, fbm(moving * 0.62)) * accent;
      signal = clamp(hex * max(contrast, 0.62) + fill * 0.28, 0.0, 1.0);
      colour = mix(vec3(0.015, 0.12, 0.15), vec3(0.035, 0.82, 1.0), hex);
    } else if (mode < 14.5) {
      vec3 warp = vec3(
        fbm(moving + vec3(8.0, 1.0, 3.0)),
        fbm(moving + vec3(2.0, 7.0, 5.0)),
        fbm(moving + vec3(4.0, 3.0, 9.0))
      );
      float fold = abs(sin((fbm(moving + warp * mix(1.0, 3.6, detail)) * 4.0 + dot(p, normalize(vec3(0.4, 0.8, -0.35))) * 2.0) * PI));
      float highlight = pow(fold, mix(8.0, 2.0, controlC));
      signal = mix(fold * 0.36, highlight, max(accent, 0.28)) * contrast;
      colour = mix(vec3(0.012, 0.02, 0.025), vec3(0.92, 0.98, 1.0), highlight);
      colour = mix(colour, vec3(0.16, 0.38, 0.52), fold * (1.0 - highlight));
    } else if (mode < 15.5) {
      float secondLava = 0.0;
      float firstLava = cellular3(moving * 0.86, secondLava);
      float borderDistance = secondLava - firstLava;
      float cracks = 1.0 - smoothstep(0.015, mix(0.06, 0.2, accent), borderDistance);
      float molten = smoothstep(0.26, 0.76, field) * cracks;
      signal = clamp(cracks * mix(0.54, 1.0, detail) + molten * 0.48, 0.0, 1.0) * contrast;
      colour = mix(vec3(0.018, 0.006, 0.003), vec3(1.0, 0.08, 0.004), cracks);
      colour = mix(colour, vec3(1.0, 0.54, 0.025), molten * controlD);
    } else if (mode < 16.5) {
      float activator = fbm(moving + vec3(field * mix(0.8, 3.0, accent)));
      float inhibitor = fbm(moving * mix(1.35, 2.2, detail) - vec3(field * 1.4));
      float reaction = abs(activator - inhibitor * mix(0.55, 0.88, controlC));
      float target = mix(0.06, 0.34, controlC);
      float cells = 1.0 - smoothstep(mix(0.018, 0.09, detail), mix(0.08, 0.2, detail), abs(reaction - target));
      signal = cells * contrast;
      colour = mix(vec3(0.008, 0.04, 0.035), vec3(0.09, 1.0, 0.38), cells);
    } else if (mode < 17.5) {
      float secondVoronoi = 0.0;
      float firstVoronoi = cellular3(moving * mix(0.8, 1.5, accent), secondVoronoi);
      float borderDistance = secondVoronoi - firstVoronoi;
      float border = 1.0 - smoothstep(0.018, mix(0.08, 0.22, controlC), borderDistance);
      float fill = 1.0 - smoothstep(0.1, 0.7, firstVoronoi);
      signal = clamp(border * max(contrast, 0.6) + fill * controlD * 0.35, 0.0, 1.0);
      colour = mix(vec3(0.012, 0.07, 0.09), vec3(0.055, 1.0, 0.68), border);
      colour = mix(colour, deepCyan, fill * controlD);
    } else if (mode < 18.5) {
      float warp = fbm(moving * 0.72) * mix(2.0, 8.0, detail);
      float strata = sin((dot(p, normalize(vec3(0.32, 0.88, 0.35))) * scale * 2.4 + warp + time * speed * 0.18) * PI);
      float vein = 1.0 - smoothstep(mix(0.025, 0.16, controlC), mix(0.11, 0.28, controlC), abs(strata));
      float stone = smoothstep(0.2, 0.82, field);
      signal = clamp(vein * contrast + stone * 0.22, 0.0, 1.0);
      colour = mix(vec3(0.055, 0.07, 0.08), mix(vec3(1.0, 0.52, 0.18), vec3(0.08, 0.76, 1.0), accent), vein);
    } else if (mode < 19.5) {
      float secondCrystal = 0.0;
      float firstCrystal = cellular3(moving * 0.92, secondCrystal);
      float edge = 1.0 - smoothstep(0.018, mix(0.06, 0.16, controlD), secondCrystal - firstCrystal);
      float facet = hash31(floor(moving * 0.92));
      signal = clamp(facet * contrast * 0.58 + edge * accent, 0.0, 1.0);
      vec3 prism = spectralPalette(facet * 0.34 + controlE * 0.28);
      colour = mix(vec3(0.025, 0.055, 0.08), mix(vec3(0.06, 0.62, 1.0), prism, controlE), facet);
      colour = mix(colour, brightCyan, edge * controlD);
    } else if (mode < 20.5) {
      float warp = fbm(moving * 0.62) * mix(1.0, 4.5, detail);
      float ribbonA = abs(sin((dot(p, normalize(vec3(0.24, 0.91, 0.33))) * mix(6.0, 22.0, controlA) + warp + time * speed * 0.3) * PI));
      float ribbonB = abs(sin((dot(p, normalize(vec3(-0.61, 0.72, 0.31))) * mix(4.0, 16.0, controlA) - warp * 0.7 - time * speed * 0.2) * PI));
      float ribbon = pow(max(ribbonA, ribbonB), mix(9.0, 2.4, detail));
      float atmosphere = smoothstep(-0.92, 0.88, p.y);
      signal = ribbon * atmosphere * max(contrast, 0.52);
      colour = mix(vec3(0.015, 0.8, 0.58), vec3(0.63, 0.035, 1.0), clamp(accent + ribbon * 0.28, 0.0, 1.0));
    } else if (mode < 21.5) {
      float phase = fbm(moving * 0.7) * mix(2.0, 8.0, detail) + dot(p, normalize(vec3(0.48, 0.63, -0.61))) * scale + time * speed * 0.16;
      vec3 spectrum = spectralPalette(phase * mix(0.32, 1.2, controlC) + accent);
      // Author full-strength interference pigment before applying band relief.
      // A common gain preserves rainbow ratios, without adding a white sheen.
      spectrum /= max(max(spectrum.r, spectrum.g), spectrum.b);
      float bands = 0.5 + 0.5 * sin(phase * TAU);
      // Film covers the sphere brightly; stronger Bands adds gentle ripples
      // instead of multiplying the entire surface down towards black.
      signal = mix(1.0, mix(0.72, 1.0, bands), mix(0.28, 1.0, controlC));
      colour = spectrum;
    } else if (mode < 22.5) {
      float filamentA = 1.0 - smoothstep(0.025, mix(0.06, 0.18, detail), abs(fbm(moving) - 0.5));
      float filamentB = 1.0 - smoothstep(0.02, mix(0.05, 0.14, detail), abs(fbm(moving * 1.73 + vec3(9.0, 2.0, 4.0)) - 0.52));
      float pulse = 0.62 + 0.38 * sin(time * speed * 6.0 + field * 12.0);
      float spark = step(mix(0.997, 0.94, accent), hash31(floor(moving * 3.0) + floor(time * speed * 8.0)));
      float electric = max(filamentA, filamentB * detail) * pulse;
      signal = clamp(electric * max(contrast, 0.62) + spark, 0.0, 1.0);
      colour = mix(vec3(0.025, 0.055, 0.28), vec3(0.035, 0.64, 1.0), electric);
      colour = mix(colour, vec3(1.0, 0.055, 0.72), spark);
    } else if (mode < 23.5) {
      vec3 vortexP = p;
      float turn = time * speed * 0.12 + (1.0 - abs(p.y)) * mix(0.4, 2.8, accent) + field * 0.8;
      vortexP.xz = rotate2d(turn) * vortexP.xz;
      float cloudA = fbm(vortexP * scale + seedOffset);
      float cloudB = fbm(vortexP * scale * 1.78 - seedOffset * 0.31);
      float cloud = smoothstep(mix(0.68, 0.28, controlC), 0.86, cloudA * 0.68 + cloudB * 0.42);
      float eye = smoothstep(mix(0.08, 0.6, accent), mix(0.38, 0.86, accent), length(vortexP.xz));
      signal = cloud * eye * contrast;
      colour = mix(vec3(0.01, 0.025, 0.04), vec3(0.16, 0.6, 1.0), cloud);
    } else if (mode < 24.5) {
      float ridgeA = 1.0 - smoothstep(0.025, mix(0.07, 0.2, detail), abs(fbm(moving) - mix(0.42, 0.58, accent)));
      float ridgeB = 1.0 - smoothstep(0.018, mix(0.05, 0.14, detail), abs(fbm(moving * 1.86 + vec3(field * 2.0)) - 0.5));
      float network = max(ridgeA, ridgeB * controlC);
      float growth = smoothstep(0.18, 0.82, fbm(moving * 0.43 + vec3(time * speed * 0.08)));
      signal = network * growth * max(contrast, 0.56);
      colour = mix(vec3(0.006, 0.035, 0.026), vec3(0.055, 1.0, 0.38), network * max(accent, 0.3));
    } else if (mode < 25.5) {
      float swellA = sin(dot(p, normalize(vec3(0.82, 0.26, -0.51))) * scale * 2.8 + field * 3.4 + time * speed * 0.7);
      float swellB = sin(dot(p, normalize(vec3(-0.34, 0.91, 0.23))) * scale * 2.1 - field * 2.2 - time * speed * 0.46);
      float waveBody = clamp(0.5 + 0.26 * swellA + 0.24 * swellB, 0.0, 1.0);
      float crest = pow(waveBody, mix(8.0, 2.0, detail));
      float foamNoise = fbm(moving * 2.4 + vec3(time * speed * 0.16));
      float foam = crest * smoothstep(mix(0.76, 0.48, detail), 0.9, foamNoise);
      signal = clamp(crest * mix(0.5, 0.92, contrast) + foam * 0.7, 0.0, 1.0);
      colour = mix(vec3(0.002, 0.025, 0.065), vec3(0.015, 0.58, 1.0), waveBody * (1.0 - accent * 0.35));
      colour = mix(colour, vec3(0.08, 1.0, 0.88), foam);
    } else if (mode < 26.5) {
      vec3 inkWarp = vec3(
        fbm(moving * 0.72 + vec3(7.1, 1.3, 4.2)),
        fbm(moving * 0.68 + vec3(2.7, 8.4, 1.9)),
        fbm(moving * 0.76 + vec3(4.5, 2.1, 9.3))
      ) - 0.5;
      float inkA = fbm(moving * 0.76 + inkWarp * mix(1.4, 5.2, detail));
      float inkB = fbm(moving * 1.42 - inkWarp * mix(0.8, 3.2, detail));
      float pigment = smoothstep(mix(0.7, 0.34, controlC), 0.86, inkA * 0.72 + inkB * 0.38);
      float bloomEdge = 1.0 - smoothstep(0.025, mix(0.08, 0.22, detail), abs(inkA - inkB));
      signal = clamp(pigment * contrast + bloomEdge * 0.22, 0.0, 1.0);
      colour = mix(vec3(0.004, 0.008, 0.02), mix(vec3(0.025, 0.66, 1.0), vec3(0.82, 0.025, 1.0), accent), pigment);
      colour = mix(colour, vec3(0.86, 0.12, 1.0), bloomEdge * 0.32);
    } else if (mode < 27.5) {
      float radial = dot(p.xz, p.xz) + 0.16;
      float flux = p.y / radial + fbm(moving * 0.52) * mix(0.2, 1.4, detail);
      float fieldLines = pow(abs(sin((flux * mix(4.0, 14.0, controlA) + time * speed * 0.16) * PI)), mix(20.0, 4.0, detail));
      float poleGlow = pow(abs(p.y), mix(8.0, 2.2, controlC));
      signal = clamp(fieldLines * max(contrast, 0.58) + poleGlow * 0.24, 0.0, 1.0);
      vec3 negativePole = vec3(0.025, 0.48, 1.0);
      vec3 positivePole = vec3(1.0, 0.18, 0.025);
      colour = mix(negativePole, positivePole, smoothstep(-accent, max(accent, 0.01), p.y));
      colour = mix(vec3(0.003, 0.015, 0.028), colour, fieldLines + poleGlow * 0.3);
    } else if (mode < 28.5) {
      float frequency = mix(10.0, 42.0, controlA) * uLookScale;
      float phaseA = dot(p, normalize(vec3(0.79, 0.42, -0.44))) * frequency + field * detail * 4.0 + time * speed * 0.18;
      float phaseB = dot(p, normalize(vec3(-0.35, 0.86, 0.37))) * frequency * mix(0.92, 1.14, controlD) - field * detail * 3.0 - time * speed * 0.14;
      float lineA = pow(abs(sin(phaseA)), mix(24.0, 4.0, detail));
      float lineB = pow(abs(sin(phaseB)), mix(24.0, 4.0, detail));
      float moire = clamp(max(lineA, lineB) + abs(lineA - lineB) * controlD, 0.0, 1.0);
      signal = moire * max(contrast, 0.62);
      colour = mix(vec3(0.005, 0.045, 0.07), mix(vec3(0.025, 1.0, 0.66), vec3(0.72, 0.045, 1.0), accent), lineB);
    } else if (mode < 29.5) {
      float secondPlankton = 0.0;
      float planktonDistance = cellular3(moving * mix(1.4, 3.2, controlA), secondPlankton);
      float organism = 1.0 - smoothstep(0.018, mix(0.07, 0.18, detail), planktonDistance);
      float cluster = smoothstep(mix(0.72, 0.38, accent), 0.86, fbm(moving * 0.36));
      float organismSeed = hash31(floor(moving * 2.1));
      float pulse = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(time * speed * 5.0 + organismSeed * TAU), mix(6.0, 1.5, detail));
      float life = organism * mix(0.25, 1.0, cluster) * pulse;
      signal = life * max(contrast, 0.62);
      colour = mix(vec3(0.001, 0.018, 0.035), mix(vec3(0.025, 1.0, 0.52), vec3(0.025, 0.54, 1.0), organismSeed), life);
    } else if (mode < 30.5) {
      float secondBubble = 0.0;
      float firstBubble = cellular3(moving * mix(0.8, 1.7, controlA), secondBubble);
      float bubbleEdgeDistance = secondBubble - firstBubble;
      float bubbleRim = 1.0 - smoothstep(0.018, mix(0.06, 0.18, controlC), bubbleEdgeDistance);
      float bubbleFill = 1.0 - smoothstep(0.08, 0.66, firstBubble);
      float foamBank = smoothstep(mix(0.74, 0.3, accent), 0.86, field);
      signal = clamp(bubbleRim * max(contrast, 0.58) + bubbleFill * detail * 0.24, 0.0, 1.0) * mix(0.34, 1.0, foamBank);
      colour = mix(vec3(0.005, 0.08, 0.11), vec3(0.055, 1.0, 0.8), bubbleRim);
      colour = mix(colour, vec3(0.035, 0.62, 1.0), bubbleFill * detail);
    } else if (mode < 31.5) {
      float secondFrost = 0.0;
      float firstFrost = cellular3(moving * 0.9, secondFrost);
      float crystalEdge = 1.0 - smoothstep(0.015, mix(0.06, 0.17, controlD), secondFrost - firstFrost);
      float branchA = 1.0 - smoothstep(0.02, mix(0.08, 0.2, detail), abs(fbm(moving * 1.8) - 0.5));
      float branchB = 1.0 - smoothstep(0.02, mix(0.07, 0.16, detail), abs(fbm(moving * 3.1 + vec3(field)) - 0.52));
      float frostMask = smoothstep(mix(0.72, 0.28, accent), 0.88, field);
      float frost = max(crystalEdge, max(branchA, branchB * detail)) * frostMask;
      signal = frost * max(contrast, 0.6);
      colour = mix(vec3(0.008, 0.035, 0.07), vec3(0.055, 0.75, 1.0), frost);
      colour = mix(colour, vec3(0.52, 0.15, 1.0), crystalEdge * controlD);
    } else if (mode < 32.5) {
      vec3 weaveWeights = pow(abs(p), vec3(4.0));
      weaveWeights /= max(weaveWeights.x + weaveWeights.y + weaveWeights.z, 0.0001);
      float weaveFrequency = mix(18.0, 64.0, controlA) * uLookScale;
      float weaveWidth = mix(0.018, 0.07, detail);
      float weaveX = max(gridLine(p.y + field * 0.02, weaveFrequency, weaveWidth), gridLine(p.z - field * 0.02, weaveFrequency * 0.92, weaveWidth));
      float weaveY = max(gridLine(p.x - field * 0.02, weaveFrequency, weaveWidth), gridLine(p.z + field * 0.02, weaveFrequency * 0.92, weaveWidth));
      float weaveZ = max(gridLine(p.x + field * 0.02, weaveFrequency, weaveWidth), gridLine(p.y - field * 0.02, weaveFrequency * 0.92, weaveWidth));
      float weave = dot(vec3(weaveX, weaveY, weaveZ), weaveWeights);
      float fray = step(mix(0.995, 0.88, accent), hash31(floor(moving * 4.0))) * (1.0 - weave);
      signal = clamp(weave * max(contrast, 0.6) + fray * 0.48, 0.0, 1.0);
      colour = mix(vec3(0.018, 0.045, 0.052), vec3(0.12, 1.0, 0.56), weave);
      colour = mix(colour, warmLumen, fray * 0.35);
    } else if (mode < 33.5) {
      float terrain = fbm(moving * 0.68) + fbm(moving * 1.46) * detail * 0.28;
      float levels = fract(terrain * mix(8.0, 34.0, controlA));
      float contourDistance = min(levels, 1.0 - levels);
      float terrainLine = 1.0 - smoothstep(0.018, mix(0.045, 0.12, detail), contourDistance);
      float erosionField = fbm(moving * 2.3 + vec3(field * 3.0));
      float erosion = smoothstep(mix(0.74, 0.28, controlD), 0.88, erosionField);
      float pooled = smoothstep(0.56, 0.84, terrain) * accent;
      signal = clamp(terrainLine * mix(0.35, 1.0, erosion) * max(contrast, 0.6) + pooled * 0.18, 0.0, 1.0);
      colour = mix(vec3(0.012, 0.06, 0.055), mix(vec3(0.18, 1.0, 0.34), vec3(1.0, 0.42, 0.055), accent), terrain);
    } else if (mode < 34.5) {
      float nebulaA = fbm(moving * 0.46);
      float nebulaB = fbm(moving * 1.12 + vec3(nebulaA * 3.2));
      float nebula = smoothstep(mix(0.7, 0.3, controlC), 0.9, nebulaA * 0.66 + nebulaB * 0.46);
      float secondStar = 0.0;
      float starDistance = cellular3(moving * mix(2.4, 5.8, detail), secondStar);
      float starSeed = hash31(floor(moving * 4.2));
      float stars = (1.0 - smoothstep(0.008, 0.055, starDistance)) * step(mix(0.998, 0.91, detail), starSeed);
      signal = clamp(nebula * max(contrast, 0.46) + stars, 0.0, 1.0);
      vec3 nebulaColour = mix(vec3(0.055, 0.26, 1.0), vec3(1.0, 0.035, 0.68), accent);
      colour = mix(vec3(0.001, 0.003, 0.012), nebulaColour, nebula);
      colour = mix(colour, vec3(0.12, 0.76, 1.0), stars);
    } else if (mode < 35.5) {
      vec3 scanWeights = pow(abs(p), vec3(5.0));
      scanWeights /= max(scanWeights.x + scanWeights.y + scanWeights.z, 0.0001);
      float scanFrequency = mix(18.0, 72.0, controlA) * uLookScale;
      vec3 scanLines = vec3(
        gridLine(p.y + time * speed * 0.04, scanFrequency, mix(0.012, 0.055, detail)),
        gridLine(p.z - time * speed * 0.035, scanFrequency, mix(0.012, 0.055, detail)),
        gridLine(p.x + time * speed * 0.03, scanFrequency, mix(0.012, 0.055, detail))
      );
      float scan = dot(scanLines, scanWeights);
      float tear = step(mix(0.998, 0.86, detail), hash31(floor(moving * vec3(2.0, 18.0, 2.0)) + floor(time * speed * 5.0)));
      signal = clamp(scan * max(contrast, 0.58) + tear * 0.62, 0.0, 1.0);
      vec3 hologram = mix(vec3(0.025, 1.0, 0.8), spectralPalette(field + time * 0.04), accent);
      colour = mix(vec3(0.002, 0.022, 0.035), hologram, scan);
      colour = mix(colour, brightCyan, tear * 0.7);
    } else if (mode < 36.5) {
      float secondCoral = 0.0;
      float coralCell = cellular3(moving * 0.82, secondCoral);
      float coralRidge = 1.0 - smoothstep(0.025, mix(0.07, 0.2, detail), abs(fbm(moving * 1.36) - mix(0.42, 0.58, accent)));
      float coralBranches = 1.0 - smoothstep(0.018, mix(0.055, 0.16, detail), secondCoral - coralCell);
      float growthField = smoothstep(mix(0.7, 0.24, accent), 0.88, fbm(moving * 0.42 + vec3(time * speed * 0.08)));
      float coral = max(coralRidge, coralBranches * controlC) * growthField;
      signal = coral * max(contrast, 0.56);
      colour = mix(vec3(0.012, 0.035, 0.028), mix(vec3(1.0, 0.24, 0.12), vec3(0.08, 1.0, 0.5), accent), coral);
    } else if (mode < 37.5) {
      vec3 tunnelAxis = normalize(vec3(0.31, 0.86, -0.4));
      float tunnelAxial = dot(p, tunnelAxis);
      float tunnelRadius = length(cross(p, tunnelAxis));
      float tunnelWarp = fbm(moving * 0.46) * mix(0.3, 2.8, detail);
      float tunnelPhase = tunnelAxial * mix(8.0, 28.0, controlA) + tunnelWarp - time * speed * 1.8;
      float tunnelRing = pow(0.5 + 0.5 * cos(tunnelPhase * TAU), mix(9.0, 2.2, detail));
      float tunnelDepth = pow(clamp(1.0 - tunnelRadius, 0.0, 1.0), mix(1.2, 4.8, controlC));
      float secondStreak = 0.0;
      float streakDistance = cellular3(moving * mix(2.0, 5.2, detail), secondStreak);
      float streakSeed = hash31(floor(moving * 4.0));
      float streaks = (1.0 - smoothstep(0.01, 0.08, streakDistance)) * step(mix(0.998, 0.92, detail), streakSeed);
      signal = clamp(tunnelRing * mix(0.3, 1.0, tunnelDepth) * max(contrast, 0.52) + streaks, 0.0, 1.0);
      vec3 tunnelColour = mix(vec3(0.025, 0.4, 1.0), vec3(0.72, 0.045, 1.0), accent);
      colour = mix(vec3(0.001, 0.004, 0.018), tunnelColour, tunnelRing * mix(0.2, 0.92, tunnelDepth));
      colour = mix(colour, brightCyan, streaks);
    } else if (mode < 38.5) {
      vec3 kaleidoP = p * mix(2.6, 10.0, controlA);
      float kaleidoWarp = fbm(moving * 0.52) - 0.5;
      kaleidoP += vec3(kaleidoWarp) * mix(0.2, 2.4, detail);
      kaleidoP.xy = rotate2d(time * speed * 0.16 + seed * 2.0) * kaleidoP.xy;
      kaleidoP.yz = rotate2d(-time * speed * 0.11) * kaleidoP.yz;
      vec3 folded = abs(fract(kaleidoP) - 0.5);
      float foldDistance = min(folded.x, min(folded.y, folded.z));
      float foldEdge = 1.0 - smoothstep(mix(0.015, 0.1, controlC), mix(0.06, 0.2, controlC), foldDistance);
      float facetPhase = folded.x + folded.y * 1.37 + folded.z * 1.73 + time * speed * 0.12;
      float facets = 0.5 + 0.5 * sin(facetPhase * mix(8.0, 24.0, controlA));
      signal = clamp(foldEdge * max(contrast, 0.58) + facets * 0.18, 0.0, 1.0);
      vec3 kaleidoColour = spectralPalette(facetPhase * 0.26 + accent * 0.7);
      colour = mix(vec3(0.006, 0.012, 0.035), mix(deepCyan, kaleidoColour, accent), foldEdge * 0.84 + facets * 0.2);
    } else if (mode < 39.5) {
      vec3 circuitP = p * mix(1.8, 5.8, controlA) + seedOffset * 0.018;
      circuitP += vec3(time * speed * 0.026, -time * speed * 0.018, time * speed * 0.014);
      float circuit = 0.0;
      float circuitGlow = 0.0;
      float iterationWeight = 1.0;
      for (int circuitIndex = 0; circuitIndex < 5; circuitIndex++) {
        circuitP = abs(circuitP) / max(dot(circuitP, circuitP), 0.22) - vec3(mix(0.72, 1.08, detail));
        vec3 laneDistance = abs(fract(circuitP * vec3(1.7, 1.93, 2.17)) - 0.5);
        float nearestLane = min(laneDistance.x, min(laneDistance.y, laneDistance.z));
        float lane = 1.0 - smoothstep(mix(0.012, 0.075, controlC), mix(0.055, 0.16, controlC), nearestLane);
        circuit = max(circuit, lane * iterationWeight);
        circuitGlow += exp(-abs(length(circuitP) - 0.82) * 8.0) * iterationWeight;
        iterationWeight *= mix(0.42, 0.8, detail);
      }
      circuitGlow = clamp(circuitGlow * 0.36, 0.0, 1.0);
      signal = clamp(circuit * max(contrast, 0.58) + circuitGlow * accent * 0.42, 0.0, 1.0);
      vec3 circuitColour = mix(vec3(0.025, 1.0, 0.68), vec3(0.68, 0.055, 1.0), circuitGlow);
      colour = mix(vec3(0.001, 0.012, 0.018), circuitColour, circuit * 0.82 + circuitGlow * accent * 0.32);
    } else if (mode < 40.5) {
      vec3 singularityDirection = normalize(vec3(0.52, 0.34, 0.78));
      vec3 singularityTangent = normalize(cross(singularityDirection, vec3(0.0, 1.0, 0.0)));
      vec3 singularityBitangent = cross(singularityDirection, singularityTangent);
      vec2 singularityPlane = vec2(dot(p, singularityTangent), dot(p, singularityBitangent));
      singularityPlane = rotate2d(time * speed * 0.24) * singularityPlane;
      float angularDistance = length(p - singularityDirection);
      float coreRadius = mix(0.12, 0.36, controlA);
      float core = 1.0 - smoothstep(coreRadius, coreRadius + 0.08, angularDistance);
      float lensNoise = fbm(vec3(singularityPlane * mix(3.0, 8.0, detail), angularDistance * 3.0) + vec3(time * speed * 0.06));
      float haloRadius = coreRadius + mix(0.12, 0.3, detail) + (lensNoise - 0.5) * mix(0.02, 0.12, detail);
      float haloDistance = abs(angularDistance - haloRadius);
      float haloWidth = mix(0.035, 0.16, controlC);
      float halo = 1.0 - smoothstep(haloWidth, haloWidth + 0.075, haloDistance);
      float accretion = 0.5 + 0.5 * sin((singularityPlane.x * 8.0 + singularityPlane.y * 3.0 + lensNoise * 4.0) * PI);
      halo *= mix(0.36, 1.0, accretion);
      float diskDistance = abs(singularityPlane.y + (lensNoise - 0.5) * mix(0.04, 0.16, detail));
      float accretionDisk = 1.0 - smoothstep(0.035, mix(0.12, 0.3, detail), diskDistance);
      accretionDisk *= smoothstep(coreRadius + 0.02, coreRadius + 0.16, angularDistance);
      accretionDisk *= 1.0 - smoothstep(1.25, 1.82, angularDistance);
      float outerLens = pow(0.5 + 0.5 * cos((angularDistance * 8.0 - time * speed * 0.3) * PI), 7.0);
      outerLens *= smoothstep(coreRadius + 0.14, coreRadius + 0.34, angularDistance) * (1.0 - smoothstep(1.0, 1.6, angularDistance));
      signal = clamp((halo + accretionDisk * 0.58 + outerLens * 0.2) * max(contrast, 0.62) * (1.0 - core), 0.0, 1.0);
      vec3 accretionColour = mix(vec3(1.0, 0.26, 0.025), vec3(0.52, 0.055, 1.0), accent);
      colour = mix(vec3(0.001, 0.0015, 0.003), accretionColour, clamp(halo + accretionDisk * 0.46 + outerLens * 0.12, 0.0, 1.0) * (1.0 - core));
    } else if (mode < 41.5) {
      vec3 ringAxisA = normalize(vec3(0.22, 0.94, -0.26));
      vec3 ringAxisB = normalize(vec3(-0.82, 0.34, 0.46));
      float ringFrequency = mix(6.0, 28.0, controlA) * uLookScale;
      float ringWidth = mix(0.018, 0.13, controlC);
      float ringPhaseA = dot(p, ringAxisA) * ringFrequency + time * speed * 0.24;
      float ringPhaseB = dot(p, ringAxisB) * ringFrequency * 0.82 - time * speed * 0.18;
      float ringA = 1.0 - smoothstep(ringWidth, ringWidth + 0.05, abs(sin(ringPhaseA * PI)));
      float ringB = 1.0 - smoothstep(ringWidth, ringWidth + 0.05, abs(sin(ringPhaseB * PI)));
      float rings = max(ringA, ringB * detail);
      float ringGlow = pow(clamp(rings, 0.0, 1.0), mix(1.8, 0.72, accent));
      signal = ringGlow * max(contrast, 0.62);
      colour = mix(vec3(0.002, 0.035, 0.05), mix(vec3(0.025, 1.0, 0.64), brightCyan, accent), ringGlow);
    } else if (mode < 42.5) {
      vec3 truchetWeights = pow(abs(p), vec3(4.0));
      truchetWeights /= max(truchetWeights.x + truchetWeights.y + truchetWeights.z, 0.0001);
      float tileScale = mix(3.0, 13.0, controlA) * uLookScale;
      float tileWidth = mix(0.018, 0.12, controlC);
      float tileAngle = (detail - 0.5) * PI * 0.5;
      float tileDrift = time * speed * 0.12;
      float tileX = truchetLine(rotate2d(tileAngle) * (p.yz * tileScale + vec2(tileDrift, -tileDrift * 0.7)), seed, tileWidth);
      float tileY = truchetLine(rotate2d(-tileAngle * 0.83) * (p.xz * tileScale + vec2(-tileDrift * 0.6, tileDrift)), seed + 0.37, tileWidth);
      float tileZ = truchetLine(rotate2d(tileAngle * 1.17) * (p.xy * tileScale + vec2(tileDrift * 0.8, tileDrift * 0.5)), seed + 0.73, tileWidth);
      float tileLines = dot(vec3(tileX, tileY, tileZ), truchetWeights);
      float tileFill = smoothstep(0.52, 0.82, fbm(moving * 0.58)) * accent;
      signal = clamp(tileLines * max(contrast, 0.62) + tileFill * 0.2, 0.0, 1.0);
      colour = mix(vec3(0.004, 0.04, 0.045), vec3(0.04, 1.0, 0.62), tileLines);
      colour = mix(colour, vec3(0.035, 0.5, 1.0), tileFill * 0.46);
    } else {
      signal = smoothstep(0.28, 0.74, field) * 0.34;
      colour = mix(darkBody, vec3(0.02, 0.43, 0.62), signal);
    }

    return vec4(colour, clamp(signal, 0.0, 1.0));
  }

  void main() {
    if (uSilhouetteEnabled > 0.5) {
      vec2 delta = gl_FragCoord.xy - uSilhouetteCenter;
      float slot = fract(atan(delta.y, delta.x) / 6.28318530718 + 1.0) * 128.0;
      float index = floor(slot);
      float a = texture2D(uSilhouetteRadii, vec2((index + 0.5) / 128.0, 0.5)).r;
      float b = texture2D(uSilhouetteRadii, vec2((mod(index + 1.0, 128.0) + 0.5) / 128.0, 0.5)).r;
      if (length(delta) > mix(a, b, fract(slot))) discard;
    }
    float authoredTime = uTime;
    float authoredRotation = authoredTime * (0.018 + uFluidity * 0.06) + uLookRotation * TAU;
    vec3 direction = normalize(vSurfaceDirection);
    direction.xz = rotate2d(authoredRotation) * direction.xz;
    direction.xy = rotate2d(uLookRotation * TAU * 0.37) * direction.xy;

    // Content anchoring changes sampling only. Keep the sphere, projector masks,
    // region boundaries and normals on their original geometry coordinates.
    vec3 contentPoint = direction;
    if (uContentMotionEnabled > 0.5) {
      contentPoint = vContentLocalPosition * uContentMotionScale + uContentMotionOffset;
      contentPoint.xz = rotate2d(authoredRotation) * contentPoint.xz;
      contentPoint.xy = rotate2d(uLookRotation * TAU * 0.37) * contentPoint.xy;
    }

    float steppedTime = floor(authoredTime * (2.0 + uGlitch * 15.0)) /
      max(2.0, 2.0 + uGlitch * 15.0);
    vec3 baseSample = direction * mix(2.6, 6.4, uOrganic) + vec3(
      steppedTime * 0.08 * uGlitch,
      authoredTime * 0.09 * uFluidity,
      -authoredTime * 0.055 * uFluidity
    );
    float baseField = fbm(baseSample);

    vec3 residualDirection = normalize(uResidual + vec3(0.0001));
    float residualMagnitude = min(length(uResidual) * uResidualGain, 1.0);
    float residualPlane = abs(dot(direction, residualDirection));
    float residualFault = (1.0 - smoothstep(0.0, 0.13, residualPlane)) * residualMagnitude;

    float rigCoverage = 0.0;
    vec3 rigColour = vec3(0.0);
    float selectedOutputWeight = 0.0;
    float selectedOutputBlack = 0.0;
    for (int index = 0; index < 5; index++) {
      vec3 fromProjector = normalize(vWorldPosition - uProjectorPositions[index]);
      float forward = max(dot(fromProjector, uProjectorDirections[index]), 0.0001);
      float cone = smoothstep(
        uProjectorCosHalfFov[index] - 0.12,
        uProjectorCosHalfFov[index],
        forward
      );
      vec2 projectorPlane = vec2(
        dot(fromProjector, uProjectorRights[index]),
        dot(fromProjector, uProjectorUps[index])
      ) / max(forward * uProjectorTanHalfFov[index], 0.0001);
      // PerspectiveCamera uses vertical FOV and a rotated 10:16 portrait
      // raster. Keep the
      // feather-mask UVs identical to that camera projection so the blend mask
      // cannot cut a sphere that is otherwise fully inside its output frame.
      vec2 projectorUv = projectorPlane * vec2(0.5 / max(uProjectorRaster[index].x, 0.001), 0.5) + 0.5 + uProjectorRaster[index].yz * 0.5;
      vec4 edge = max(uProjectorBlendEdges[index], vec4(0.0001));
      float feather =
        smoothstep(0.0, edge.x, projectorUv.x) *
        smoothstep(0.0, edge.y, 1.0 - projectorUv.x) *
        smoothstep(0.0, edge.z, 1.0 - projectorUv.y) *
        smoothstep(0.0, edge.w, projectorUv.y);
      feather = pow(clamp(feather, 0.0, 1.0), max(uProjectorBlendGamma[index], 0.1));
      float incidence = max(dot(vWorldNormal, -fromProjector), 0.0);
      float contribution = cone * incidence * uProjectorLevels[index] *
        feather * uProjectorEnabled[index];
      if (abs(float(index) - uOutputPreviewProjector) < 0.25) {
        // This is the value written into the projector raster. Geometry is
        // already handled by rendering from that projector's camera, so the
        // output mask contains optical level and feathering, not a second
        // surface-incidence multiplication.
        selectedOutputWeight = feather * uProjectorLevels[index] * uProjectorEnabled[index];
        selectedOutputBlack = uProjectorBlackLevels[index];
      }
      rigCoverage += contribution;
      vec3 levelCorrected = max(
        uProjectorColours[index] - vec3(uProjectorBlackLevels[index]),
        vec3(0.0)
      );
      rigColour += levelCorrected * contribution;
    }
    rigCoverage = clamp(rigCoverage, 0.0, 1.0);
    rigColour /= max(rigCoverage, 0.0001);

    vec4 authored = evaluateShader(
      uShaderMode,
      contentPoint,
      authoredTime,
      uShaderSeed,
      clamp(uShaderParamA, 0.0, 1.0),
      clamp(uShaderParamB, 0.0, 1.0),
      clamp(uShaderParamC, 0.0, 1.0),
      clamp(uShaderParamD, 0.0, 1.0),
      clamp(uShaderParamE, 0.0, 1.0),
      residualFault
    );
    float coverage = authored.a;
    vec3 surfaceColour = authored.rgb;

    if (uProjectionPattern < 0.5) {
      float height = direction.y * 0.5 + 0.5;
      float regionWeight = 0.0;
      float regionStyle = 0.0;
      float regionIntensity = 0.0;
      for (int index = 0; index < 4; index++) {
        float distanceToBand = abs(height - uRegionCenters[index]);
        float bandWeight = 1.0 - smoothstep(
          uRegionWidths[index] * 0.42,
          uRegionWidths[index],
          distanceToBand
        );
        if (bandWeight > regionWeight) {
          regionWeight = bandWeight;
          regionStyle = uRegionStyles[index];
          regionIntensity = uRegionIntensities[index];
        }
      }
      vec4 regionSample = evaluateShader(
        regionStyle,
        contentPoint,
        authoredTime,
        uShaderSeed + regionStyle * 0.037,
        clamp(uShaderParamA, 0.0, 1.0),
        clamp(uShaderParamB, 0.0, 1.0),
        clamp(uShaderParamC, 0.0, 1.0),
        clamp(uShaderParamD, 0.0, 1.0),
        clamp(uShaderParamE, 0.0, 1.0),
        residualFault
      );
      float appliedRegion = regionWeight * clamp(regionIntensity, 0.0, 1.0);
      coverage = mix(coverage, max(coverage, regionSample.a), appliedRegion * 0.86);
      surfaceColour = mix(surfaceColour, regionSample.rgb, appliedRegion * 0.78);

      // Cinematic mosaic mode divides the continuous sphere into twelve
      // geometric cube-face quadrants. It remains separate from the selected
      // full-sphere shader used by the mapping test bench.
      if (uLivingSkinsEnabled > 0.5) {
        vec3 absoluteDirection = abs(direction);
        float faceId = 0.0;
        float splitCoordinate = direction.y;
        float faceBoundary = abs(absoluteDirection.x - absoluteDirection.z);
        if (absoluteDirection.y >= absoluteDirection.x && absoluteDirection.y >= absoluteDirection.z) {
          faceId = direction.y >= 0.0 ? 4.0 : 5.0;
          splitCoordinate = direction.x;
          faceBoundary = min(abs(absoluteDirection.y - absoluteDirection.x), abs(absoluteDirection.y - absoluteDirection.z));
        } else if (absoluteDirection.x >= absoluteDirection.z) {
          faceId = direction.x >= 0.0 ? 0.0 : 1.0;
          splitCoordinate = direction.z;
          faceBoundary = min(abs(absoluteDirection.x - absoluteDirection.y), abs(absoluteDirection.x - absoluteDirection.z));
        } else {
          faceId = direction.z >= 0.0 ? 2.0 : 3.0;
          splitCoordinate = direction.x;
          faceBoundary = min(abs(absoluteDirection.z - absoluteDirection.x), abs(absoluteDirection.z - absoluteDirection.y));
        }
        float beat = authoredTime * uLivingSkinBpm / 60.0;
        float bar = floor(beat / 4.0);
        float beatInBar = beat - bar * 4.0;
        float barInPhrase = mod(bar, 16.0);
        float phraseProgress = barInPhrase + beatInBar / 4.0;
        float authoredPhraseEnergy = 0.16;
        if (barInPhrase < 4.0) authoredPhraseEnergy = mix(0.35, 0.75, phraseProgress / 4.0);
        else if (barInPhrase < 5.0) authoredPhraseEnergy = 0.28;
        else if (barInPhrase < 8.0) authoredPhraseEnergy = mix(0.58, 0.95, (phraseProgress - 5.0) / 3.0);
        else if (barInPhrase < 9.0) authoredPhraseEnergy = 0.38;
        else if (barInPhrase < 12.0) authoredPhraseEnergy = mix(0.58, 1.0, (phraseProgress - 9.0) / 3.0);
        else if (barInPhrase < 13.0) authoredPhraseEnergy = 1.08;
        else if (barInPhrase < 14.0) authoredPhraseEnergy = 0.88;
        else if (barInPhrase < 15.0) authoredPhraseEnergy = 0.5;
        float phraseEnergy = mix(1.0, authoredPhraseEnergy, uLivingSkinPhraseEvolution);
        float subdivision = uLivingSkinFlashRate < 0.22 ? 0.25 :
          uLivingSkinFlashRate < 0.48 ? 0.5 :
          uLivingSkinFlashRate < 0.72 ? 1.0 :
          uLivingSkinFlashRate < 0.9 ? 2.0 : 4.0;
        float eventClock = beat * subdivision;
        float globalFlashStep = floor(eventClock);
        float geometryStyle = mod(globalFlashStep, 7.0);
        float horizontalSlices = floor((direction.y * 0.5 + 0.5) * mix(3.0, 11.0, uLivingSkinVariety));
        float verticalSlices = floor((direction.x * 0.5 + 0.5) * mix(5.0, 14.0, uLivingSkinVariety)) +
          floor((direction.z * 0.5 + 0.5) * mix(3.0, 9.0, uLivingSkinVariety)) * 17.0;
        vec2 cubeUv = vec2(splitCoordinate, direction.y) / max(max(absoluteDirection.x, absoluteDirection.z), 0.08);
        vec2 tileCell = floor((cubeUv * 0.5 + 0.5) * mix(3.0, 9.0, uLivingSkinVariety));
        float cornerId = floor((direction.x + 1.0) * 1.5) + floor((direction.y + 1.0) * 1.5) * 3.0 + floor((direction.z + 1.0) * 1.5) * 9.0;
        float lineId = floor((direction.x * 0.7 + direction.y * 1.2 + direction.z * 0.35 + 2.2) * 8.0);
        float wedgeId = floor((dot(direction, normalize(vec3(1.0, 0.72, -0.38))) + 1.5) * 6.0) +
          floor((dot(direction, normalize(vec3(-0.34, 0.52, 1.0))) + 1.5) * 5.0) * 19.0;
        float geometricId = faceId * 2.0 + step(0.0, splitCoordinate);
        if (geometryStyle < 1.0) geometricId = horizontalSlices;
        else if (geometryStyle < 2.0) geometricId = verticalSlices;
        else if (geometryStyle < 3.0) geometricId = tileCell.x + tileCell.y * 9.0 + faceId * 81.0;
        else if (geometryStyle < 4.0) geometricId = cornerId;
        else if (geometryStyle < 5.0) geometricId = lineId;
        else if (geometryStyle < 6.0) geometricId = wedgeId;
        float panelId = mod(geometricId, 12.0);
        float rhythmSeed = panelId * 17.17 + bar * 41.73 + uShaderSeed * 7.91;
        float durationHash = hash31(vec3(rhythmSeed, 12.9898, 78.233));
        float variedDuration = durationHash < 0.12 ? 0.125 :
          durationHash < 0.27 ? 0.25 :
          durationHash < 0.48 ? 0.5 :
          durationHash < 0.70 ? 1.0 :
          durationHash < 0.86 ? 2.0 : 4.0;
        float variationGate = step(hash31(vec3(rhythmSeed + 19.4, 4.17, 9.31)), uLivingSkinEventHold);
        float holdDuration = mix(0.5, variedDuration, variationGate);
        float offsetGate = step(hash31(vec3(rhythmSeed + 37.1, 2.9, 17.4)), uLivingSkinEventHold) * step(holdDuration, 1.001);
        float offsetBeats = floor(hash31(vec3(rhythmSeed + 61.2, 8.3, 3.7)) * 8.0) * 0.125 * offsetGate;
        float regionClock = (beatInBar + offsetBeats) / holdDuration;
        float flashStep = bar * 32.0 + floor(regionClock);
        float eventPhase = fract(regionClock);
        float enabledPanels = clamp(uLivingSkinPatchCount * mix(0.42, 1.12, phraseEnergy), 2.0, 12.0);
        float panelEnabled = 1.0 - step(enabledPanels - 0.5, panelId);
        float evolvingStep = floor(flashStep * mix(0.0, 1.0, uLivingSkinVariety));
        float styleHash = hash31(vec3(panelId * 4.7, uShaderSeed * 31.0, 12.6 + evolvingStep));
        float style = floor(mix(1.0, 42.99, mix(0.18, 1.0, uLivingSkinVariety) * styleHash));
        float patternIndex = mod(flashStep, 16.0);
        float euclideanGate = max(step(0.5, mod(patternIndex, 3.0)), 1.0 - step(0.5, mod(patternIndex, 5.0)));
        float sequenceGate = mix(1.0, euclideanGate, uLivingSkinGlitch);
        if (uLivingSkinSequenceMode > 0.5 && uLivingSkinSequenceMode < 1.5) {
          float cascadeHead = mod(flashStep, enabledPanels);
          float cascadeDistance = mod(cascadeHead - panelId + enabledPanels, enabledPanels);
          sequenceGate *= 1.0 - step(mix(1.0, 4.0, uLivingSkinEventHold), cascadeDistance);
        } else if (uLivingSkinSequenceMode >= 1.5 && uLivingSkinSequenceMode < 2.5) {
          float activeFace = mod(floor(flashStep), 6.0);
          sequenceGate *= 1.0 - step(0.5, abs(floor(panelId * 0.5) - activeFace));
        } else if (uLivingSkinSequenceMode >= 2.5 && uLivingSkinSequenceMode < 3.5) {
          float eruptionProgress = fract(regionClock * mix(0.08, 0.24, uLivingSkinEventHold));
          sequenceGate *= 1.0 - step(eruptionProgress * enabledPanels, panelId);
        } else if (uLivingSkinSequenceMode >= 3.5) {
          sequenceGate = 1.0;
        }
        float attackTime = mix(0.28, 0.018, uLivingSkinAttackSharpness);
        float releaseStart = mix(0.16, 0.94, uLivingSkinEventHold);
        float eventEnvelope = smoothstep(0.0, attackTime, eventPhase) *
          (1.0 - smoothstep(releaseStart, 1.0, eventPhase));
        if (uLivingSkinSequenceMode >= 3.5) eventEnvelope = 1.0;
        float breathing = 0.78 + 0.22 * sin(authoredTime * mix(0.2, 0.8, uLivingSkinBreath) + panelId * 1.73);
        float sliceEdge = min(
          fract((direction.y * 0.5 + 0.5) * 9.0),
          min(fract((direction.x * 0.5 + 0.5) * 12.0), fract((direction.z * 0.5 + 0.5) * 12.0))
        );
        float tileEdge = min(fract((cubeUv.x * 0.5 + 0.5) * 7.0), fract((cubeUv.y * 0.5 + 0.5) * 7.0));
        float edgeDistance = geometryStyle < 2.0 ? sliceEdge : geometryStyle < 3.0 ? tileEdge : min(abs(splitCoordinate), faceBoundary);
        float edgeMask = smoothstep(0.002, mix(0.015, 0.14, uLivingSkinEdgeSoftness), edgeDistance);
        float panelWeight = panelEnabled * sequenceGate * eventEnvelope * mix(1.0, breathing, uLivingSkinBreath) * edgeMask * mix(0.38, 1.08, phraseEnergy);
        vec4 panelSkin = evaluateShader(style, contentPoint, authoredTime, styleHash,
          clamp(uShaderParamA, 0.0, 1.0), clamp(uShaderParamB, 0.0, 1.0),
          clamp(uShaderParamC, 0.0, 1.0), clamp(uShaderParamD, 0.0, 1.0),
          clamp(uShaderParamE, 0.0, 1.0), residualFault);
        surfaceColour = mix(surfaceColour * 0.12, panelSkin.rgb, panelWeight);
        coverage = max(coverage * 0.18, panelSkin.a * panelWeight);
      }
      coverage = pow(clamp(coverage, 0.0, 1.0), mix(1.6, 0.4, uLookSoftness));
      // Composite the real envelope grid OVER the imaginary interior, including
      // empty black cavity pixels. Coverage and premultiplied radiance agree.
      if (uShaderMode > 43.5 && uShaderMode < 47.5 && uLookShellGrid > 0.0) {
        float shellCoverage = outerShellGrid(vSurfaceDirection) * clamp(uLookShellGrid, 0.0, 1.0);
        vec3 shellColour = vec3(0.04, 0.60, 1.0);
        float combinedCoverage = shellCoverage + coverage * (1.0 - shellCoverage);
        vec3 combinedRadiance = shellColour * shellCoverage + surfaceColour * coverage * (1.0 - shellCoverage);
        surfaceColour = combinedRadiance / max(combinedCoverage, 0.00001);
        coverage = combinedCoverage;
      }
    } else if (uProjectionPattern < 1.5) {
      float coverageRisk = smoothstep(0.0, 0.46, rigCoverage);
      float overlapSafe = smoothstep(0.46, 0.82, rigCoverage);
      coverage = 1.0;
      surfaceColour = mix(vec3(0.95, 0.04, 0.025), vec3(1.0, 0.58, 0.04), coverageRisk);
      surfaceColour = mix(surfaceColour, vec3(0.08, 0.92, 0.48), overlapSafe);
    } else if (uProjectionPattern < 2.5) {
      float mappingGrid = seamlessGrid(direction, 12.0, 0.018);
      coverage = clamp(mappingGrid * 0.86 + rigCoverage * 0.42, 0.0, 1.0);
      surfaceColour = mix(vec3(0.02, 0.38, 0.5), rigColour, rigCoverage * 0.5);
    } else if (uProjectionPattern < 3.5) {
      float stressGrid = seamlessGrid(direction, 20.0, 0.012);
      float xAxis = 1.0 - smoothstep(0.008, 0.028, abs(direction.x));
      float yAxis = 1.0 - smoothstep(0.008, 0.028, abs(direction.y));
      float zAxis = 1.0 - smoothstep(0.008, 0.028, abs(direction.z));
      vec3 axisColour = vec3(xAxis, yAxis, zAxis);
      float axes = max(xAxis, max(yAxis, zAxis));
      coverage = max(stressGrid * 0.72, axes);
      surfaceColour = mix(vec3(0.04, 0.38, 0.46), axisColour, axes);
    } else {
      coverage = 0.0;
      surfaceColour = vec3(0.0);
    }

    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 beautyNormal = normalize(vWorldNormal);
    vec3 beautyLight = normalize(vec3(-0.48, 0.72, 0.5));
    vec3 beautyHalf = normalize(beautyLight + viewDirection);
    float beautyDiffuse = max(dot(beautyNormal, beautyLight), 0.0);
    float beautySpecular = pow(max(dot(beautyNormal, beautyHalf), 0.0), mix(18.0, 92.0, 1.0 - uMaterialRoughness));
    float beautyFresnel = pow(1.0 - max(dot(beautyNormal, viewDirection), 0.0), 5.0);
    // The artwork is emitted colour. Beauty highlights carry that pigment,
    // rather than adding white/cyan light over every coloured patch.
    vec3 highlightPigment = surfaceColour;
    surfaceColour *= mix(1.0, 0.82 + beautyDiffuse * 0.18, uBeautyLighting);
    surfaceColour += highlightPigment *
      (beautySpecular * 0.15 + beautyFresnel * 0.06) * uBeautyLighting;
    surfaceColour += highlightPigment * (0.06 + coverage * 0.08) * uSphereGlow;
    float trackingLight = mix(0.18, 1.0, uTrackingConfidence) * mix(0.3, 1.0, uStateValid);
    // The design preview shows native colour; tracking quality is reported by
    // the HUD. Physical rasters retain confidence, feather and optical masks.
    float confidence = uOutputPreviewMode > 0.5 ? trackingLight : 1.0;
    float outputMask = uOutputPreviewMode > 1.5 ? selectedOutputWeight : 1.0;
    float projectedLight = uFullFrameArtworkTest > 0.5 ? 1.0 : clamp(coverage, 0.0, 1.0) * confidence * outputMask;
    // Native pigments are authored in display sRGB. Decode once into linear
    // light, then apply geometric masks once. ACES remains on the room, but
    // never photographs this artwork or turns bright pigments into white.
    vec3 pigment = uProjectionPattern < 0.5 ? finishShaderColour(surfaceColour) : surfaceColour;
    vec3 emittedLight = uProjectionPattern < 0.5
      ? nativeProjectionLight(pigment)
      : sRGBTransferEOTF(vec4(limitProjectionChroma(pigment), 1.0)).rgb;
    vec3 colour = emittedLight;
    if (uOutputPreviewMode > 0.5) {
      if (uOutputPreviewMode > 1.5) colour = max(colour - vec3(selectedOutputBlack), vec3(0.0));
      colour *= projectedLight;
    } else {
      // Optional illustrative material response, always a scalar. It never
      // mixes pigment with grey/white, and never affects the physical raster.
      float reflectedGain = uMaterialReflectance * (1.0 - 0.35 * uMaterialTranslucency);
      float bleedGain = 0.25 * uMaterialTranslucency * uMaterialInternalBleed;
      float materialGain = clamp(reflectedGain + bleedGain, 0.0, 1.0);
      colour *= projectedLight * uPreviewExposure * mix(1.0, materialGain, clamp(uBeautyLighting, 0.0, 1.0));
    }
    if (uOutputPreviewMode > 1.5) colour = max(colour, vec3(uTrackingFill));
    gl_FragColor = vec4(colour * uEstimatedOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createOrbitalSurfaceMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name: "OrbitalProjectedSurface",
    vertexShader: ORBITAL_SURFACE_VERTEX_SHADER,
    fragmentShader: ORBITAL_SURFACE_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uContentMotionEnabled: { value: 0 },
      uContentMotionScale: { value: 1 },
      uContentMotionOffset: { value: new THREE.Vector3() },
      uCenter: { value: new THREE.Vector3(0, 3.35, 0) },
      uRadii: { value: new THREE.Vector3(2.5, 2.5, 2.5) },
      uShapeAngle: { value: 0 },
      uWobble: { value: 0 },
      uDeformationRate: { value: 0 },
      uLowerBulge: { value: 0.68 },
      uAsymmetry: { value: 0.62 },
      uEnergy: { value: 0.3 },
      uEstimatedOpacity: { value: 1 },
      uSilhouetteEnabled: { value: 0 },
      uSilhouetteCenter: { value: new THREE.Vector2() },
      uSilhouetteRadii: { value: null },
      uFullFrameArtworkTest: { value: 0 },
      uTrackingFill: { value: 0 },
      uBrightness: { value: 0.4 },
      uDensity: { value: 0.2 },
      uFluidity: { value: 0.45 },
      uFracture: { value: 0.08 },
      uGlitch: { value: 0.03 },
      uOrganic: { value: 0.55 },
      uMelody: { value: 0.15 },
      uResidualGain: { value: 0.5 },
      uResidual: { value: new THREE.Vector3() },
      uTrackingConfidence: { value: 1 },
      uStateValid: { value: 1 },
      uPreviewExposure: { value: 1 },
      uAngularPixelSpan: { value: 2 * Math.tan(Math.PI / 8) / 1080 },
      uProjectorPositions: {
        value: Array.from({ length: 5 }, () => new THREE.Vector3()),
      },
      uProjectorDirections: {
        value: Array.from({ length: 5 }, () => new THREE.Vector3(0, -1, 0)),
      },
      uProjectorRights: {
        value: Array.from({ length: 5 }, () => new THREE.Vector3(1, 0, 0)),
      },
      uProjectorUps: {
        value: Array.from({ length: 5 }, () => new THREE.Vector3(0, 1, 0)),
      },
      uProjectorRaster: { value: Array.from({ length: 5 }, () => new THREE.Vector3(0.625, 0, 0)) },
      uProjectorCosHalfFov: { value: new Float32Array(5) },
      uProjectorTanHalfFov: { value: new Float32Array(5) },
      uProjectorLevels: { value: new Float32Array(5) },
      uProjectorColours: {
        value: Array.from({ length: 5 }, () => new THREE.Color(0xffffff)),
      },
      uProjectorBlendEdges: {
        value: Array.from({ length: 5 }, () => new THREE.Vector4(0.1, 0.1, 0.1, 0.1)),
      },
      uProjectorBlendGamma: { value: new Float32Array(5) },
      uProjectorBlackLevels: { value: new Float32Array(5) },
      uProjectorEnabled: { value: new Float32Array(5) },
      uOutputWarp: { value: new THREE.Matrix4() },
      uOutputPreviewMode: { value: 0 },
      uOutputPreviewProjector: { value: 0 },
      uProjectionPattern: { value: 0 },
      uShaderMode: { value: 0 },
      uShaderSeed: { value: 0 },
      uShaderParamA: { value: 0.5 },
      uShaderParamB: { value: 0.5 },
      uShaderParamC: { value: 0.5 },
      uShaderParamD: { value: 0.5 },
      uShaderParamE: { value: 0.5 },
      uLookScale: { value: DEFAULT_SHADER_LOOK_CONTROLS.scale },
      uLookRotation: { value: DEFAULT_SHADER_LOOK_CONTROLS.rotation },
      uLookHue: { value: DEFAULT_SHADER_LOOK_CONTROLS.hue },
      uLookSaturation: { value: DEFAULT_SHADER_LOOK_CONTROLS.saturation },
      uLookContrast: { value: DEFAULT_SHADER_LOOK_CONTROLS.contrast },
      uLookExposure: { value: DEFAULT_SHADER_LOOK_CONTROLS.exposure },
      uLookBrightness: { value: DEFAULT_SHADER_LOOK_CONTROLS.brightness },
      uLookShellGrid: { value: DEFAULT_SHADER_LOOK_CONTROLS.shellGrid },
      uLookShellGridDensity: { value: DEFAULT_SHADER_LOOK_CONTROLS.shellGridDensity },
      uLookShellGridWidth: { value: DEFAULT_SHADER_LOOK_CONTROLS.shellGridWidth },
      uLookSoftness: { value: DEFAULT_SHADER_LOOK_CONTROLS.softness },
      uLookLevel: { value: DEFAULT_SHADER_LOOK_CONTROLS.level },
      uMaterialReflectance: { value: 0.82 },
      uMaterialTranslucency: { value: 0.34 },
      uMaterialInternalBleed: { value: 0.28 },
      uMaterialRoughness: { value: 0.58 },
      uRegionCenters: { value: new Float32Array(4) },
      uRegionWidths: { value: new Float32Array(4) },
      uRegionStyles: { value: new Float32Array(4) },
      uRegionIntensities: { value: new Float32Array(4) },
      uLivingSkinsEnabled: { value: 0 },
      uLivingSkinPatchCount: { value: 9 },
      uLivingSkinVariety: { value: 0.78 },
      uLivingSkinGlitch: { value: 0.34 },
      uLivingSkinFlashRate: { value: 0.58 },
      uLivingSkinSequenceMode: { value: 3 },
      uLivingSkinEventHold: { value: 0.46 },
      uLivingSkinAttackSharpness: { value: 0.72 },
      uLivingSkinBreath: { value: 0.66 },
      uLivingSkinEdgeSoftness: { value: 0.42 },
      uLivingSkinBpm: { value: 112 },
      uLivingSkinPhraseEvolution: { value: 0.82 },
      uBeautyLighting: { value: 0 },
      uSphereGlow: { value: 0 },
    },
    side: THREE.FrontSide,
    // Bounded native artwork owns its colour signal; only the room uses ACES.
    toneMapped: false,
  });
  const viewport = new THREE.Vector4();
  material.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getCurrentViewport(viewport);
    const span = 2 / (Math.max(1, viewport.w) * Math.max(0.0001, Math.abs(camera.projectionMatrix.elements[5])));
    if (material.uniforms.uAngularPixelSpan.value !== span) {
      material.uniforms.uAngularPixelSpan.value = span;
      material.uniformsNeedUpdate = true;
    }
  };
  return material;
}

export function setOrbitalSurfaceLookControls(
  material: THREE.ShaderMaterial,
  controls: Partial<ShaderLookControls>,
): ShaderLookControls {
  const resolved = normaliseShaderLookControls(controls);
  material.uniforms.uLookScale.value = resolved.scale;
  material.uniforms.uLookRotation.value = resolved.rotation;
  material.uniforms.uLookHue.value = resolved.hue;
  material.uniforms.uLookSaturation.value = resolved.saturation;
  material.uniforms.uLookContrast.value = resolved.contrast;
  material.uniforms.uLookExposure.value = resolved.exposure;
  material.uniforms.uLookBrightness.value = resolved.brightness;
  material.uniforms.uLookShellGrid.value = resolved.shellGrid;
  material.uniforms.uLookShellGridDensity.value = resolved.shellGridDensity;
  material.uniforms.uLookShellGridWidth.value = resolved.shellGridWidth;
  material.uniforms.uLookSoftness.value = resolved.softness;
  material.uniforms.uLookLevel.value = resolved.level;
  return resolved;
}

export function updateOrbitalSurfaceMaterial(
  material: THREE.ShaderMaterial,
  state: OrbitalSurfaceState,
): void {
  material.uniforms.uTime.value = state.timeS;
  (material.uniforms.uCenter.value as THREE.Vector3).copy(state.centerM);
  (material.uniforms.uRadii.value as THREE.Vector3).copy(state.radiiM);
  material.uniforms.uShapeAngle.value = state.principalAxisRad;
  material.uniforms.uWobble.value = state.wobble;
  material.uniforms.uDeformationRate.value = state.deformationRate;
  material.uniforms.uEnergy.value = state.energy;
  material.uniforms.uBrightness.value = state.brightness;
  material.uniforms.uDensity.value = state.visualDensity;
  material.uniforms.uFluidity.value = state.fluidity;
  material.uniforms.uFracture.value = state.fracture;
  material.uniforms.uGlitch.value = state.glitch;
  material.uniforms.uOrganic.value = state.organic;
  material.uniforms.uMelody.value = state.melody;
  material.uniforms.uResidualGain.value = state.residualGain;
  (material.uniforms.uResidual.value as THREE.Vector3).copy(state.residualM);
  material.uniforms.uTrackingConfidence.value = state.trackingConfidence;
  material.uniforms.uStateValid.value = state.stateValid ? 1 : 0;
  const regionCenters = material.uniforms.uRegionCenters.value as Float32Array;
  const regionWidths = material.uniforms.uRegionWidths.value as Float32Array;
  const regionStyles = material.uniforms.uRegionStyles.value as Float32Array;
  const regionIntensities = material.uniforms.uRegionIntensities.value as Float32Array;
  for (let index = 0; index < 4; index += 1) {
    regionCenters[index] = state.regionCenters[index] ?? 0.5;
    regionWidths[index] = state.regionWidths[index] ?? 0.25;
    regionStyles[index] = state.regionStyles[index] ?? 0;
    regionIntensities[index] = state.regionIntensities[index] ?? 0;
  }

  const positions = material.uniforms.uProjectorPositions.value as THREE.Vector3[];
  const directions = material.uniforms.uProjectorDirections.value as THREE.Vector3[];
  const rights = material.uniforms.uProjectorRights.value as THREE.Vector3[];
  const ups = material.uniforms.uProjectorUps.value as THREE.Vector3[];
  const rasters = material.uniforms.uProjectorRaster.value as THREE.Vector3[];
  const colours = material.uniforms.uProjectorColours.value as THREE.Color[];
  const cosHalfFov = material.uniforms.uProjectorCosHalfFov.value as Float32Array;
  const tanHalfFov = material.uniforms.uProjectorTanHalfFov.value as Float32Array;
  const levels = material.uniforms.uProjectorLevels.value as Float32Array;
  const blendEdges = material.uniforms.uProjectorBlendEdges.value as THREE.Vector4[];
  const blendGamma = material.uniforms.uProjectorBlendGamma.value as Float32Array;
  const blackLevels = material.uniforms.uProjectorBlackLevels.value as Float32Array;
  const enabled = material.uniforms.uProjectorEnabled.value as Float32Array;
  for (let index = 0; index < 5; index += 1) {
    const projector = state.projectors[index];
    if (!projector) {
      positions[index].set(0, 100, 0);
      directions[index].set(0, -1, 0);
      rights[index].set(1, 0, 0);
      ups[index].set(0, 1, 0);
      cosHalfFov[index] = 1;
      tanHalfFov[index] = 0.001;
      levels[index] = 0;
      blendEdges[index].set(1, 1, 1, 1);
      blendGamma[index] = 1;
      blackLevels[index] = 0;
      enabled[index] = 0;
      continue;
    }
    positions[index].set(
      projector.position.x,
      projector.position.y,
      projector.position.z,
    );
    directions[index].set(
      projector.direction.x,
      projector.direction.y,
      projector.direction.z,
    );
    rights[index].set(projector.right.x, projector.right.y, projector.right.z);
    ups[index].set(projector.up.x, projector.up.y, projector.up.z);
    rasters[index].set(projector.rasterAspect, projector.lensShift.x, projector.lensShift.y);
    cosHalfFov[index] = projector.cosHalfFov;
    tanHalfFov[index] = projector.tanHalfFov;
    levels[index] = projector.level;
    blendEdges[index].set(
      projector.blend.left,
      projector.blend.right,
      projector.blend.top,
      projector.blend.bottom,
    );
    blendGamma[index] = projector.blendGamma;
    blackLevels[index] = projector.blackLevel;
    enabled[index] = projector.enabled ? 1 : 0;
    colours[index].set(projector.colorHex);
  }
  material.uniforms.uProjectionPattern.value =
    state.projectionPattern === "coverage"
      ? 1
      : state.projectionPattern === "grid"
        ? 2
        : state.projectionPattern === "seam"
          ? 3
          : state.projectionPattern === "black"
            ? 4
            : 0;
}
