/**
 * The dark gallery: a faintly reflective floor that fades into the void, a
 * haze backdrop, a person for scale, and a matching environment map so the
 * Material view (especially mirror Mylar) reflects a dark room with a few
 * soft light sources rather than a bright studio.
 */
import * as THREE from "three";

const FLOOR_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uBase;
  uniform vec3 uGlowColour;
  uniform float uGlow;
  uniform float uFanRadius;
  uniform float uScale;
  uniform vec3 uBodyPosition;
  uniform float uBodyRadius;
  uniform vec3 uBodyColour;
  uniform float uBodyGlow;
  uniform float uFloorY;
  uniform float uRingSpacing;
  uniform vec3 uFar;
  varying vec3 vWorld;

  void main() {
    vec2 p = vWorld.xz;
    float r = length(p);
    float reach = uScale * 4.2;
    float falloff = exp(-(r * r) / (reach * reach));
    vec3 colour = mix(uFar, uBase, falloff);

    // Cool light pool from the jet and the outlet lip.
    float pool = exp(-pow(r / (uFanRadius * 2.4), 2.0));
    float lip = exp(-pow((r - uFanRadius * 1.1) / (uFanRadius * 0.16 + 0.01), 2.0));
    colour += uGlowColour * (pool * 0.55 + lip * 0.35) * uGlow;

    // Soft, blurred reflection of the lit body: brighter and tighter when low.
    float h = max(uBodyPosition.y - uFloorY, 0.0);
    float spread = uBodyRadius * 1.1 + h * 0.45;
    float d = length(p - uBodyPosition.xz);
    float reflection = exp(-pow(d / spread, 2.0)) * uBodyGlow / (1.0 + h / max(uBodyRadius, 0.05) * 0.35);
    colour += uBodyColour * reflection;

    // Metre rings, barely there, so scale reads without a grid.
    float ringCoord = r / uRingSpacing;
    float ring = abs(fract(ringCoord + 0.5) - 0.5);
    float ringWidth = fwidth(ringCoord) * 1.1;
    float ringLine = 1.0 - smoothstep(0.0, ringWidth, ring);
    colour += vec3(0.55, 0.75, 0.85) * ringLine * 0.028 * falloff * step(0.6, ringCoord);

    // Far floor dissolves into the haze so there is no hard horizon.
    float haze = smoothstep(reach * 0.9, reach * 3.5, r);
    colour = mix(colour, uFar, haze);
    gl_FragColor = vec4(colour, 1.0);
  }
`;

const BACKDROP_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const BACKDROP_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uGlow;
  varying vec3 vDirection;
  void main() {
    float y = vDirection.y;
    float band = exp(-pow((y - 0.06) / 0.3, 2.0));
    vec3 colour = mix(uHorizon, uZenith, smoothstep(0.02, 0.8, y));
    colour += uGlow * band;
    gl_FragColor = vec4(colour, 1.0);
  }
`;

export interface FloorUpdate {
  floorY: number;
  fanRadius: number;
  glow: number;
  scale: number;
  bodyPosition: THREE.Vector3;
  bodyRadius: number;
  bodyGlow: number;
  bodyColour: THREE.Color;
}

export class GalleryEnvironment {
  readonly group = new THREE.Group();
  readonly floor: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  readonly backdrop: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly person: THREE.Group;
  private readonly personMaterial: THREE.ShaderMaterial;
  private personOpacity = 1;

