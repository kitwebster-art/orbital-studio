/**
 * Real thumbnails for the shape gallery and the look picker, rendered once by
 * a small offscreen WebGL renderer (same lighting style and tone mapping as
 * the main view), copied into 2D canvases, then disposed.
 */
import * as THREE from "three";
import type { ShapeMesh } from "../model/types";
import type { LabLook } from "../looks";
import { createGalleryEnvironment } from "./environment";
import { applyLabLook, createLabSurfaceMaterial } from "./projectionSurface";

export interface ShapeThumbnailJob {
  mesh: ShapeMesh;
  canvas: HTMLCanvasElement;
}

export interface LookThumbnailJob {
  look: LabLook;
  canvas: HTMLCanvasElement;
}

const SCALE = 2;
const SHAPE_SIZE = 76;
const LOOK_W = 96;
const LOOK_H = 42;

export function renderThumbnails(shapes: ShapeThumbnailJob[], looks: LookThumbnailJob[]): void {
  const width = Math.max(SHAPE_SIZE, LOOK_W) * SCALE;
  const height = Math.max(SHAPE_SIZE, LOOK_H) * SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.autoClear = false;
  renderer.setScissorTest(true);
  const environment = createGalleryEnvironment(renderer);

  try {
    // Shapes: matte, softly lit, with the scene's cool rim.
    const shapeScene = new THREE.Scene();
    shapeScene.environment = environment;
    shapeScene.environmentIntensity = 0.7;
    const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
    key.position.set(-2, 3, 2.5);
    const rim = new THREE.DirectionalLight(0x5ee7ff, 1.6);
    rim.position.set(2.5, 1.2, -2.5);
    shapeScene.add(key, rim, new THREE.HemisphereLight(0x405466, 0x05070a, 0.6));
    const shapeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe4ebef,
      roughness: 0.52,
      metalness: 0,
      sheen: 0.2,
      side: THREE.DoubleSide,
    });
    const shapeCamera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
    for (const job of shapes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(job.mesh.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(job.mesh.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(job.mesh.indices, 1));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, shapeMaterial);
      mesh.rotation.set(0.16, -0.5, 0.05);
      shapeScene.add(mesh);
      let strands: THREE.LineSegments | null = null;
      if (job.mesh.strands?.length) {
        const points: number[] = [];
        for (const strand of job.mesh.strands) {
          for (let i = 0; i + 5 < strand.length; i += 3) {
            points.push(strand[i], strand[i + 1], strand[i + 2], strand[i + 3], strand[i + 4], strand[i + 5]);
          }
        }
        const strandGeometry = new THREE.BufferGeometry();
        strandGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
        strands = new THREE.LineSegments(strandGeometry, new THREE.LineBasicMaterial({ color: 0x8fa2ae }));
        mesh.add(strands);
      }
      const radius = geometry.boundingSphere?.radius ?? 0.6;
      const centre = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      const distance = (radius * 1.08) / Math.sin(THREE.MathUtils.degToRad(shapeCamera.fov / 2));
      shapeCamera.position.set(centre.x + distance * 0.3, centre.y + distance * 0.26, centre.z + distance * 0.92);
      shapeCamera.lookAt(centre);
      draw(renderer, shapeScene, shapeCamera, SHAPE_SIZE, SHAPE_SIZE, 0x0e1419, job.canvas);
      shapeScene.remove(mesh);
      geometry.dispose();
      if (strands) {
        strands.geometry.dispose();
        (strands.material as THREE.Material).dispose();
      }
    }
    shapeMaterial.dispose();

    // Looks: Studio's own surface shader on a sphere, lit all over (no rig).
    if (looks.length > 0) {
      const { material } = createLabSurfaceMaterial();
      material.uniforms.uLabRigLighting.value = 0;
      material.uniforms.uLabAtlasEnabled.value = 0;
      material.uniforms.uPreviewExposure.value = 0.9;
      const lookScene = new THREE.Scene();
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
      lookScene.add(sphere);
      sphere.updateMatrixWorld(true);
      (material.uniforms.uContentInverse.value as THREE.Matrix4).copy(sphere.matrixWorld).invert();
      (material.uniforms.uContentLinear.value as THREE.Matrix3).setFromMatrix4(sphere.matrixWorld);
      (material.uniforms.uWorldNormalMatrix.value as THREE.Matrix3).getNormalMatrix(sphere.matrixWorld);
      const lookCamera = new THREE.PerspectiveCamera(20, LOOK_W / LOOK_H, 0.1, 20);
      lookCamera.position.set(0, 0.2, 3.1);
      lookCamera.lookAt(0, 0.05, 0);
      for (const job of looks) {
        applyLabLook(material, job.look);
        material.uniforms.uTime.value = 3.2 + (job.look.preset.seed % 13) * 0.11;
        draw(renderer, lookScene, lookCamera, LOOK_W, LOOK_H, 0x06090d, job.canvas);
      }
      sphere.geometry.dispose();
      material.dispose();
    }
  } finally {
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

function draw(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  widthCss: number,
  heightCss: number,
  background: number,
  target: HTMLCanvasElement,
): void {
  const w = widthCss * SCALE;
  const h = heightCss * SCALE;
  camera.aspect = widthCss / heightCss;
  camera.updateProjectionMatrix();
  renderer.setViewport(0, 0, w, h);
  renderer.setScissor(0, 0, w, h);
  renderer.setClearColor(background, 1);
  renderer.clear(true, true, false);
  renderer.render(scene, camera);
  target.width = w;
  target.height = h;
  const ctx = target.getContext("2d");
  if (!ctx) return;
  const source = renderer.domElement;
  ctx.drawImage(source, 0, source.height - h, w, h, 0, 0, w, h);
}
