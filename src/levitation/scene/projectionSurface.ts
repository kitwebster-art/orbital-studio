/**
 * Orbital Studio's projection surface shader, adapted to arbitrary shapes.
 *
 * The Studio material is created with createOrbitalSurfaceMaterial() and keeps
 * its fragment shader (every procedural look, colour finishing and projector
 * maths). Three careful changes make it work on a levitating shape:
 *
 * 1. The vertex shader is replaced. Studio forces vertices onto an ellipsoid;
 *    ours keeps the mesh and provides the same varyings. vSurfaceDirection is
 *    computed from the pose the projector *thinks* the body has (the lagged or
 *    predicted pose), so latency makes the image slide over the real surface.
 * 2. Each projector's contribution is multiplied by a visibility term read
 *    from a small per-projector atlas: real shadowing (the halo's inner wall,
 *    the underside of a dome) and, when latency is on, whether the projector
 *    ray actually hits the body where the content was drawn.
 * 3. In the authored pattern the Studio lights the whole surface; here the
 *    light is gated by the rig coverage so only projector-lit areas glow.
 *
 * Unused Studio uniforms (uOutputWarp, uRadii, uCenter...) stay in place and
 * are simply ignored by the new vertex shader.
 */
import * as THREE from "three";
import {
  createOrbitalSurfaceMaterial,
  setOrbitalSurfaceLookControls,
} from "../../scene/shaders/orbitalSurface";
import type { LabLook } from "../looks";

