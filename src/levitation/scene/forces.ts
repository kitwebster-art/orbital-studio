/**
 * Forces overlay: arrows for weight, jet force, centring and shedding (plus
 * buoyancy when helium matters), with log-scaled lengths so small side forces
 * stay visible next to the weight. CP and CM markers show why some shapes
 * stand upright like a shuttlecock.
 */
import * as THREE from "three";
import type { ForceBreakdown, Vec3 } from "../model/types";
import { formatForce, joinFormatted } from "../format";

export type ForceKey = "weight" | "jet" | "centering" | "shedding" | "buoyancy";

export const FORCE_STYLE: Record<ForceKey, { label: string; colour: string }> = {
  weight: { label: "Weight", colour: "#ff6b6b" },
  jet: { label: "Jet push", colour: "#5ee7ff" },
  centering: { label: "Centring", colour: "#7cf3c6" },
  shedding: { label: "Vortex shedding", colour: "#ffd166" },
  buoyancy: { label: "Buoyancy", colour: "#b69cff" },
};

const KEYS: ForceKey[] = ["weight", "jet", "centering", "shedding", "buoyancy"];

class Arrow {
  readonly group = new THREE.Group();
  private readonly shaft: THREE.Mesh;
  private readonly head: THREE.Mesh;
  readonly tip = new THREE.Vector3();

  constructor(shaftGeometry: THREE.BufferGeometry, headGeometry: THREE.BufferGeometry, material: THREE.Material) {
    this.shaft = new THREE.Mesh(shaftGeometry, material);
    this.head = new THREE.Mesh(headGeometry, material);
    this.shaft.renderOrder = 20;
    this.head.renderOrder = 20;
    this.group.add(this.shaft, this.head);
  }

  set(origin: THREE.Vector3, direction: THREE.Vector3, length: number, radius: number): void {
    const headLength = Math.min(length * 0.42, radius * 7);
    const shaftLength = Math.max(0, length - headLength);
    this.group.position.copy(origin);
    this.group.quaternion.setFromUnitVectors(UP, direction);
    this.shaft.scale.set(radius, Math.max(shaftLength, 1e-4), radius);
    this.head.position.set(0, shaftLength, 0);
    this.head.scale.set(radius * 2.7, headLength, radius * 2.7);
    this.tip.copy(direction).multiplyScalar(length).add(origin);
  }
}

const UP = new THREE.Vector3(0, 1, 0);

interface LabelEntry {
  node: HTMLDivElement;
  value: HTMLElement;
  visible: boolean;
}

