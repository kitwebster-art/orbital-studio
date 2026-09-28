/**
 * The fan on the floor, drawn from the design: outlet diameter, housing, and a
 * rotor whose look depends on the fan type. The outlet disc sits at y = 0 and
 * blows up +Y, matching the physics model's coordinates.
 */
import * as THREE from "three";
import type { FanType } from "../model/types";

export function fanHousingHeight(diameterM: number): number {
  return THREE.MathUtils.clamp(0.36 * diameterM + 0.08, 0.14, 0.95);
}

const HONEYCOMB_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HONEYCOMB_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uCell;
  uniform float uDepth;
  uniform float uRadius;
  uniform vec3 uColour;
  varying vec3 vWorld;
  varying vec2 vLocal;

  float hexDistance(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
  }

  float hexEdge(vec2 p) {
    vec2 lattice = vec2(1.0, 1.7320508);
    vec2 half_ = lattice * 0.5;
    vec2 a = mod(p, lattice) - half_;
    vec2 b = mod(p - half_, lattice) - half_;
    vec2 cell = dot(a, a) < dot(b, b) ? a : b;
    float d = 0.5 - hexDistance(cell);
    float w = fwidth(d) * 1.2;
    return 1.0 - smoothstep(0.035, 0.035 + w, d);
  }

  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    vec2 p = vLocal / uCell;
    // Two layers of the same lattice, offset by parallax, read as cell walls.
    vec2 shift = view.xz / max(view.y, 0.2) * (uDepth / uCell);
    float top = hexEdge(p);
    float bottom = hexEdge(p + vec2(shift.x, -shift.y));
    float wall = max(top, bottom * 0.55);
    float rim = smoothstep(uRadius * 0.93, uRadius, length(vLocal));
    float alpha = clamp(max(wall, rim), 0.0, 1.0);
    vec3 colour = uColour * (0.55 + top * 0.6) ;
    gl_FragColor = vec4(colour, alpha * 0.92);
  }
`;

const BLUR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uStrength;
  uniform float uTime;
  uniform vec3 uColour;
  varying vec2 vLocal;
  uniform float uRadius;
  uniform float uHub;
  void main() {
    float r = length(vLocal) / uRadius;
    float a = atan(vLocal.y, vLocal.x);
    float bands = 0.6 + 0.4 * sin(a * 7.0 + uTime * 3.0);
    float annulus = smoothstep(uHub, uHub + 0.08, r) * (1.0 - smoothstep(0.9, 1.0, r));
    float alpha = annulus * uStrength * bands;
    gl_FragColor = vec4(uColour * alpha, alpha);
  }
`;