export const LAB_SURFACE_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uWobble;
  uniform float uWobbleAmplitude;
  uniform mat4 uContentInverse;
  uniform mat3 uContentLinear;
  uniform mat3 uWorldNormalMatrix;

  varying vec3 vWorldPosition;
  varying vec3 vSurfaceDirection;
  varying vec3 vWorldNormal;
  varying float vDeformation;

  void main() {
    vec3 direction = normalize(position + vec3(1e-6));
    // Elastic skins breathe with a slow membrane ripple; rigid shells do not.
    float ripple =
      sin(direction.y * 4.1 + direction.x * 2.3 + uTime * 2.1) *
      cos(direction.z * 3.7 - uTime * 1.6);
    float deformation = ripple * uWobble * uWobbleAmplitude;
    vec3 displaced = position + normal * deformation;

    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    // Content coordinates come from the pose the projector believes in.
    // With zero latency uContentInverse = inverse(modelMatrix) and
    // uContentLinear = mat3(modelMatrix), which reduces to Studio's
    // normalize(mat3(modelMatrix) * normalize(objectPosition)).
    vec3 contentLocal = (uContentInverse * worldPosition).xyz;
    vSurfaceDirection = normalize(uContentLinear * normalize(contentLocal + vec3(1e-6)));
    vWorldNormal = normalize(uWorldNormalMatrix * normal);
    vDeformation = deformation;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const LAB_FRAGMENT_PRELUDE = /* glsl */ `
  uniform sampler2D uLabAtlas;
  uniform mat4 uLabProjectorMatrices[5];
  uniform vec2 uLabDepthRanges[5];
  uniform float uLabAtlasEnabled;
  uniform float uLabLatencyMask;
  uniform float uLabRigLighting;
  uniform vec2 uLabTileTexel;

  vec3 labWorldNormal;

  const vec2 LAB_TAPS[5] = vec2[5](
    vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0)
  );

  // 1 where projector [index] really lands on this fragment: not shadowed by
  // another part of the body and, with latency, drawn where the body is.
  float labProjectorVisibility(int index, float incidence) {
    if (uLabAtlasEnabled < 0.5) {
      return 1.0;
    }
    vec4 clip = uLabProjectorMatrices[index] * vec4(vWorldPosition, 1.0);
    if (clip.w <= 0.0) {
      return 0.0;
    }
    vec2 ndc = clip.xy / clip.w;
    if (abs(ndc.x) > 1.0 || abs(ndc.y) > 1.0) {
      return 0.0;
    }
    vec2 tileUv = ndc * 0.5 + 0.5;
    vec2 range = uLabDepthRanges[index];
    float depth = (length(vWorldPosition - uProjectorPositions[index]) - range.x) /
      max(range.y - range.x, 1e-4);
    float bias = mix(0.012, 0.05, 1.0 - clamp(incidence, 0.0, 1.0));
    float lit = 0.0;
    float covered = 0.0;
    for (int k = 0; k < 5; k++) {
      vec2 t = clamp(
        tileUv + LAB_TAPS[k] * uLabTileTexel * 1.5,
        uLabTileTexel * 0.5,
        vec2(1.0) - uLabTileTexel * 0.5
      );
      vec4 atlasSample = texture2D(uLabAtlas, vec2((float(index) + t.x) / 5.0, t.y));
      float nearest = atlasSample.r > 0.0 ? 1.0 - atlasSample.r : 1.0;
      lit += step(depth, nearest + bias);
      covered += atlasSample.g;
    }
    lit *= 0.2;
    covered *= 0.2;
    return lit * mix(1.0, smoothstep(0.15, 0.85, covered), uLabLatencyMask);
  }
`;

const CONTRIBUTION_PATTERN =
  /float contribution = cone \* incidence \* uProjectorLevels\[index\] \*\s*feather \* uProjectorEnabled\[index\];/;
const PROJECTED_LIGHT_PATTERN =
  /float projectedLight = coverage \* surfaceBreath \* confidence \* outputMask;/;
const MAIN_SIGNATURE = "void main() {";

export interface PatchReport {
  contribution: boolean;
  projectedLight: boolean;
  normals: boolean;
}

/** Patch Studio's fragment shader. Pure string work so it can be unit tested. */
export function patchStudioFragmentShader(source: string): { shader: string; report: PatchReport } {
  const report: PatchReport = { contribution: false, projectedLight: false, normals: false };
  const mainIndex = source.lastIndexOf(MAIN_SIGNATURE);
  if (mainIndex < 0) {
    return { shader: source, report };
  }
  const head = source.slice(0, mainIndex);
  let body = source.slice(mainIndex + MAIN_SIGNATURE.length);

  if (CONTRIBUTION_PATTERN.test(body)) {
    body = body.replace(
      CONTRIBUTION_PATTERN,
      (match) => `${match}\n      contribution *= labProjectorVisibility(index, incidence);`,
    );
    report.contribution = true;
  }
  if (PROJECTED_LIGHT_PATTERN.test(body)) {
    body = body.replace(
      PROJECTED_LIGHT_PATTERN,
      "float projectedLight = coverage * surfaceBreath * confidence * outputMask *\n      mix(1.0, rigCoverage, uLabRigLighting);",
    );
    report.projectedLight = true;
  }
  if (body.includes("vWorldNormal")) {
    body = body.split("vWorldNormal").join("labWorldNormal");
    report.normals = true;
  }
  const shader =
    `${head}${LAB_FRAGMENT_PRELUDE}\n${MAIN_SIGNATURE}\n` +
    `    labWorldNormal = normalize(vWorldNormal) * (gl_FrontFacing ? 1.0 : -1.0);\n` +
    body;
  return { shader, report };
}

export interface LabSurfaceMaterial {
  material: THREE.ShaderMaterial;
  report: PatchReport;
}

export function createLabSurfaceMaterial(): LabSurfaceMaterial {
  const material = createOrbitalSurfaceMaterial();
  const { shader, report } = patchStudioFragmentShader(material.fragmentShader);
  material.name = "LevitationLabProjectedSurface";
  material.vertexShader = LAB_SURFACE_VERTEX_SHADER;
  material.fragmentShader = shader;
  Object.assign(material.uniforms, {
    uWobbleAmplitude: { value: 0 },
    uContentInverse: { value: new THREE.Matrix4() },
    uContentLinear: { value: new THREE.Matrix3() },
    uWorldNormalMatrix: { value: new THREE.Matrix3() },
    uLabAtlas: { value: null },
    uLabProjectorMatrices: { value: Array.from({ length: 5 }, () => new THREE.Matrix4()) },
    uLabDepthRanges: { value: Array.from({ length: 5 }, () => new THREE.Vector2(0, 1)) },
    uLabAtlasEnabled: { value: 0 },
    uLabLatencyMask: { value: 0 },
    uLabRigLighting: { value: 1 },
    uLabTileTexel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
  });
  // Authored show defaults, close to the Studio thumbnail treatment.
  const uniforms = material.uniforms;
  uniforms.uEnergy.value = 0.58;
  uniforms.uBrightness.value = 0.72;
  uniforms.uDensity.value = 0.45;
  uniforms.uFluidity.value = 0.55;
  uniforms.uFracture.value = 0.06;
  uniforms.uGlitch.value = 0.02;
  uniforms.uOrganic.value = 0.58;
  uniforms.uMelody.value = 0.3;
  uniforms.uResidualGain.value = 0.6;
  uniforms.uTrackingConfidence.value = 1;
  uniforms.uStateValid.value = 1;
  uniforms.uPreviewExposure.value = 0.84;
  uniforms.uProjectionPattern.value = 0;
  uniforms.uOutputPreviewMode.value = 0;
  (uniforms.uRegionIntensities.value as Float32Array).fill(0);
  setOrbitalSurfaceLookControls(material, {
    scale: 1,
    rotation: 0,
    hue: 0,
    saturation: 1.05,
    contrast: 1.1,
    softness: 0.5,
    level: 1.12,
  });
  material.needsUpdate = true;
  return { material, report };
}

/** Apply a registry look exactly as OrbitalScene.setShaderPreset does. */
export function applyLabLook(material: THREE.ShaderMaterial, look: LabLook): void {
  const uniforms = material.uniforms;
  uniforms.uShaderMode.value = look.renderMode;
  uniforms.uShaderSeed.value = look.shaderSeed;
  uniforms.uShaderParamA.value = look.params[0];
  uniforms.uShaderParamB.value = look.params[1];
  uniforms.uShaderParamC.value = look.params[2];
  uniforms.uShaderParamD.value = look.params[3];
  uniforms.uShaderParamE.value = look.params[4];
  material.userData.shaderId = look.id;
}

export interface SurfaceOptics {
  reflectance: number;
  translucency: number;
  roughness: number;
}

export function applySurfaceOptics(material: THREE.ShaderMaterial, optics: SurfaceOptics): void {
  const uniforms = material.uniforms;
  uniforms.uMaterialReflectance.value = THREE.MathUtils.clamp(optics.reflectance, 0, 1);
  uniforms.uMaterialTranslucency.value = THREE.MathUtils.clamp(optics.translucency, 0, 1);
  uniforms.uMaterialInternalBleed.value = 0.28;
  uniforms.uMaterialRoughness.value = THREE.MathUtils.clamp(optics.roughness, 0, 1);
}
