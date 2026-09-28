/**
 * A soft volumetric envelope around the jet: a lathe that follows the model's
 * jet half-width with height, shaded additively so it is dense through the
 * middle of the column, with a faint fresnel sheath and slow upward noise.
 */
import * as THREE from "three";

export interface JetProfile {
  halfWidth(h: number): number;
  /** Centreline speed at height h divided by the outlet speed (0..1). */
  relativeSpeed(h: number): number;
}

const VERTEX = /* glsl */ `
  attribute float aSpeed;
  attribute float aHeight;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying float vSpeed;
  varying float vHeight;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vLocal = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vSpeed = aSpeed;
    vHeight = aHeight;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uFlowSpeed;
  uniform float uScale;
  uniform vec3 uColour;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying float vSpeed;
  varying float vHeight;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    float facing = abs(dot(normalize(vNormal), view));
    float density = pow(facing, 1.7);
    float sheath = pow(1.0 - facing, 4.0) * 0.28;
    vec2 around = normalize(vLocal.xz + vec2(1e-5));
    float y = vLocal.y / uScale;
    float flow = uTime * uFlowSpeed;
    float n1 = noise(vec3(around * 2.2, y * 2.6 - flow));
    float n2 = noise(vec3(around * 5.5 + 3.1, y * 6.0 - flow * 1.7));
    float motion = 0.5 + 0.5 * (n1 * 0.7 + n2 * 0.3);
    float fadeBottom = smoothstep(0.0, 0.05, vHeight);
    float fadeTop = 1.0 - smoothstep(0.5, 1.0, vHeight);
    float alpha = (density * 0.85 + sheath) * motion * vSpeed * fadeBottom * fadeTop * uIntensity;
    gl_FragColor = vec4(uColour * alpha, alpha);
  }
`;

export class JetEnvelope {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private key = "";

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        name: "LabJetEnvelope",
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 0.12 },
          uFlowSpeed: { value: 1 },
          uScale: { value: 1 },
          uColour: { value: new THREE.Color(0x3fd9f5) },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.mesh.name = "Jet envelope";
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
  }

  /** Rebuild the lathe when the fan or visible height changes. */
  rebuild(profile: JetProfile, outletRadius: number, topY: number, key: string): void {
    if (key === this.key) return;
    this.key = key;
    const rows = 48;
    const segments = 72;
    const positions: number[] = [];
    const normals: number[] = [];
    const speeds: number[] = [];
    const heights: number[] = [];
    const indices: number[] = [];
    const radii: number[] = [];
    for (let j = 0; j <= rows; j += 1) {
      const t = j / rows;
      const h = t * topY;
      // The visible edge sits where the air is ~20% of the centreline speed.
      radii.push(Math.max(outletRadius * 0.98, profile.halfWidth(h) * 1.55) * (j === 0 ? 1 : 1));
    }
    for (let j = 0; j <= rows; j += 1) {
      const t = j / rows;
      const h = t * topY;
      const r = radii[j];
      const rPrev = radii[Math.max(0, j - 1)];
      const rNext = radii[Math.min(rows, j + 1)];
      const slope = (rNext - rPrev) / (((Math.min(rows, j + 1) - Math.max(0, j - 1)) / rows) * topY);
      const speed = THREE.MathUtils.clamp(profile.relativeSpeed(h), 0, 1);
      for (let i = 0; i <= segments; i += 1) {
        const a = (i / segments) * Math.PI * 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        positions.push(cos * r, h, sin * r);
        const nx = cos;
        const ny = -slope;
        const nz = sin;
        const length = Math.hypot(nx, ny, nz);
        normals.push(nx / length, ny / length, nz / length);
        speeds.push(speed);
        heights.push(t);
      }
    }
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < segments; i += 1) {
        const a = j * (segments + 1) + i;
        const b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speeds, 1));
    geometry.setAttribute("aHeight", new THREE.Float32BufferAttribute(heights, 1));
    geometry.setIndex(indices);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.mesh.material.uniforms.uScale.value = Math.max(outletRadius * 2, 0.2);
  }

  update(timeS: number, outletSpeedMps: number, outletRadius: number, intensity: number): void {
    const uniforms = this.mesh.material.uniforms;
    uniforms.uTime.value = timeS;
    // Noise scrolls at a speed proportional to the air, in outlet diameters.
    uniforms.uFlowSpeed.value = THREE.MathUtils.clamp(outletSpeedMps / Math.max(outletRadius * 4, 0.3), 0.2, 6);
    uniforms.uIntensity.value = intensity;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