  constructor() {
    this.group.name = "Gallery environment";
    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(80, 96),
      new THREE.ShaderMaterial({
        name: "LabFloor",
        vertexShader: FLOOR_VERTEX,
        fragmentShader: FLOOR_FRAGMENT,
        uniforms: {
          uBase: { value: new THREE.Color(0x0a0f15) },
          uGlowColour: { value: new THREE.Color(0x2bb8d6) },
          uGlow: { value: 0.3 },
          uFanRadius: { value: 0.5 },
          uScale: { value: 2 },
          uBodyPosition: { value: new THREE.Vector3(0, 1, 0) },
          uBodyRadius: { value: 0.5 },
          uBodyColour: { value: new THREE.Color(0x3a4a58) },
          uBodyGlow: { value: 0.2 },
          uFloorY: { value: 0 },
          uRingSpacing: { value: 1 },
          uFar: { value: new THREE.Color(0x05080c) },
        },
      }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.name = "Floor";
    this.floor.renderOrder = -2;
    this.group.add(this.floor);

    this.backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(150, 48, 24),
      new THREE.ShaderMaterial({
        name: "LabBackdrop",
        vertexShader: BACKDROP_VERTEX,
        fragmentShader: BACKDROP_FRAGMENT,
        uniforms: {
          uHorizon: { value: new THREE.Color(0x05080c) },
          uZenith: { value: new THREE.Color(0x020304) },
          uGlow: { value: new THREE.Color(0x03070b) },
        },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.backdrop.name = "Haze backdrop";
    this.backdrop.renderOrder = -3;
    this.group.add(this.backdrop);

    this.personMaterial = new THREE.ShaderMaterial({
      name: "LabPerson",
      transparent: true,
      uniforms: {
        uOpacity: { value: 1 },
        uRim: { value: new THREE.Color(0x6f8796) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uOpacity;
        uniform vec3 uRim;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.4);
          vec3 colour = vec3(0.012, 0.016, 0.02) + uRim * rim * 0.3;
          gl_FragColor = vec4(colour, uOpacity * 0.92);
        }
      `,
    });
    this.person = buildPerson(this.personMaterial);
    this.person.name = "Person for scale (1.75 m)";
    this.group.add(this.person);
  }

  get floorUniforms(): Record<string, THREE.IUniform> {
    return this.floor.material.uniforms;
  }

  setFloor(update: FloorUpdate): void {
    const uniforms = this.floor.material.uniforms;
    this.floor.position.y = update.floorY;
    uniforms.uFloorY.value = update.floorY;
    uniforms.uFanRadius.value = update.fanRadius;
    uniforms.uGlow.value = update.glow;
    uniforms.uScale.value = update.scale;
    (uniforms.uBodyPosition.value as THREE.Vector3).copy(update.bodyPosition);
    uniforms.uBodyRadius.value = update.bodyRadius;
    uniforms.uBodyGlow.value = update.bodyGlow;
    (uniforms.uBodyColour.value as THREE.Color).copy(update.bodyColour);
    uniforms.uRingSpacing.value = update.scale < 1.2 ? 0.25 : update.scale < 3 ? 0.5 : 1;
  }

  /** Place the person beside the rig; fade them out for tabletop-scale designs. */
  placePerson(floorY: number, clearanceM: number, sceneHeightM: number): void {
    this.person.position.set(-(clearanceM * 1.2 + 1.25), floorY, -0.9 - clearanceM * 0.35);
    this.person.rotation.y = Math.PI * 0.12;
    // A person only helps once the scene is about their size; below that they loom.
    const target = THREE.MathUtils.smoothstep(sceneHeightM, 1.5, 2.4);
    this.personOpacity = target;
    this.personMaterial.uniforms.uOpacity.value = target;
    this.person.visible = target > 0.02;
  }

  get personVisible(): number {
    return this.personOpacity;
  }
}

function buildPerson(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    group.add(mesh);
  };
  const leg = new THREE.CapsuleGeometry(0.068, 0.7, 6, 12);
  add(leg, -0.095, 0.42, 0, 0.02);
  add(leg, 0.095, 0.42, 0, -0.02);
  add(new THREE.CapsuleGeometry(0.17, 0.4, 8, 16), 0, 1.13, 0);
  const arm = new THREE.CapsuleGeometry(0.048, 0.56, 6, 10);
  add(arm, -0.235, 1.08, 0, 0.06);
  add(arm, 0.235, 1.08, 0, -0.06);
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 12), 0, 1.47, 0);
  add(new THREE.SphereGeometry(0.108, 20, 14), 0, 1.62, 0);
  group.scale.setScalar(1.75 / 1.73);
  return group;
}

/**
 * A dark-room environment map: black walls, a few soft strips like projector
 * light spilling on the ceiling and a cool floor glow. Used for PBR reflections.
 */
export function createGalleryEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020304);
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x07090c, side: THREE.BackSide }),
  );
  scene.add(room);
  const panel = (w: number, h: number, colour: number, intensity: number, position: THREE.Vector3) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    mesh.position.copy(position);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel(6, 1.1, 0xdfe8ef, 3.2, new THREE.Vector3(0, 7.5, -3));
  panel(1.2, 3.2, 0xffd2a0, 2.4, new THREE.Vector3(-7.5, 2.5, 3));
  panel(1.2, 3.2, 0xb8e9ff, 1.6, new THREE.Vector3(7.5, 1.5, -2));
  panel(0.5, 0.5, 0xffffff, 8, new THREE.Vector3(3, 3, 7.5));
  panel(0.5, 0.5, 0xffffff, 6, new THREE.Vector3(-6, 2.6, -5));
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 2.4, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2bb8d6).multiplyScalar(0.9), side: THREE.DoubleSide }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -4;
  scene.add(glow);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
  return target.texture;
}