export class ForceOverlay {
  readonly group = new THREE.Group();
  private readonly arrows = new Map<ForceKey, Arrow>();
  private readonly materials: THREE.Material[] = [];
  private readonly shaftGeometry = new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0);
  private readonly headGeometry = new THREE.ConeGeometry(1, 1, 18).translate(0, 0.5, 0);
  private readonly cpMarker: THREE.Sprite;
  private readonly cmMarker: THREE.Sprite;
  private readonly labels = new Map<ForceKey | "cp" | "cm", LabelEntry>();
  private readonly scratchDir = new THREE.Vector3();
  private readonly scratchOrigin = new THREE.Vector3();
  private readonly scratchProject = new THREE.Vector3();
  private readonly cpWorld = new THREE.Vector3();
  private readonly cmWorld = new THREE.Vector3();
  private lastLabelUpdate = 0;
  private bounds = { left: 0, top: 0, width: 1e6, height: 1e6 };

  constructor(private readonly labelLayer: HTMLElement) {
    this.group.name = "Forces overlay";
    for (const key of KEYS) {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(FORCE_STYLE[key].colour).multiplyScalar(0.9),
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      this.materials.push(material);
      const arrow = new Arrow(this.shaftGeometry, this.headGeometry, material);
      this.arrows.set(key, arrow);
      this.group.add(arrow.group);
      this.labels.set(key, this.makeLabel(FORCE_STYLE[key].label, FORCE_STYLE[key].colour));
    }
    this.cpMarker = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: markerTexture("cp"), sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    this.cmMarker = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: markerTexture("cm"), sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    this.cpMarker.renderOrder = 21;
    this.cmMarker.renderOrder = 22;
    this.cpMarker.scale.set(0.028, 0.028, 1);
    this.cmMarker.scale.set(0.024, 0.024, 1);
    this.group.add(this.cpMarker, this.cmMarker);
    this.labels.set("cp", this.makeLabel("Centre of pressure", "#ffb45e"));
    this.labels.set("cm", this.makeLabel("Centre of mass", "#e8eef2"));
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    this.labelLayer.hidden = !visible;
  }

  /**
   * forces: from SimState. centre/quaternion: body pose. cp/cm offsets along
   * body Y (m). sizeM scales the arrows to the body.
   */
  update(
    forces: ForceBreakdown,
    centre: THREE.Vector3,
    quaternion: THREE.Quaternion,
    cpOffsetM: number,
    cmOffsetM: number,
    sizeM: number,
  ): void {
    if (!this.group.visible) return;
    const reference = Math.max(length(forces.weight), length(forces.jet), 1e-6);
    const radius = Math.max(0.004, sizeM * 0.012);
    this.cpWorld.set(0, cpOffsetM, 0).applyQuaternion(quaternion).add(centre);
    this.cmWorld.set(0, cmOffsetM, 0).applyQuaternion(quaternion).add(centre);
    for (const key of KEYS) {
      const arrow = this.arrows.get(key);
      if (!arrow) continue;
      const force = forces[key];
      const magnitude = length(force);
      const relevant = key === "buoyancy" ? magnitude > reference * 0.02 : magnitude > reference * 0.002;
      arrow.group.visible = relevant;
      const label = this.labels.get(key);
      if (label) label.visible = relevant;
      if (!relevant) continue;
      this.scratchDir.set(force.x, force.y, force.z).divideScalar(magnitude);
      const lengthM = sizeM * (0.18 + 0.62 * Math.log10(1 + 30 * (magnitude / reference)) / Math.log10(31));
      const origin =
        key === "weight"
          ? this.cmWorld
          : key === "jet"
            ? this.cpWorld
            : this.scratchOrigin.copy(centre);
      // Push side forces out to the body surface so they are not hidden inside it.
      if (key === "centering" || key === "shedding") {
        this.scratchOrigin.copy(centre).addScaledVector(this.scratchDir, sizeM * 0.52);
      }
      arrow.set(origin, this.scratchDir, lengthM, radius);
      if (label) {
        setLabelValue(label, joinFormatted(formatForce(magnitude)));
      }
    }
    this.cpMarker.position.copy(this.cpWorld);
    this.cmMarker.position.copy(this.cmWorld);
  }

  /** Project label anchors to CSS pixels. Throttled to keep layout calm. */
  updateLabels(
    camera: THREE.Camera,
    widthPx: number,
    heightPx: number,
    nowMs: number,
    bounds: { left: number; top: number; width: number; height: number },
  ): void {
    if (!this.group.visible) return;
    const throttle = nowMs - this.lastLabelUpdate < 33;
    if (throttle) return;
    this.lastLabelUpdate = nowMs;
    this.bounds = bounds;
    for (const key of KEYS) {
      const label = this.labels.get(key);
      const arrow = this.arrows.get(key);
      if (!label || !arrow) continue;
      this.place(label, label.visible ? arrow.tip : null, camera, widthPx, heightPx, 10, -10);
    }
    const cp = this.labels.get("cp");
    const cm = this.labels.get("cm");
    if (cp) this.place(cp, this.cpWorld, camera, widthPx, heightPx, 14, -18);
    if (cm) this.place(cm, this.cmWorld, camera, widthPx, heightPx, 14, 4);
  }

  dispose(): void {
    this.shaftGeometry.dispose();
    this.headGeometry.dispose();
    for (const material of this.materials) material.dispose();
    (this.cpMarker.material as THREE.SpriteMaterial).map?.dispose();
    (this.cmMarker.material as THREE.SpriteMaterial).map?.dispose();
    this.cpMarker.material.dispose();
    this.cmMarker.material.dispose();
  }

  private place(
    label: LabelEntry,
    anchor: THREE.Vector3 | null,
    camera: THREE.Camera,
    widthPx: number,
    heightPx: number,
    dx: number,
    dy: number,
  ): void {
    if (!anchor) {
      if (label.node.style.display !== "none") label.node.style.display = "none";
      return;
    }
    const p = this.scratchProject.copy(anchor).project(camera);
    if (p.z > 1 || p.z < -1) {
      label.node.style.display = "none";
      return;
    }
    // Keep labels inside the clear stage so panels and the HUD never hide them.
    const b = this.bounds;
    const x = Math.min(b.left + b.width - 150, Math.max(b.left + 4, (p.x * 0.5 + 0.5) * widthPx + dx));
    const y = Math.min(b.top + b.height - 24, Math.max(b.top + 4, (-p.y * 0.5 + 0.5) * heightPx + dy));
    if (label.node.style.display === "none") label.node.style.display = "";
    label.node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  private makeLabel(title: string, colour: string): LabelEntry {
    const node = document.createElement("div");
    node.className = "force-label";
    node.style.borderColor = `${colour}55`;
    const name = document.createElement("span");
    name.textContent = title;
    name.style.color = colour;
    const value = document.createElement("i");
    node.append(name, value);
    node.style.display = "none";
    this.labelLayer.append(node);
    return { node, value, visible: false };
  }
}

function setLabelValue(label: LabelEntry, text: string): void {
  if (label.value.textContent !== text) label.value.textContent = text;
}

function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function markerTexture(kind: "cp" | "cm"): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const c = size / 2;
    if (kind === "cm") {
      // The classic centre-of-mass symbol: alternating quadrants.
      ctx.fillStyle = "#0b0f14";
      ctx.beginPath();
      ctx.arc(c, c, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4f8fa";
      for (const start of [0, Math.PI]) {
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, 26, start, start + Math.PI / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = "#f4f8fa";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c, c, 26, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#ffb45e";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(c, c, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffb45e";
      ctx.beginPath();
      ctx.arc(c, c, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
