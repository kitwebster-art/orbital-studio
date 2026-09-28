/**
 * The levitating shape. One mesh, three looks:
 *   projection  Orbital Studio's surface shader lit by the virtual projectors;
 *   pressure    a Bernoulli pressure-coefficient map from the local flow;
 *   material    a physically based preview of the chosen skin.
 * Plus a faint additive "spill" ghost at the pose the projector believes in,
 * and swaying ribbons for the medusa.
 */
import * as THREE from "three";
import type { MaterialDefinition, ShapeMesh } from "../model/types";
import { createLabSurfaceMaterial, applySurfaceOptics, type PatchReport } from "./projectionSurface";

export type LabView = "projection" | "pressure" | "material";

const PRESSURE_VERTEX = /* glsl */ `
  uniform mat3 uWorldNormalMatrix;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(uWorldNormalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Cp = 1 - (1.5 sin(theta))^2 on the attached side (potential flow over a
 * sphere, theta measured from the stagnation point), relaxing to a separated
 * base pressure on the lee side, weighted by how much of the jet actually
 * reaches that part of the surface (Gaussian jet profile at the body height).
 */
const PRESSURE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uFlowDir;
  uniform float uJetHalfWidth;
  uniform float uFlowStrength;
  uniform vec3 uLightDir;
  uniform vec3 uBodyCentre;
  uniform float uBodyRadius;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  vec3 ramp(float cp) {
    // cp -1.25 (suction, fast air) ... 0 ... +1 (push, stagnation)
    float t = clamp((cp + 1.25) / 2.25, 0.0, 1.0);
    vec3 c0 = vec3(0.851, 0.984, 1.0);
    vec3 c1 = vec3(0.369, 0.906, 1.0);
    vec3 c2 = vec3(0.106, 0.435, 0.604);
    vec3 c3 = vec3(0.19, 0.23, 0.28);
    vec3 c4 = vec3(0.604, 0.302, 0.110);
    vec3 c5 = vec3(1.0, 0.604, 0.302);
    vec3 c6 = vec3(1.0, 0.878, 0.722);
    if (t < 0.16) return mix(c0, c1, t / 0.16);
    if (t < 0.38) return mix(c1, c2, (t - 0.16) / 0.22);
    if (t < 0.555) return mix(c2, c3, (t - 0.38) / 0.175);
    if (t < 0.74) return mix(c3, c4, (t - 0.555) / 0.185);
    if (t < 0.88) return mix(c4, c5, (t - 0.74) / 0.14);
    return mix(c5, c6, (t - 0.88) / 0.12);
  }

  vec3 toLinear(vec3 c) {
    return pow(c, vec3(2.2));
  }

  void main() {
    vec3 n = normalize(vWorldNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    float cosTheta = dot(n, -uFlowDir);
    float sin2 = max(0.0, 1.0 - cosTheta * cosTheta);
    float cp = 1.0 - 2.25 * sin2;
    float lee = smoothstep(-0.05, -0.5, cosTheta);
    cp = mix(cp, -0.42, lee);
    // Where the jet itself arrives (Gaussian jet profile at the body height).
    float r = length(vec2(vWorldPosition.x, vWorldPosition.z));
    float b = max(uJetHalfWidth, 1e-3);
    float impinge = exp(-0.6931 * (r * r) / (b * b));
    // Once turned, the jet runs along the skin as a wall jet that thins and
    // slows with distance from the stagnation point, until it separates.
    float theta = acos(clamp(cosTheta, -1.0, 1.0));
    float arc = theta * uBodyRadius;
    float wall = sqrt(b / (b + arc * 0.7)) * (1.0 - smoothstep(1.45, 1.95, theta));
    float reach = max(impinge, wall);
    float q = mix(0.06, 1.0, reach * reach) * uFlowStrength;
    float p = cp * q;
    vec3 colour = toLinear(ramp(p));
    float lambert = max(dot(n, uLightDir), 0.0);
    colour *= 0.62 + 0.5 * lambert;
    float iso = abs(fract(p * 4.0 + 0.5) - 0.5);
    float line = 1.0 - smoothstep(0.0, fwidth(p * 4.0) * 1.3, iso);
    colour = mix(colour, colour * 1.6 + 0.015, line * 0.22);
    vec3 view = normalize(cameraPosition - vWorldPosition);
    float rim = pow(1.0 - abs(dot(n, view)), 3.0);
    colour += vec3(0.05, 0.08, 0.1) * rim;
    gl_FragColor = vec4(colour, 1.0);
  }
`;

