/**
 * Virtual projectors around the rig. They feed Orbital Studio's projector
 * uniforms (the same ProjectorShaderInput the Studio builds from its rig) and
 * render a small per-projector visibility atlas:
 *
 *   R = 1 - normalised distance to the nearest real surface (MAX blended),
 *       used for shadowing in the surface shader;
 *   G = 1 where the lagged body covers the projector pixel, i.e. where the
 *       content was drawn. With latency, light only lands where both agree.
 */
import * as THREE from "three";
import type { ProjectorShaderInput } from "../../core/projectionRig";
import {
  createProjectionBeamMaterial,
  updateProjectionBeamMaterial,
} from "../../scene/shaders/projectionBeam";

export const MAX_PROJECTORS = 5;
const TILE = 320;
const V_FOV_DEG = 26;
const RASTER_ASPECT = 1.6;
const ELEVATIONS_DEG = [18, -4, 30, 8, 22];

const ATLAS_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const DEPTH_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uProjector;
  uniform vec2 uRange;
  varying vec3 vWorld;
  void main() {
    float d = (length(vWorld - uProjector) - uRange.x) / max(uRange.y - uRange.x, 1e-4);
    gl_FragColor = vec4(1.0 - clamp(d, 0.001, 0.999), 0.0, 0.0, 1.0);
  }
`;

const COVERAGE_FRAGMENT = /* glsl */ `
  precision highp float;
  void main() {
    gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
  }
