import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uColour;
  uniform float uStrength;
  uniform float uTime;
  uniform float uChannelPhase;

  varying vec2 vUv;
  varying vec3 vWorldPosition;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    float axialFade = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6);
    float edgeFade = smoothstep(0.0, 0.28, min(vUv.x, 1.0 - vUv.x));
    float grain = 0.82 + 0.18 * hash31(floor(vWorldPosition * 2.0 + uTime * 0.15));
    float breath = 0.92 + 0.08 * sin(uTime * 0.37 + uChannelPhase);
    float alpha = axialFade * edgeFade * grain * breath * uStrength;
    gl_FragColor = vec4(uColour, alpha);
    #include <colorspace_fragment>
  }
`;

export function createProjectionBeamMaterial(
  colour: THREE.ColorRepresentation,
  channelPhase: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: "OrbitalProjectionVolume",
    vertexShader,
    fragmentShader,
    uniforms: {
      uColour: { value: new THREE.Color(colour) },
      uStrength: { value: 0.018 },
      uTime: { value: 0 },
      uChannelPhase: { value: channelPhase },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

export function updateProjectionBeamMaterial(
  material: THREE.ShaderMaterial,
  timeS: number,
  strength: number,
): void {
  material.uniforms.uTime.value = timeS;
  material.uniforms.uStrength.value = strength;
}