const GHOST_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const GHOST_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColour;
  uniform float uStrength;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(cameraPosition - vWorld)));
    float edge = pow(1.0 - facing, 2.2);
    float alpha = (0.16 + edge * 0.9) * uStrength;
    gl_FragColor = vec4(uColour * alpha, alpha);
  }
`;

export interface FlowAtBody {
  /** Unit direction of the air relative to the body (downstream). */
  direction: THREE.Vector3;
  /** 0..1 how strong the relative flow is compared with the outlet. */
  strength: number;
  jetHalfWidth: number;
}

export class BodyView {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly ghost: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly surfaceMaterial: THREE.ShaderMaterial;
  readonly patchReport: PatchReport;
  readonly pressureMaterial: THREE.ShaderMaterial;
  readonly physicalMaterial: THREE.MeshPhysicalMaterial;
  private readonly strandMaterial = new THREE.LineBasicMaterial({
    color: 0x9fb0bc,
    transparent: true,
    opacity: 0.55,
  });
  private strands: THREE.LineSegments | null = null;
  private strandBase: Float32Array | null = null;
  private strandMeta: Float32Array | null = null;
  geometry: THREE.BufferGeometry = new THREE.BufferGeometry();
  /** Half extents of the body in its own frame (m). */
  readonly halfExtents = new THREE.Vector3(0.5, 0.5, 0.5);
  boundingRadius = 0.5;
  view: LabView = "projection";
  private sizeM = 1;
  private readonly contentMatrix = new THREE.Matrix4();
  private readonly contentInverse = new THREE.Matrix4();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly scaleScratch = new THREE.Vector3();

  constructor() {
    this.group.name = "Levitating body";
    const surface = createLabSurfaceMaterial();
    this.surfaceMaterial = surface.material;
    this.patchReport = surface.report;
    this.pressureMaterial = new THREE.ShaderMaterial({
      name: "LabPressure",
      vertexShader: PRESSURE_VERTEX,
      fragmentShader: PRESSURE_FRAGMENT,
      uniforms: {
        uWorldNormalMatrix: { value: new THREE.Matrix3() },
        uFlowDir: { value: new THREE.Vector3(0, 1, 0) },
        uJetHalfWidth: { value: 0.5 },
        uFlowStrength: { value: 1 },
        uLightDir: { value: new THREE.Vector3(0.4, 0.7, 0.6).normalize() },
        uBodyCentre: { value: new THREE.Vector3() },
        uBodyRadius: { value: 0.5 },
      },
    });
    this.physicalMaterial = new THREE.MeshPhysicalMaterial({
      name: "LabSkin",
      color: 0xf2f1ec,
      roughness: 0.7,
      metalness: 0,
      envMapIntensity: 1,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.surfaceMaterial);
    this.mesh.name = "Body";
    this.mesh.renderOrder = 0;
    this.group.add(this.mesh);

    this.ghost = new THREE.Mesh(
      this.geometry,
      new THREE.ShaderMaterial({
        name: "LabSpillGhost",
        vertexShader: GHOST_VERTEX,
        fragmentShader: GHOST_FRAGMENT,
        uniforms: {
          uColour: { value: new THREE.Color(0xffb45e) },
          uStrength: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.ghost.name = "Projection spill ghost";
    this.ghost.renderOrder = 4;
    this.ghost.visible = false;
  }

  /** Replace the geometry from the model's mesh. Disposes the old one. */
  setShape(shape: ShapeMesh, sizeM: number): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(shape.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(shape.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(shape.indices, 1));
    // The model already supplies per-facet normals for flat-shaded shapes.
    const finalGeometry: THREE.BufferGeometry = geometry;
    finalGeometry.computeBoundingBox();
    finalGeometry.computeBoundingSphere();
    const box = finalGeometry.boundingBox;
    if (box) {
      this.halfExtents.set(
        Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
        Math.max(Math.abs(box.min.y), Math.abs(box.max.y)),
        Math.max(Math.abs(box.min.z), Math.abs(box.max.z)),
      );
    }
    this.boundingRadius = finalGeometry.boundingSphere
      ? finalGeometry.boundingSphere.center.length() + finalGeometry.boundingSphere.radius
      : sizeM * 0.6;
    const previous = this.geometry;
    this.geometry = finalGeometry;
    this.mesh.geometry = finalGeometry;
    this.ghost.geometry = finalGeometry;
    previous.dispose();
    this.sizeM = sizeM;

    const side = shape.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    this.surfaceMaterial.side = side;
    this.pressureMaterial.side = side;
    this.physicalMaterial.side = side;
    this.physicalMaterial.flatShading = shape.flatShading;
    this.physicalMaterial.needsUpdate = true;
    this.surfaceMaterial.uniforms.uWobbleAmplitude.value = sizeM * 0.012;
    this.buildStrands(shape.strands ?? null);
  }

  setMaterial(material: MaterialDefinition): void {
    const swatch = material.swatch;
    const physical = this.physicalMaterial;
    physical.color.set(swatch.color);
    physical.roughness = swatch.roughness;
    physical.metalness = swatch.metalness;
    physical.transmission = swatch.transmission;
    physical.thickness = swatch.transmission > 0 ? Math.max(0.002, this.sizeM * 0.01) : 0;
    physical.ior = 1.45;
    physical.sheen = swatch.sheen;
    physical.sheenRoughness = 0.55;
    physical.sheenColor.set(0xffffff);
    physical.clearcoat = material.gloss > 0.35 && swatch.metalness < 0.5 ? material.gloss * 0.5 : 0;
    physical.clearcoatRoughness = 0.25;
    physical.envMapIntensity = swatch.metalness > 0.5 ? 1.4 : 0.85;
    physical.needsUpdate = true;
    applySurfaceOptics(this.surfaceMaterial, {
      reflectance: material.reflectance,
      translucency: material.translucency,
      roughness: 1 - material.gloss,
    });
    this.strandMaterial.color.set(swatch.color).multiplyScalar(0.7);
  }

  setView(view: LabView): void {
    this.view = view;
    this.mesh.material =
      view === "projection" ? this.surfaceMaterial : view === "pressure" ? this.pressureMaterial : this.physicalMaterial;
  }

  /** Pose the real body. orientation is body-to-world. */
  setPose(position: THREE.Vector3, quaternion: THREE.Quaternion, squash: number): void {
    squashScale(squash, this.scaleScratch);
    this.group.position.copy(position);
    this.group.quaternion.copy(quaternion);
    this.mesh.scale.copy(this.scaleScratch);
    this.group.updateMatrixWorld(true);
    this.normalMatrix.getNormalMatrix(this.mesh.matrixWorld);
    (this.surfaceMaterial.uniforms.uWorldNormalMatrix.value as THREE.Matrix3).copy(this.normalMatrix);
    (this.pressureMaterial.uniforms.uWorldNormalMatrix.value as THREE.Matrix3).copy(this.normalMatrix);
  }

  /** Pose the projector believes in; drives the content mapping and the spill ghost. */
  setContentPose(position: THREE.Vector3, quaternion: THREE.Quaternion, squash: number, ghostStrength: number): void {
    squashScale(squash, this.scaleScratch);
    this.contentMatrix.compose(position, quaternion, this.scaleScratch);
    this.contentInverse.copy(this.contentMatrix).invert();
    (this.surfaceMaterial.uniforms.uContentInverse.value as THREE.Matrix4).copy(this.contentInverse);
    (this.surfaceMaterial.uniforms.uContentLinear.value as THREE.Matrix3).setFromMatrix4(this.contentMatrix);
    this.ghost.position.copy(position);
    this.ghost.quaternion.copy(quaternion);
    this.ghost.scale.copy(this.scaleScratch);
    this.ghost.updateMatrixWorld(true);
    this.ghost.material.uniforms.uStrength.value = ghostStrength;
    this.ghost.visible = ghostStrength > 0.004;
  }

  setFlow(flow: FlowAtBody): void {
    const uniforms = this.pressureMaterial.uniforms;
    (uniforms.uBodyCentre.value as THREE.Vector3).copy(this.group.position);
    uniforms.uBodyRadius.value = Math.max(this.halfExtents.x, this.halfExtents.z);
    (uniforms.uFlowDir.value as THREE.Vector3).copy(flow.direction);
    uniforms.uJetHalfWidth.value = flow.jetHalfWidth;
    uniforms.uFlowStrength.value = flow.strength;
  }

  setPressureLight(direction: THREE.Vector3): void {
    (this.pressureMaterial.uniforms.uLightDir.value as THREE.Vector3).copy(direction).normalize();
  }

  /** Per-frame animation: membrane wobble and ribbon sway. */
  animate(timeS: number, wobble: number, flowStrength: number, reducedMotion: boolean): void {
    const uniforms = this.surfaceMaterial.uniforms;
    uniforms.uWobble.value = reducedMotion ? 0 : wobble;
    if (!this.strands || !this.strandBase || !this.strandMeta) return;
    const base = this.strandBase;
    const meta = this.strandMeta;
    const attribute = this.strands.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const amplitude = reducedMotion ? 0 : this.sizeM * (0.035 + 0.09 * Math.min(1, flowStrength));
    for (let v = 0; v < base.length / 3; v += 1) {
      const along = meta[v * 2];
      const phase = meta[v * 2 + 1];
      const weight = along * Math.sqrt(along);
      const sway = amplitude * weight;
      array[v * 3] = base[v * 3] + Math.sin(timeS * 1.9 + phase + along * 2.6) * sway;
      array[v * 3 + 1] = base[v * 3 + 1] + Math.sin(timeS * 2.7 + phase * 1.7 + along * 3.1) * sway * 0.18;
      array[v * 3 + 2] = base[v * 3 + 2] + Math.cos(timeS * 1.6 + phase * 1.3 + along * 2.2) * sway;
    }
    attribute.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.surfaceMaterial.dispose();
    this.pressureMaterial.dispose();
    this.physicalMaterial.dispose();
    this.ghost.material.dispose();
    this.strandMaterial.dispose();
    this.strands?.geometry.dispose();
  }

  private buildStrands(strands: Float32Array[] | null): void {
    if (this.strands) {
      this.mesh.remove(this.strands);
      this.strands.geometry.dispose();
      this.strands = null;
      this.strandBase = null;
      this.strandMeta = null;
    }
    if (!strands || strands.length === 0) return;
    let segmentCount = 0;
    for (const strand of strands) segmentCount += Math.max(0, strand.length / 3 - 1);
    const base = new Float32Array(segmentCount * 2 * 3);
    const meta = new Float32Array(segmentCount * 2 * 2);
    let cursor = 0;
    strands.forEach((strand, strandIndex) => {
      const points = strand.length / 3;
      const phase = strandIndex * 2.39996;
      for (let p = 0; p < points - 1; p += 1) {
        for (let end = 0; end < 2; end += 1) {
          const index = p + end;
          base[cursor * 3] = strand[index * 3];
          base[cursor * 3 + 1] = strand[index * 3 + 1];
          base[cursor * 3 + 2] = strand[index * 3 + 2];
          meta[cursor * 2] = points > 1 ? index / (points - 1) : 0;
          meta[cursor * 2 + 1] = phase;
          cursor += 1;
        }
      }
    });
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(base.slice(), 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", attribute);
    const lines = new THREE.LineSegments(geometry, this.strandMaterial);
    lines.frustumCulled = false;
    lines.name = "Medusa ribbons";
    this.strands = lines;
    this.strandBase = base;
    this.strandMeta = meta;
    this.mesh.add(lines);
  }
}

/** Volume-preserving squash along body Y. */
export function squashScale(squash: number, out: THREE.Vector3): THREE.Vector3 {
  const s = THREE.MathUtils.clamp(squash, 0, 0.3);
  const y = 1 - s;
  const xz = 1 / Math.sqrt(y);
  return out.set(xz, y, xz);
}
