/**
 * The tracking camera, modelled on Orbital's HuaTeng Stage A camera
 * (1024 x 768 Mono8, 91 fps). It is drawn as a picture-in-picture on the main
 * renderer with scissor and viewport: a monochrome silhouette, like the NIR
 * feed the Orbital Tracker thresholds, with the detected ellipse overlaid.
 */
import * as THREE from "three";
import type { TrackedEllipse, VirtualCamera } from "../model/types";

export const TRACKING_RASTER = { width: 1024, height: 768, fps: 91 } as const;

const SILHOUETTE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SILHOUETTE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uLevel;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    // NIR flood from the camera side: nearly flat white, a touch darker at the rim.
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float value = uLevel * (0.8 + 0.2 * facing);
    gl_FragColor = vec4(vec3(value), 1.0);
  }
`;

export class TrackingView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, TRACKING_RASTER.width / TRACKING_RASTER.height, 0.05, 200);
  readonly virtualCamera: VirtualCamera = {
    position: { x: 0, y: 1, z: 4 },
    target: { x: 0, y: 1, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    verticalFovDeg: 40,
    widthPx: TRACKING_RASTER.width,
    heightPx: TRACKING_RASTER.height,
  };
  readonly body: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** A small camera body in the main scene so you can see where it looks from. */
  readonly marker = new THREE.Group();
  private readonly fanRing: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly markerGeometries: THREE.BufferGeometry[] = [];
  private readonly markerMaterials: THREE.Material[] = [];
  private frustumLines: THREE.LineSegments | null = null;

  constructor() {
    this.scene.background = null;
    this.material = new THREE.ShaderMaterial({
      vertexShader: SILHOUETTE_VERTEX,
      fragmentShader: SILHOUETTE_FRAGMENT,
      uniforms: { uLevel: { value: 0.96 } },
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.body = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.body.frustumCulled = false;
    this.scene.add(this.body);
    // The fan lip reflects a little NIR: a faint grey ring, as in real feeds.
    this.fanRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.02, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x1c1c1c, toneMapped: false }),
    );
    this.fanRing.rotation.x = Math.PI / 2;
    this.scene.add(this.fanRing);

    const housing = new THREE.BoxGeometry(0.09, 0.07, 0.12);
    const lens = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 20);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.4, roughness: 0.5 });
    const lensMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.05, 0.05), toneMapped: false });
    this.markerGeometries.push(housing, lens);
    this.markerMaterials.push(bodyMaterial, lensMaterial);
    const housingMesh = new THREE.Mesh(housing, bodyMaterial);
    housingMesh.position.z = -0.06;
    const lensMesh = new THREE.Mesh(lens, lensMaterial);
    lensMesh.rotation.x = Math.PI / 2;
    lensMesh.position.z = 0.02;
    this.marker.add(housingMesh, lensMesh);
    this.marker.name = "Tracking camera";
  }

  setGeometry(geometry: THREE.BufferGeometry): void {
    this.body.geometry = geometry;
  }

  /** Place the fixed camera for this design: low, beside the rig, looking at the hover point. */
  place(aim: THREE.Vector3, coverRadiusM: number, fanRadiusM: number, floorY: number): void {
    const distance = Math.max(1.6, coverRadiusM * 4.2 + fanRadiusM);
    const azimuth = Math.PI * 0.58;
    const height = THREE.MathUtils.clamp(aim.y * 0.45, floorY + 0.35, aim.y + 0.5);
    const position = new THREE.Vector3(
      aim.x + Math.sin(azimuth) * distance,
      height,
      aim.z + Math.cos(azimuth) * distance,
    );
    // Look slightly below the hover point so the silhouette sits above the readout.
    const lookAt = new THREE.Vector3(aim.x, aim.y - coverRadiusM * 0.32, aim.z);
    const range = position.distanceTo(lookAt);
    const vfov = THREE.MathUtils.radToDeg(2 * Math.atan((coverRadiusM * 1.9) / range));
    const fov = THREE.MathUtils.clamp(vfov, 12, 70);
    this.virtualCamera.position = { x: position.x, y: position.y, z: position.z };
    this.virtualCamera.target = { x: lookAt.x, y: lookAt.y, z: lookAt.z };
    this.virtualCamera.up = { x: 0, y: 1, z: 0 };
    this.virtualCamera.verticalFovDeg = fov;
    this.camera.position.copy(position);
    this.camera.up.set(0, 1, 0);
    this.camera.fov = fov;
    this.camera.near = Math.max(0.02, range * 0.05);
    this.camera.far = range * 6 + 20;
    this.camera.lookAt(lookAt);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.marker.position.copy(position);
    this.marker.lookAt(lookAt);
    this.fanRing.scale.setScalar(fanRadiusM * 2.1);
    this.updateFrustum(Math.min(range * 0.22, 1.2), fov);
  }

  /** Mirror the body pose (true pose: the camera sees what is really there). */
  syncBody(source: THREE.Object3D): void {
    this.body.matrixAutoUpdate = false;
    this.body.matrixWorld.copy(source.matrixWorld);
    this.body.matrix.copy(source.matrixWorld);
    this.body.matrixWorldNeedsUpdate = false;
  }

  /** Scissor-render into the PiP rectangle (CSS px, top-left origin). */
  render(
    renderer: THREE.WebGLRenderer,
    rect: { x: number; y: number; width: number; height: number },
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    if (rect.width < 2 || rect.height < 2) return;
    const y = canvasHeight - rect.y - rect.height;
    const previousAutoClear = renderer.autoClear;
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setScissor(rect.x, y, rect.width, rect.height);
    renderer.setViewport(rect.x, y, rect.width, rect.height);
    renderer.setClearColor(0x060606, 1);
    renderer.clear(true, true, false);
    this.scene.matrixWorldAutoUpdate = false;
    this.fanRing.updateMatrixWorld(true);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    // Restore the full viewport: the composer's final pass draws with it.
    renderer.setScissor(0, 0, canvasWidth, canvasHeight);
    renderer.setViewport(0, 0, canvasWidth, canvasHeight);
    renderer.autoClear = previousAutoClear;
  }

  setMarkerVisible(visible: boolean): void {
    this.marker.visible = visible;
  }

  dispose(): void {
    this.material.dispose();
    this.fanRing.geometry.dispose();
    (this.fanRing.material as THREE.Material).dispose();
    for (const geometry of this.markerGeometries) geometry.dispose();
    for (const material of this.markerMaterials) material.dispose();
    this.frustumLines?.geometry.dispose();
    (this.frustumLines?.material as THREE.Material | undefined)?.dispose();
  }

  private updateFrustum(length: number, fovDeg: number): void {
    if (this.frustumLines) {
      this.marker.remove(this.frustumLines);
      this.frustumLines.geometry.dispose();
    }
    const halfV = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)) * length;
    const halfH = halfV * (TRACKING_RASTER.width / TRACKING_RASTER.height);
    const corners = [
      [-halfH, -halfV],
      [halfH, -halfV],
      [halfH, halfV],
      [-halfH, halfV],
    ];
    const points: number[] = [];
    for (const [x, y] of corners) points.push(0, 0, 0.04, x, y, length);
    for (let i = 0; i < 4; i += 1) {
      const [x0, y0] = corners[i];
      const [x1, y1] = corners[(i + 1) % 4];
      points.push(x0, y0, length, x1, y1, length);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const material =
      (this.frustumLines?.material as THREE.LineBasicMaterial | undefined) ??
      new THREE.LineBasicMaterial({ color: 0x7cf3c6, transparent: true, opacity: 0.06, depthWrite: false });
    this.frustumLines = new THREE.LineSegments(geometry, material);
    this.marker.add(this.frustumLines);
  }
}

/** 2D overlay painter for the PiP: detected ellipse, centre cross, lag ellipse. */
export class TrackingOverlay {
  private readonly ctx: CanvasRenderingContext2D | null;
  private noise: HTMLCanvasElement | null = null;
  private frame = 0;
  private pixelRatio = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
  }

  resize(widthCss: number, heightCss: number, pixelRatio: number): void {
    this.pixelRatio = pixelRatio;
    const width = Math.max(1, Math.round(widthCss * pixelRatio));
    const height = Math.max(1, Math.round(heightCss * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.noise = null;
    }
  }

  draw(measured: TrackedEllipse | null, projected: TrackedEllipse | null, lagVisible: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    // Sensor grain and vignette, so the feed reads as a camera and not a render.
    this.frame = (this.frame + 1) % 4;
    const noise = this.ensureNoise(width, height);
    if (noise) {
      ctx.globalAlpha = 0.07;
      ctx.drawImage(noise, (this.frame * 37) % 64, (this.frame * 53) % 64, width, height, 0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.3, width / 2, height / 2, height * 0.85);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    const sx = width / TRACKING_RASTER.width;
    const sy = height / TRACKING_RASTER.height;
    const scale = this.pixelRatio;
    if (projected && lagVisible) {
      this.ellipse(ctx, projected, sx, sy, "rgba(255,180,94,0.95)", [5 * scale, 4 * scale], 1.4 * scale);
    }
    if (measured) {
      this.ellipse(ctx, measured, sx, sy, "rgba(124,243,198,0.95)", [], 1.5 * scale);
      const cx = measured.centerPx[0] * sx;
      const cy = measured.centerPx[1] * sy;
      const arm = 7 * scale;
      ctx.strokeStyle = "rgba(124,243,198,0.95)";
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      ctx.moveTo(cx - arm, cy);
      ctx.lineTo(cx + arm, cy);
      ctx.moveTo(cx, cy - arm);
      ctx.lineTo(cx, cy + arm);
      ctx.stroke();
    }
  }

  private ellipse(
    ctx: CanvasRenderingContext2D,
    e: TrackedEllipse,
    sx: number,
    sy: number,
    colour: string,
    dash: number[],
    lineWidth: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.ellipse(
      e.centerPx[0] * sx,
      e.centerPx[1] * sy,
      Math.max(0.5, (e.majorPx / 2) * sx),
      Math.max(0.5, (e.minorPx / 2) * sy),
      (e.angleDeg * Math.PI) / 180,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }

  private ensureNoise(width: number, height: number): HTMLCanvasElement | null {
    if (this.noise) return this.noise;
    const canvas = document.createElement("canvas");
    canvas.width = width + 64;
    canvas.height = height + 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const image = ctx.createImageData(canvas.width, canvas.height);
    let state = 0x9e3779b9;
    for (let i = 0; i < image.data.length; i += 4) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const value = (state >>> 0) & 255;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    this.noise = canvas;
    return canvas;
  }
}
