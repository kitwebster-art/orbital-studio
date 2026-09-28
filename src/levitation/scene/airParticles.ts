/**
 * Flow particles. Positions are advected on the CPU through the model's jet
 * field (sampleJet) into typed arrays, nudged around the body with a simple
 * potential-flow dipole on its bounding ellipsoid (or a slip condition on a
 * ring for the halo and ribbon), and drawn on the GPU as glowing streaks
 * stretched along each particle's velocity in screen space.
 *
 * The update loop allocates nothing: every scratch value is a module field.
 */
import * as THREE from "three";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** What the particles need from the physics model. */
export interface JetFieldSampler {
  /** Jet air velocity at world point p (m/s), written into out. */
  sample(p: Vec3Like, timeS: number, out: Vec3Like): void;
  /** Jet half-width (m) at height h above the outlet. */
  halfWidth(h: number): number;
}

export interface BodyObstacle {
  centre: THREE.Vector3;
  /** Body-to-world rotation. */
  quaternion: THREE.Quaternion;
  /** Bounding ellipsoid radii in the body frame (m), squash included. */
  radii: THREE.Vector3;
  /** Ring bodies (halo, ribbon) let air through the middle. */
  ring: { majorRadius: number; tubeRadius: number } | null;
  /** Body narrower than the jet: streamlines bend round it (potential flow). */
  potentialFlow: boolean;
  enabled: boolean;
}

export const MAX_PARTICLES = 16384;

const VERTEX = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 aVel;
  attribute vec2 aInfo;
  uniform float uTail;
  uniform float uHalfWidth;
  uniform vec2 uViewport;
  uniform float uSpeedRef;
  varying float vAlpha;
  varying float vSpeed;
  varying vec2 vQuad;

  void main() {
    vec3 head = aPos;
    vec3 tail = aPos - aVel * uTail;
    vec4 clipHead = projectionMatrix * viewMatrix * vec4(head, 1.0);
    vec4 clipTail = projectionMatrix * viewMatrix * vec4(tail, 1.0);
    if (clipHead.w <= 0.01 || clipTail.w <= 0.01 || aInfo.x <= 0.001) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vAlpha = 0.0;
      vSpeed = 0.0;
      vQuad = vec2(0.0);
      return;
    }
    vec2 screenHead = clipHead.xy / clipHead.w * uViewport * 0.5;
    vec2 screenTail = clipTail.xy / clipTail.w * uViewport * 0.5;
    vec2 axis = screenHead - screenTail;
    float lengthPx = length(axis);
    vec2 dir = lengthPx > 1e-3 ? axis / lengthPx : vec2(0.0, 1.0);
    vec2 side = vec2(-dir.y, dir.x);
    float along = position.x;
    vec4 clip = mix(clipTail, clipHead, along);
    vec2 offsetPx = side * position.y * uHalfWidth + dir * (along * 2.0 - 1.0) * uHalfWidth;
    clip.xy += offsetPx / (uViewport * 0.5) * clip.w;
    gl_Position = clip;
    vAlpha = aInfo.x;
    vSpeed = length(aVel) / max(uSpeedRef, 0.001);
    vQuad = vec2(along, position.y);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uIntensity;
  uniform vec3 uLow;
  uniform vec3 uMid;
  uniform vec3 uHigh;
  varying float vAlpha;
  varying float vSpeed;
  varying vec2 vQuad;

  void main() {
    float across = 1.0 - abs(vQuad.y);
    float core = across * across;
    float along = smoothstep(0.0, 0.85, vQuad.x);
    float s = clamp(vSpeed, 0.0, 1.25);
    vec3 colour = s < 0.55 ? mix(uLow, uMid, s / 0.55) : mix(uMid, uHigh, smoothstep(0.8, 1.15, s));
    float alpha = vAlpha * core * along * uIntensity * (0.3 + 0.55 * smoothstep(0.02, 0.4, s));
    gl_FragColor = vec4(colour * alpha, alpha);
  }
