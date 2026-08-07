import * as THREE from "three";

const vertexShader = /* glsl */ `
  uniform vec3 uRadii;
  uniform float uShapeAngle;
  uniform float uTime;
  uniform float uWobble;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vLatitude;

  mat2 rotate2d(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
  }

  void main() {
    vec3 direction = normalize(position);
    vec2 alignedXY = rotate2d(-uShapeAngle) * direction.xy;
    vec3 shaped = vec3(alignedXY, direction.z) * uRadii;
    shaped.xy = rotate2d(uShapeAngle) * shaped.xy;
    shaped += direction *
      sin(direction.y * 11.0 + direction.x * 5.0 + uTime * 1.2) *
      uWobble * 0.06;

    vec4 worldPosition = modelMatrix * vec4(shaped, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * direction);
    vLatitude = direction.y;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uConfidence;
  uniform vec3 uColour;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vLatitude;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float edge = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDirection)), 1.75);
    float scan = sin((vLatitude * 34.0 - uTime * 1.8) * 3.14159265) * 0.5 + 0.5;
    scan = smoothstep(0.84, 1.0, scan);
    float flicker = 0.82 + 0.18 * sin(uTime * 5.3 + vLatitude * 17.0);
    float alpha = (edge * 0.76 + scan * 0.15) * uOpacity * uConfidence * flicker;
    gl_FragColor = vec4(uColour * (0.7 + edge * 1.25), alpha);
    #include <colorspace_fragment>
  }
`;

export interface PredictionGhostState {
  timeS: number;
  radiiM: THREE.Vector3;
  principalAxisRad: number;
  wobble: number;
  opacity: number;
  confidence: number;
}

export function createPredictionGhostMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: "OrbitalPredictionGhost",
    vertexShader,
    fragmentShader,
    uniforms: {
      uRadii: { value: new THREE.Vector3(2.5, 2.5, 2.5) },
      uShapeAngle: { value: 0 },
      uTime: { value: 0 },
      uWobble: { value: 0 },
      uOpacity: { value: 0.28 },
      uConfidence: { value: 1 },
      uColour: { value: new THREE.Color(0x72e3ff) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export function updatePredictionGhostMaterial(
  material: THREE.ShaderMaterial,
  state: PredictionGhostState,
): void {
  (material.uniforms.uRadii.value as THREE.Vector3).copy(state.radiiM);
  material.uniforms.uShapeAngle.value = state.principalAxisRad;
  material.uniforms.uTime.value = state.timeS;
  material.uniforms.uWobble.value = state.wobble;
  material.uniforms.uOpacity.value = state.opacity;
  material.uniforms.uConfidence.value = state.confidence;
}