`;

function maxBlendMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: ATLAS_VERTEX,
    fragmentShader,
    uniforms,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendEquationAlpha: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    toneMapped: false,
  });
}

interface ProjectorUnit {
  group: THREE.Group;
  beam: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  camera: THREE.PerspectiveCamera;
  current: THREE.Vector3;
  target: THREE.Vector3;
  input: ProjectorShaderInput;
  range: THREE.Vector2;
  beamLength: number;
}

export interface RigLayout {
  count: number;
  aim: THREE.Vector3;
  coverRadiusM: number;
  floorY: number;
  minDistanceM: number;
  /** Azimuth of the viewer; projectors are arranged so none stands in front of it. */
  azimuthRad: number;
}

/** Projector azimuths around the viewer direction, keeping the viewer between beams. */
export function projectorAzimuths(count: number, viewerAzimuth: number): number[] {
  if (count <= 1) return [viewerAzimuth - 0.62];
  if (count === 2) return [viewerAzimuth - 0.9, viewerAzimuth + 0.9];
  const step = (Math.PI * 2) / count;
  return Array.from({ length: count }, (_, index) => viewerAzimuth + step / 2 + index * step);
}

export class ProjectorRig {
  readonly group = new THREE.Group();
  readonly atlas: THREE.WebGLRenderTarget;
  readonly atlasScene = new THREE.Scene();
  readonly trueProxy: THREE.Mesh;
  readonly laggedProxy: THREE.Mesh;
  readonly units: ProjectorUnit[] = [];
  private readonly depthMaterial: THREE.ShaderMaterial;
  private readonly coverageMaterial: THREE.ShaderMaterial;
  private readonly bodyGeometry = new THREE.BoxGeometry(0.36, 0.14, 0.3);
  private readonly lensGeometry = new THREE.CylinderGeometry(0.05, 0.056, 0.06, 24);
  private readonly glassGeometry = new THREE.CircleGeometry(0.042, 24);
  private readonly bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x20262e, metalness: 0.5, roughness: 0.45 });
  private readonly glassMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.17, 0.13), toneMapped: false });
  private readonly aim = new THREE.Vector3();
  private inputs: ProjectorShaderInput[] = [];
  private count = 0;
  private layoutKey = "";
  private readonly scratch = new THREE.Vector3();
  private readonly scratchMatrix = new THREE.Matrix4();

  constructor() {
    this.group.name = "Projectors";
    this.atlas = new THREE.WebGLRenderTarget(TILE * MAX_PROJECTORS, TILE, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    this.atlas.texture.name = "Projector visibility atlas";
    this.depthMaterial = maxBlendMaterial(DEPTH_FRAGMENT, {
      uProjector: { value: new THREE.Vector3() },
      uRange: { value: new THREE.Vector2(0, 1) },
    });
    this.coverageMaterial = maxBlendMaterial(COVERAGE_FRAGMENT, {});
    this.trueProxy = new THREE.Mesh(new THREE.BufferGeometry(), this.depthMaterial);
    this.laggedProxy = new THREE.Mesh(new THREE.BufferGeometry(), this.coverageMaterial);
    this.trueProxy.frustumCulled = false;
    this.laggedProxy.frustumCulled = false;
    this.atlasScene.add(this.trueProxy, this.laggedProxy);
    this.atlasScene.matrixWorldAutoUpdate = false;
  }

  get activeCount(): number {
    return this.count;
  }

  get tileTexel(): number {
    return 1 / TILE;
  }

  /** Set the shape geometry used for visibility (shared, not owned). */
  setGeometry(geometry: THREE.BufferGeometry): void {
    this.trueProxy.geometry = geometry;
    this.laggedProxy.geometry = geometry;
  }

  /** Recompute where the projectors stand. Positions ease toward the targets. */
  layout(layout: RigLayout, immediate = false): void {
    const count = THREE.MathUtils.clamp(Math.round(layout.count), 1, MAX_PROJECTORS);
    if (count !== this.count) {
      this.rebuild(count);
      immediate = true;
    }
    this.aim.copy(layout.aim);
    const halfFov = THREE.MathUtils.degToRad(V_FOV_DEG / 2);
    const distance = Math.max(layout.minDistanceM, (layout.coverRadiusM / Math.tan(halfFov)) * 1.08);
    const azimuths = projectorAzimuths(count, layout.azimuthRad);
    this.units.forEach((unit, index) => {
      const azimuth = azimuths[index];
      const elevation = THREE.MathUtils.degToRad(ELEVATIONS_DEG[index % ELEVATIONS_DEG.length]);
      unit.target.set(
        layout.aim.x + Math.cos(elevation) * Math.sin(azimuth) * distance,
        layout.aim.y + Math.sin(elevation) * distance,
        layout.aim.z + Math.cos(elevation) * Math.cos(azimuth) * distance,
      );
      unit.target.y = Math.max(unit.target.y, layout.floorY + 0.3);
      unit.beamLength = distance + layout.coverRadiusM * 0.6;
      if (immediate) unit.current.copy(unit.target);
    });
    const key = this.units.map((unit) => unit.beamLength.toFixed(3)).join(",");
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      for (const unit of this.units) {
        unit.beam.geometry.dispose();
        unit.beam.geometry = createBeamGeometry(unit.beamLength);
      }
    }
    this.applyPositions();
  }

  /** Ease positions, refresh cameras and the Studio projector inputs. */
  update(dtS: number, timeS: number, beamStrength: number): void {
    const rate = 1 - Math.exp(-dtS * 5);
    let moved = false;
    for (const unit of this.units) {
      if (unit.current.distanceToSquared(unit.target) > 1e-8) {
        unit.current.lerp(unit.target, rate);
        moved = true;
      }
      updateProjectionBeamMaterial(unit.beam.material, timeS, beamStrength);
      unit.beam.visible = beamStrength > 0.0005;
    }
    if (moved) this.applyPositions();
  }

  /** Studio ProjectorShaderInput list, for updateOrbitalSurfaceMaterial. */
  get shaderInputs(): readonly ProjectorShaderInput[] {
    return this.inputs;
  }

  /** Fill the lab-specific atlas uniforms on the surface material. */
  applyAtlasUniforms(material: THREE.ShaderMaterial): void {
    const matrices = material.uniforms.uLabProjectorMatrices.value as THREE.Matrix4[];
    const ranges = material.uniforms.uLabDepthRanges.value as THREE.Vector2[];
    for (let index = 0; index < MAX_PROJECTORS; index += 1) {
      const unit = this.units[index];
      if (!unit) {
        matrices[index].identity();
        ranges[index].set(0, 1);
        continue;
      }
      matrices[index].multiplyMatrices(unit.camera.projectionMatrix, unit.camera.matrixWorldInverse);
      ranges[index].copy(unit.range);
    }
    material.uniforms.uLabAtlas.value = this.atlas.texture;
    (material.uniforms.uLabTileTexel.value as THREE.Vector2).set(1 / TILE, 1 / TILE);
  }

  /**
   * Render the visibility atlas. The proxies must already carry the true and
   * lagged world matrices; boundingRadius is the body's radius in metres.
   */
  renderAtlas(renderer: THREE.WebGLRenderer, bodyCentre: THREE.Vector3, boundingRadiusM: number): void {
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearBackup);
    renderer.autoClear = false;
    this.atlas.viewport.set(0, 0, TILE * MAX_PROJECTORS, TILE);
    renderer.setRenderTarget(this.atlas);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    const uniforms = this.depthMaterial.uniforms;
    this.units.forEach((unit, index) => {
      const distance = unit.current.distanceTo(bodyCentre);
      unit.range.set(Math.max(0.01, distance - boundingRadiusM * 1.1), distance + boundingRadiusM * 1.1);
      (uniforms.uProjector.value as THREE.Vector3).copy(unit.current);
      (uniforms.uRange.value as THREE.Vector2).copy(unit.range);
      this.atlas.viewport.set(index * TILE, 0, TILE, TILE);
      renderer.setRenderTarget(this.atlas);
      renderer.render(this.atlasScene, unit.camera);
    });
    this.atlas.viewport.set(0, 0, TILE * MAX_PROJECTORS, TILE);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(this.clearBackup, previousClearAlpha);
    renderer.autoClear = previousAutoClear;
  }

  private readonly clearBackup = new THREE.Color();

  setVisible(bodies: boolean): void {
    for (const unit of this.units) {
      unit.group.visible = bodies;
    }
  }

  dispose(): void {
    this.rebuild(0);
    this.atlas.dispose();
    this.depthMaterial.dispose();
    this.coverageMaterial.dispose();
    this.bodyGeometry.dispose();
    this.lensGeometry.dispose();
    this.glassGeometry.dispose();
    this.bodyMaterial.dispose();
    this.glassMaterial.dispose();
  }

  private rebuild(count: number): void {
    for (const unit of this.units) {
      unit.beam.geometry.dispose();
      unit.beam.material.dispose();
      this.group.remove(unit.group);
    }
    this.units.length = 0;
    this.layoutKey = "";
    this.count = count;
    for (let index = 0; index < count; index += 1) {
      const group = new THREE.Group();
      group.name = `Projector ${index + 1}`;
      const body = new THREE.Mesh(this.bodyGeometry, this.bodyMaterial);
      body.position.z = -0.12;
      const lens = new THREE.Mesh(this.lensGeometry, this.bodyMaterial);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0.08, 0, 0.05);
      const glass = new THREE.Mesh(this.glassGeometry, this.glassMaterial);
      glass.position.set(0.08, 0, 0.081);
      group.add(body, lens, glass);
      const beam = new THREE.Mesh(createBeamGeometry(1), createProjectionBeamMaterial(0xffe6c4, index * 1.71));
      beam.name = `Projector ${index + 1} beam`;
      beam.position.set(0.08, 0, 0.082);
      beam.renderOrder = 2;
      beam.frustumCulled = false;
      group.add(beam);
      this.group.add(group);
      const camera = new THREE.PerspectiveCamera(V_FOV_DEG, RASTER_ASPECT, 0.05, 100);
      const halfV = THREE.MathUtils.degToRad(V_FOV_DEG / 2);
      const tanV = Math.tan(halfV);
      const diagonal = Math.atan(tanV * Math.sqrt(1 + RASTER_ASPECT * RASTER_ASPECT));
      this.units.push({
        group,
        beam,
        camera,
        current: new THREE.Vector3(),
        target: new THREE.Vector3(),
        range: new THREE.Vector2(0, 1),
        beamLength: 1,
        input: {
          position: { x: 0, y: 0, z: 0 },
          direction: { x: 0, y: -1, z: 0 },
          right: { x: 1, y: 0, z: 0 },
          up: { x: 0, y: 1, z: 0 },
          rasterAspect: RASTER_ASPECT,
          lensShift: { x: 0, y: 0 },
          cosHalfFov: Math.cos(diagonal),
          tanHalfFov: tanV,
          level: 1,
          colorHex: "#fff3e4",
          blend: { left: 0.05, right: 0.05, top: 0.06, bottom: 0.06 },
          blendGamma: 1,
          blackLevel: 0,
          enabled: true,
        },
      });
    }
    this.inputs = this.units.map((unit) => unit.input);
  }

  private applyPositions(): void {
    for (const unit of this.units) {
      unit.group.position.copy(unit.current);
      unit.group.lookAt(this.aim);
      const camera = unit.camera;
      camera.position.copy(unit.current);
      const direction = this.scratch.copy(this.aim).sub(unit.current).normalize();
      camera.up.set(0, 1, 0);
      if (Math.abs(direction.y) > 0.94) camera.up.set(0, 0, 1);
      camera.lookAt(this.aim);
      const distance = unit.current.distanceTo(this.aim);
      camera.near = Math.max(0.03, distance * 0.2);
      camera.far = distance * 3 + 10;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      const input = unit.input;
      input.position.x = unit.current.x;
      input.position.y = unit.current.y;
      input.position.z = unit.current.z;
      input.direction.x = direction.x;
      input.direction.y = direction.y;
      input.direction.z = direction.z;
      // Match THREE.Camera.lookAt's basis so the atlas and the Studio frustum agree.
      const m = this.scratchMatrix.extractRotation(camera.matrixWorld).elements;
      input.right.x = m[0];
      input.right.y = m[1];
      input.right.z = m[2];
      input.up.x = m[4];
      input.up.y = m[5];
      input.up.z = m[6];
    }
  }
}

/** Open four-sided pyramid along +Z with UVs for Studio's beam shader. */
function createBeamGeometry(length: number): THREE.BufferGeometry {
  const halfV = Math.tan(THREE.MathUtils.degToRad(V_FOV_DEG / 2)) * length;
  const halfH = halfV * RASTER_ASPECT;
  const corners = [
    new THREE.Vector3(-halfH, -halfV, length),
    new THREE.Vector3(halfH, -halfV, length),
    new THREE.Vector3(halfH, halfV, length),
    new THREE.Vector3(-halfH, halfV, length),
  ];
  const across = 6;
  const along = 10;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  for (let face = 0; face < 4; face += 1) {
    const a = corners[face];
    const b = corners[(face + 1) % 4];
    const base = positions.length / 3;
    for (let j = 0; j <= along; j += 1) {
      const v = j / along;
      for (let i = 0; i <= across; i += 1) {
        const u = i / across;
        point.copy(a).lerp(b, u).multiplyScalar(v);
        positions.push(point.x, point.y, point.z);
        uvs.push(u, v);
      }
    }
    for (let j = 0; j < along; j += 1) {
      for (let i = 0; i < across; i += 1) {
        const p = base + j * (across + 1) + i;
        const q = p + across + 1;
        indices.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