`;

// Scratch state for the allocation-free update loop.
const sp = { x: 0, y: 0, z: 0 };
const sv = { x: 0, y: 0, z: 0 };

export class AirParticles {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly info = new Float32Array(MAX_PARTICLES * 2);
  private readonly age = new Float32Array(MAX_PARTICLES);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly seed = new Float32Array(MAX_PARTICLES);
  private readonly posAttribute: THREE.InstancedBufferAttribute;
  private readonly velAttribute: THREE.InstancedBufferAttribute;
  private readonly infoAttribute: THREE.InstancedBufferAttribute;
  private active = 12288;
  private outletRadius = 0.5;
  private outletSpeed = 8;
  private topY = 4;
  private turbulence = 0.3;
  private travelTime = 1;
  private randomState = 0x2f6b1d3;
  private needsRefill = true;

  constructor() {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.posAttribute = new THREE.InstancedBufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.velAttribute = new THREE.InstancedBufferAttribute(this.velocities, 3).setUsage(THREE.DynamicDrawUsage);
    this.infoAttribute = new THREE.InstancedBufferAttribute(this.info, 2).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aPos", this.posAttribute);
    geometry.setAttribute("aVel", this.velAttribute);
    geometry.setAttribute("aInfo", this.infoAttribute);
    geometry.instanceCount = this.active;
    const material = new THREE.ShaderMaterial({
      name: "LabAirStreaks",
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTail: { value: 0.045 },
        uHalfWidth: { value: 1.1 },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uSpeedRef: { value: 8 },
        uIntensity: { value: 0.5 },
        uLow: { value: new THREE.Color(0x0b5a66) },
        uMid: { value: new THREE.Color(0x5ee7ff) },
        uHigh: { value: new THREE.Color(0xf2fdff) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "Air particles";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      this.seed[i] = this.random();
    }
  }

  get count(): number {
    return this.active;
  }

  setCount(count: number): void {
    const next = THREE.MathUtils.clamp(Math.round(count), 1024, MAX_PARTICLES);
    if (next > this.active) {
      for (let i = this.active; i < next; i += 1) this.spawn(i, true);
    }
    this.active = next;
    this.mesh.geometry.instanceCount = next;
  }

  /** Physical context: outlet radius and speed, visible top and turbulence. */
  configure(outletRadiusM: number, outletSpeedMps: number, topY: number, turbulence: number): void {
    // Particles adapt on their own as they respawn; only a big change of outlet
    // size warrants refilling the whole column at once.
    const changed = Math.abs(outletRadiusM - this.outletRadius) > this.outletRadius * 0.25;
    this.outletRadius = outletRadiusM;
    this.outletSpeed = Math.max(0.2, outletSpeedMps);
    this.topY = Math.max(0.3, topY);
    this.turbulence = THREE.MathUtils.clamp(turbulence, 0, 1);
    this.travelTime = this.topY / Math.max(0.35, this.outletSpeed * 0.45);
    this.mesh.material.uniforms.uSpeedRef.value = this.outletSpeed;
    // Trails a little longer for slow air so they stay readable.
    this.mesh.material.uniforms.uTail.value = THREE.MathUtils.clamp(0.4 / this.outletSpeed, 0.03, 0.12);
    if (changed) this.needsRefill = true;
  }

  setViewport(widthPx: number, heightPx: number, pixelRatio: number): void {
    const uniforms = this.mesh.material.uniforms;
    (uniforms.uViewport.value as THREE.Vector2).set(widthPx * pixelRatio, heightPx * pixelRatio);
    uniforms.uHalfWidth.value = 0.95 * pixelRatio;
  }

  setIntensity(intensity: number): void {
    this.mesh.material.uniforms.uIntensity.value = intensity;
  }

  update(dtS: number, timeS: number, field: JetFieldSampler, body: BodyObstacle): void {
    if (this.needsRefill) {
      for (let i = 0; i < MAX_PARTICLES; i += 1) this.spawn(i, true);
      this.needsRefill = false;
    }
    const dt = Math.min(dtS, 1 / 20);
    const positions = this.positions;
    const velocities = this.velocities;
    const info = this.info;
    const topY = this.topY;
    const fadeStart = topY * 0.55;
    const outlet = this.outletRadius;
    const outletSpeed = this.outletSpeed;
    const jitter = (0.04 + this.turbulence * 0.22) * outletSpeed;
    const stallSpeed = outletSpeed * 0.035;
    const followJet = 1 - Math.exp(-dt / 0.06);
    const coast = 1 - Math.exp(-dt / 0.4);
    const bodyActive = body.enabled;
    const qx = body.quaternion.x;
    const qy = body.quaternion.y;
    const qz = body.quaternion.z;
    const qw = body.quaternion.w;
    const cx = body.centre.x;
    const cy = body.centre.y;
    const cz = body.centre.z;
    const ax = body.radii.x;
    const ay = body.radii.y;
    const az = body.radii.z;
    const reach = Math.max(ax, ay, az) * (body.potentialFlow ? 3 : 1.35);
    const reach2 = reach * reach;
    const ring = body.ring;
    const dipole = body.potentialFlow && !ring;

    for (let i = 0; i < this.active; i += 1) {
      const i3 = i * 3;
      let px = positions[i3];
      let py = positions[i3 + 1];
      let pz = positions[i3 + 2];
      const pvx = velocities[i3];
      const pvy = velocities[i3 + 1];
      const pvz = velocities[i3 + 2];
      const previousSpeed = Math.sqrt(pvx * pvx + pvy * pvy + pvz * pvz);
      sp.x = px;
      sp.y = py;
      sp.z = pz;
      field.sample(sp, timeS, sv);
      // Smooth meander so streamlines breathe with the turbulence setting.
      const phase = this.seed[i] * 6.2831853;
      const fieldSpeed2 = sv.x * sv.x + sv.y * sv.y + sv.z * sv.z;
      const speedFactor = Math.min(1, fieldSpeed2 / (outletSpeed * outletSpeed) + 0.05);
      const fx = sv.x + Math.sin(py * 2.3 + timeS * 1.7 + phase) * jitter * speedFactor * 0.35;
      const fy = sv.y;
      const fz = sv.z + Math.cos(py * 2.1 - timeS * 1.3 + phase * 1.3) * jitter * speedFactor * 0.35;
      // Air in the jet follows it closely; air thrown out of the jet coasts.
      const k = fieldSpeed2 > previousSpeed * previousSpeed * 0.25 ? followJet : coast;
      let vx = pvx + (fx - pvx) * k;
      let vy = pvy + (fy - pvy) * k;
      let vz = pvz + (fz - pvz) * k;
      let hugging = 0;

      if (bodyActive) {
        const dx = px - cx;
        const dy = py - cy;
        const dz = pz - cz;
        if (dx * dx + dy * dy + dz * dz < reach2) {
          // World to body: rotate by the conjugate quaternion.
          let tx = 2 * (-qy * dz + qz * dy);
          let ty = 2 * (-qz * dx + qx * dz);
          let tz = 2 * (-qx * dy + qy * dx);
          let lx = dx + qw * tx + (-qy * tz + qz * ty);
          let ly = dy + qw * ty + (-qz * tx + qx * tz);
          let lz = dz + qw * tz + (-qx * ty + qy * tx);
          tx = 2 * (-qy * vz + qz * vy);
          ty = 2 * (-qz * vx + qx * vz);
          tz = 2 * (-qx * vy + qy * vx);
          let ux = vx + qw * tx + (-qy * tz + qz * ty);
          let uy = vy + qw * ty + (-qz * tx + qx * tz);
          let uz = vz + qw * tz + (-qx * ty + qy * tx);
          let pushed = false;
          let inShell = false;
          hugging = 0;
          let depth = 0;
          let nx = 0;
          let ny = 1;
          let nz = 0;

          if (ring) {
            const rho = Math.sqrt(lx * lx + lz * lz) + 1e-6;
            const dr = rho - ring.majorRadius;
            const len = Math.sqrt(dr * dr + ly * ly) + 1e-6;
            const d = len - ring.tubeRadius;
            nx = (lx / rho) * (dr / len);
            ny = ly / len;
            nz = (lz / rho) * (dr / len);
            inShell = d < ring.tubeRadius * 0.35;
            depth = -d;
          } else {
            const sx = lx / ax;
            const sy = ly / ay;
            const sz = lz / az;
            const r = Math.sqrt(sx * sx + sy * sy + sz * sz) + 1e-9;
            // Ellipsoid normal: gradient of the implicit surface.
            nx = sx / ax;
            ny = sy / ay;
            nz = sz / az;
            const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-9;
            nx /= nl;
            ny /= nl;
            nz /= nl;
            inShell = r < 1.16;
            depth = (1 - r) * Math.min(ax, ay, az);
            if (dipole && r > 1) {
              // Potential flow past a unit sphere in the normalised frame:
              // u = U (1 + 1/(2 r^3)) - 3/(2 r^5) (U.s) s
              const nUx = ux / ax;
              const nUy = uy / ay;
              const nUz = uz / az;
              const r2 = r * r;
              const inv3 = 1 / (r2 * r);
              const dot = nUx * sx + nUy * sy + nUz * sz;
              const kk = (1.5 * inv3) / r2;
              ux = (nUx * (1 + 0.5 * inv3) - kk * dot * sx) * ax;
              uy = (nUy * (1 + 0.5 * inv3) - kk * dot * sy) * ay;
              uz = (nUz * (1 + 0.5 * inv3) - kk * dot * sz) * az;
            }
          }

          if (depth > 0) {
            const push = depth * 1.02 + 1e-4;
            lx += nx * push;
            ly += ny * push;
            lz += nz * push;
            pushed = true;
          }
          if (inShell) {
            hugging = 1;
            // No flow into the skin: slide along it.
            const vn = ux * nx + uy * ny + uz * nz;
            if (vn < 0) {
              ux -= nx * vn;
              uy -= ny * vn;
              uz -= nz * vn;
            }
            // While the flow is attached (below the shoulder, facing the jet),
            // the jet is turned, not stopped: keep its speed along the wall
            // and let it curl round the curvature (Coanda).
            const upward = ny * (1 - 2 * (qx * qx + qz * qz)) + nx * 2 * (qx * qy + qw * qz) + nz * 2 * (qy * qz - qw * qx);
            if (upward < 0.28) {
              const speed = Math.sqrt(ux * ux + uy * uy + uz * uz) + 1e-9;
              const keep = previousSpeed * 0.985;
              if (speed < keep) {
                const scale = keep / speed;
                ux *= scale;
                uy *= scale;
                uz *= scale;
              }
              const hug = Math.min(speed, keep) * 0.12;
              ux -= nx * hug;
              uy -= ny * hug;
              uz -= nz * hug;
            }
          }

          // Body to world.
          tx = 2 * (qy * uz - qz * uy);
          ty = 2 * (qz * ux - qx * uz);
          tz = 2 * (qx * uy - qy * ux);
          vx = ux + qw * tx + (qy * tz - qz * ty);
          vy = uy + qw * ty + (qz * tx - qx * tz);
          vz = uz + qw * tz + (qx * ty - qy * tx);
          if (pushed) {
            tx = 2 * (qy * lz - qz * ly);
            ty = 2 * (qz * lx - qx * lz);
            tz = 2 * (qx * ly - qy * lx);
            px = cx + lx + qw * tx + (qy * tz - qz * ty);
            py = cy + ly + qw * ty + (qz * tx - qx * tz);
            pz = cz + lz + qw * tz + (qx * ty - qy * tx);
          }
        }
      }

      px += vx * dt;
      py += vy * dt;
      pz += vz * dt;
      positions[i3] = px;
      positions[i3 + 1] = py;
      positions[i3 + 2] = pz;
      velocities[i3] = vx;
      velocities[i3 + 1] = vy;
      velocities[i3 + 2] = vz;

      const age = this.age[i] + dt;
      this.age[i] = age;
      const lifeT = age / this.life[i];
      const horizontal2 = px * px + pz * pz;
      const limit = outlet * 3 + field.halfWidth(py > 0 ? py : 0) * 3.2 + reach;
      const speed2 = vx * vx + vy * vy + vz * vz;
      const stalled = age > 0.35 && speed2 < stallSpeed * stallSpeed;
      if (py > topY || py < -0.05 || lifeT >= 1 || horizontal2 > limit * limit || stalled) {
        this.spawn(i, false);
        continue;
      }
      const fadeIn = Math.min(1, lifeT * 10);
      const fadeOut = Math.min(1, (1 - lifeT) * 5);
      const heightFade = py > fadeStart ? 1 - (py - fadeStart) / (topY - fadeStart) : 1;
      // Streaks hugging the skin are drawn softer so they do not veil the projected image.
      info[i * 2] = fadeIn * fadeOut * heightFade * (hugging ? 0.5 : 1);
    }

    const count = this.active;
    this.posAttribute.clearUpdateRanges();
    this.posAttribute.addUpdateRange(0, count * 3);
    this.posAttribute.needsUpdate = true;
    this.velAttribute.clearUpdateRanges();
    this.velAttribute.addUpdateRange(0, count * 3);
    this.velAttribute.needsUpdate = true;
    this.infoAttribute.clearUpdateRanges();
    this.infoAttribute.addUpdateRange(0, count * 2);
    this.infoAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  private random(): number {
    // xorshift32: deterministic, allocation free.
    let x = this.randomState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 4294967296;
  }

  private spawn(i: number, fill: boolean): void {
    const i3 = i * 3;
    const radius = this.outletRadius * Math.sqrt(this.random()) * 0.97;
    const theta = this.random() * Math.PI * 2;
    let y = this.random() * this.outletRadius * 0.05 + 0.002;
    let spread = 1;
    if (fill) {
      y = this.random() * this.topY * 0.85;
      spread = 1 + (y / Math.max(this.topY, 0.1)) * 1.4;
    }
    this.positions[i3] = Math.cos(theta) * radius * spread;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = Math.sin(theta) * radius * spread;
    this.velocities[i3] = 0;
    this.velocities[i3 + 1] = this.outletSpeed * (fill ? 0.6 : 0.9);
    this.velocities[i3 + 2] = 0;
    this.life[i] = this.travelTime * (0.8 + this.random() * 1.7);
    this.age[i] = fill ? this.random() * this.life[i] * 0.8 : 0;
    this.info[i * 2] = 0;
    this.info[i * 2 + 1] = this.seed[i];
  }
}