export class FanModel {
  readonly group = new THREE.Group();
  private readonly rotor = new THREE.Group();
  private readonly disposables: Array<{ dispose(): void }> = [];
  // Satin powder-coat: reads in a dark room without mirroring the void.
  private readonly housingMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b4450,
    metalness: 0.3,
    roughness: 0.46,
    envMapIntensity: 1.3,
  });
  private readonly bladeMaterial = new THREE.MeshStandardMaterial({
    color: 0x66727e,
    metalness: 0.35,
    roughness: 0.4,
    side: THREE.DoubleSide,
    envMapIntensity: 1.1,
  });
  private readonly darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x10151b,
    metalness: 0.5,
    roughness: 0.55,
  });
  private readonly glowMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x5ee7ff),
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private blurMaterial: THREE.ShaderMaterial | null = null;
  private diameter = 0;
  private type: FanType | null = null;
  private visualSpinHz = 0;
  private blur = 0;
  private time = 0;

  constructor() {
    this.group.name = "Fan";
    this.rotor.name = "Rotor";
  }

  get housingHeight(): number {
    return fanHousingHeight(this.diameter);
  }

  /** Rebuild only when the diameter or fan type actually changed. */
  configure(diameterM: number, type: FanType): void {
    if (Math.abs(diameterM - this.diameter) < 1e-4 && type === this.type) return;
    this.diameter = diameterM;
    this.type = type;
    this.rebuild();
  }

  /** Visual drive from the physics: outlet speed (m/s) and rotor rpm. */
  update(dtS: number, outletSpeedMps: number, approxRpm: number, reducedMotion: boolean): void {
    this.time += dtS;
    const realHz = Math.max(0, approxRpm) / 60;
    // Show a calm, readable rotation; high rpm becomes a motion-blur disc.
    const targetHz = reducedMotion ? 0 : Math.min(realHz, 1.6) * 0.9;
    this.visualSpinHz += (targetHz - this.visualSpinHz) * Math.min(1, dtS * 3);
    this.rotor.rotation.y -= this.visualSpinHz * Math.PI * 2 * dtS;
    const blurTarget = reducedMotion ? 0 : THREE.MathUtils.smoothstep(realHz, 2, 18);
    this.blur += (blurTarget - this.blur) * Math.min(1, dtS * 3);
    if (this.blurMaterial) {
      this.blurMaterial.uniforms.uStrength.value = this.blur * 0.2;
      this.blurMaterial.uniforms.uTime.value = this.time;
    }
    const glow = THREE.MathUtils.clamp(outletSpeedMps / 18, 0.05, 1);
    this.glowMaterial.opacity = 0.18 + glow * 0.55;
  }

  dispose(): void {
    this.clear();
    this.housingMaterial.dispose();
    this.bladeMaterial.dispose();
    this.darkMaterial.dispose();
    this.glowMaterial.dispose();
  }

  private clear(): void {
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
    this.blurMaterial = null;
    this.rotor.clear();
    this.rotor.rotation.set(0, 0, 0);
    this.group.clear();
  }

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private rebuild(): void {
    this.clear();
    const R = this.diameter / 2;
    const H = fanHousingHeight(this.diameter);
    const wall = Math.max(0.012, R * 0.07);

    // Housing: a solid ring with a rounded bell-mouth lip at the outlet.
    // The base sits a few millimetres proud of the floor to avoid z-fighting.
    const base = -H + Math.max(0.003, H * 0.012);
    const profile: THREE.Vector2[] = [];
    profile.push(new THREE.Vector2(R, base + 0.004));
    profile.push(new THREE.Vector2(R, -wall * 0.5));
    for (let i = 0; i <= 10; i += 1) {
      const angle = Math.PI - (i / 10) * Math.PI;
      profile.push(new THREE.Vector2(R + wall / 2 + Math.cos(angle) * wall / 2, -wall * 0.5 + Math.sin(angle) * wall * 0.6));
    }
    profile.push(new THREE.Vector2(R + wall * 1.15, -H * 0.72));
    profile.push(new THREE.Vector2(R + wall * 1.6, base + wall * 0.4));
    profile.push(new THREE.Vector2(R + wall * 1.6, base));
    profile.push(new THREE.Vector2(R, base));
    const housing = new THREE.Mesh(this.track(new THREE.LatheGeometry(profile, 112)), this.housingMaterial);
    housing.name = "Housing";
    this.group.add(housing);

    // Interior shadow so the outlet reads as a deep opening.
    const well = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(R * 0.995, R * 0.995, H * 0.96, 64, 1, true)),
      this.darkMaterial,
    );
    well.position.y = -H * 0.5;
    this.group.add(well);
    const floorPlate = new THREE.Mesh(this.track(new THREE.CircleGeometry(R, 64)), this.darkMaterial);
    floorPlate.rotation.x = -Math.PI / 2;
    floorPlate.position.y = -H * 0.97;
    this.group.add(floorPlate);

    // Outlet glow ring: the fan's "on" light, scaled with outlet speed.
    const glow = new THREE.Mesh(this.track(new THREE.TorusGeometry(R * 1.0 + wall * 0.5, wall * 0.1, 8, 128)), this.glowMaterial);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = wall * 0.12;
    this.group.add(glow);

    const hubRadius = R * 0.2;
    this.group.add(this.rotor);
    if (this.type === "plug-flowgrid") {
      this.buildPlugFan(R, H, hubRadius);
    } else {
      this.buildAxial(R, H, hubRadius, this.type === "axial-straightened");
    }

    // Motion blur disc in the rotor plane.
    const blurMaterial = this.track(
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          varying vec2 vLocal;
          void main() {
            vLocal = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: BLUR_FRAGMENT,
        uniforms: {
          uStrength: { value: 0 },
          uTime: { value: 0 },
          uColour: { value: new THREE.Color(0x8fa3b3) },
          uRadius: { value: R },
          uHub: { value: 0.22 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.blurMaterial = blurMaterial;
    const blurDisc = new THREE.Mesh(this.track(new THREE.CircleGeometry(R * 0.98, 64)), blurMaterial);
    blurDisc.rotation.x = -Math.PI / 2;
    blurDisc.position.y = this.type === "plug-flowgrid" ? -H * 0.52 : -H * 0.34;
    this.group.add(blurDisc);
  }

  private buildAxial(R: number, H: number, hubRadius: number, straightened: boolean): void {
    const bladeCount = straightened ? 9 : 6;
    const rotorY = -H * (straightened ? 0.52 : 0.36);
    const blade = this.track(createBladeGeometry(hubRadius * 1.02, R * 0.965, bladeCount, H * 0.2));
    for (let i = 0; i < bladeCount; i += 1) {
      const mesh = new THREE.Mesh(blade, this.bladeMaterial);
      mesh.rotation.y = (i / bladeCount) * Math.PI * 2;
      this.rotor.add(mesh);
    }
    this.rotor.position.y = rotorY;
    const hub = new THREE.Mesh(this.track(new THREE.CylinderGeometry(hubRadius, hubRadius * 1.08, H * 0.22, 32)), this.housingMaterial);
    hub.position.y = 0;
    this.rotor.add(hub);
    const nose = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(hubRadius, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
      this.housingMaterial,
    );
    nose.position.y = H * 0.11;
    this.rotor.add(nose);

    if (straightened) {
      // Stator vanes above the rotor take the swirl out of the jet.
      const vaneCount = 11;
      const span = R * 0.97 - hubRadius;
      const vane = this.track(new THREE.BoxGeometry(span, H * 0.2, Math.max(0.003, R * 0.014)));
      for (let i = 0; i < vaneCount; i += 1) {
        const angle = (i / vaneCount) * Math.PI * 2;
        const mesh = new THREE.Mesh(vane, this.darkMaterial);
        const mid = hubRadius + span / 2;
        mesh.position.set(Math.cos(angle) * mid, -H * 0.2, Math.sin(angle) * mid);
        mesh.rotation.y = -angle;
        this.group.add(mesh);
      }
      const statorHub = new THREE.Mesh(this.track(new THREE.CylinderGeometry(hubRadius, hubRadius, H * 0.22, 32)), this.darkMaterial);
      statorHub.position.y = -H * 0.2;
      this.group.add(statorHub);
      const cap = new THREE.Mesh(
        this.track(new THREE.SphereGeometry(hubRadius, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
        this.housingMaterial,
      );
      cap.position.y = -H * 0.09;
      cap.scale.y = 0.6;
      this.group.add(cap);
    } else {
      // Finger guard: thin rings and spokes over the outlet.
      const guardMaterial = this.darkMaterial;
      const tube = Math.max(0.0015, R * 0.007);
      for (const fraction of [0.36, 0.62, 0.88]) {
        const ring = new THREE.Mesh(this.track(new THREE.TorusGeometry(R * fraction, tube, 6, 96)), guardMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -tube * 2;
        this.group.add(ring);
      }
      const spoke = this.track(new THREE.CylinderGeometry(tube, tube, R * 0.98, 6));
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI;
        const mesh = new THREE.Mesh(spoke, guardMaterial);
        mesh.rotation.z = Math.PI / 2;
        mesh.rotation.y = angle;
        mesh.position.y = -tube * 2;
        mesh.scale.y = 2;
        this.group.add(mesh);
      }
    }
  }

  private buildPlugFan(R: number, H: number, hubRadius: number): void {
    // A backward-curved plug impeller between a back plate and a shroud.
    const wheelR = R * 0.78;
    const eyeR = R * 0.42;
    const top = -H * 0.28;
    const bottom = -H * 0.78;
    const plate = new THREE.Mesh(this.track(new THREE.CylinderGeometry(wheelR, wheelR, Math.max(0.004, H * 0.02), 64)), this.housingMaterial);
    plate.position.y = bottom;
    this.rotor.add(plate);
    const shroud = new THREE.Mesh(this.track(new THREE.RingGeometry(eyeR, wheelR, 64)), this.bladeMaterial);
    shroud.rotation.x = -Math.PI / 2;
    shroud.position.y = top;
    this.rotor.add(shroud);
    const bladeCount = 10;
    const blade = this.track(createImpellerBladeGeometry(eyeR * 1.02, wheelR * 0.99, top - bottom));
    for (let i = 0; i < bladeCount; i += 1) {
      const mesh = new THREE.Mesh(blade, this.bladeMaterial);
      mesh.rotation.y = (i / bladeCount) * Math.PI * 2;
      mesh.position.y = bottom;
      this.rotor.add(mesh);
    }
    const hub = new THREE.Mesh(this.track(new THREE.CylinderGeometry(hubRadius * 0.8, hubRadius, H * 0.1, 32)), this.housingMaterial);
    hub.position.y = bottom + H * 0.05;
    this.rotor.add(hub);

    // FlowGrid honeycomb straightener across the outlet.
    const honeycomb = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(R * 1.0, 96)),
      this.track(
        new THREE.ShaderMaterial({
          vertexShader: HONEYCOMB_VERTEX,
          fragmentShader: HONEYCOMB_FRAGMENT,
          uniforms: {
            uCell: { value: Math.max(0.012, R / 9) },
            uDepth: { value: Math.max(0.01, R * 0.16) },
            uRadius: { value: R },
            uColour: { value: new THREE.Color(0x3a4450) },
          },
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    honeycomb.rotation.x = -Math.PI / 2;
    honeycomb.position.y = -Math.max(0.004, R * 0.02);
    honeycomb.renderOrder = 1;
    this.group.add(honeycomb);
  }
}

/** A twisted, swept axial blade as a double-sided surface. */
function createBladeGeometry(hubR: number, tipR: number, bladeCount: number, chordRise: number): THREE.BufferGeometry {
  const radial = 10;
  const chord = 8;
  const positions: number[] = [];
  const indices: number[] = [];
  const sector = (Math.PI * 2) / bladeCount;
  for (let i = 0; i <= radial; i += 1) {
    const t = i / radial;
    const r = hubR + (tipR - hubR) * t;
    const halfWidth = sector * 0.5 * (0.82 - 0.2 * t);
    const sweep = 0.32 * t * t;
    const rise = chordRise * (1 - 0.45 * t);
    for (let j = 0; j <= chord; j += 1) {
      const s = j / chord - 0.5;
      const theta = sweep + s * halfWidth * 2;
      const camber = (0.25 - s * s) * rise * 0.35;
      positions.push(Math.cos(theta) * r, s * rise + camber, Math.sin(theta) * r);
    }
  }
  for (let i = 0; i < radial; i += 1) {
    for (let j = 0; j < chord; j += 1) {
      const a = i * (chord + 1) + j;
      const b = a + chord + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A backward-curved centrifugal blade: an arc in plan, extruded vertically. */
function createImpellerBladeGeometry(innerR: number, outerR: number, height: number): THREE.BufferGeometry {
  const steps = 10;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const r = innerR + (outerR - innerR) * t;
    const theta = -0.9 * t + 0.25 * t * t;
    for (let j = 0; j <= 1; j += 1) {
      positions.push(Math.cos(theta) * r, j * height, Math.sin(theta) * r);
    }
  }
  for (let i = 0; i < steps; i += 1) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
