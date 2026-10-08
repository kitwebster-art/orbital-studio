import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  ORBITAL_SURFACE_FRAGMENT_SHADER,
  ORBITAL_SURFACE_VERTEX_SHADER,
  createOrbitalSurfaceMaterial,
  setOrbitalSurfaceLookControls,
} from "./orbitalSurface";

describe("Orbital seamless surface shader", () => {
  it("uses continuous 3D surface coordinates instead of equirectangular UVs", () => {
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("vSurfaceDirection");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("seamlessGrid");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("cellular3");
    // Polar angle is permitted for the screen-space silhouette mask, while
    // artwork continues to sample the continuous 3D surface direction.
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("vec3 direction = normalize(vSurfaceDirection)");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toMatch(/\basin\s*\(/u);
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toMatch(/\b(?:longitude|latitude)\b/u);
  });

  it("contains the authored, coverage, grid, seam-stress and black branches", () => {
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uProjectionPattern < 0.5");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uProjectionPattern < 1.5");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uProjectionPattern < 2.5");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uProjectionPattern < 3.5");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("stressGrid");
  });

  it("routes the full algorithm range through one region-capable evaluator", () => {
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("evaluateShader(");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("mode < 42.5");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("regionStyle");
  });

  it("applies the shared appearance controls inside the GPU shader", () => {
    [
      "uLookScale",
      "uLookRotation",
      "uLookHue",
      "uLookSaturation",
      "uLookContrast",
      "uLookSoftness",
      "uLookLevel",
    ].forEach((uniform) => expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain(uniform));
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("finishShaderColour");
  });

  it("routes every animated surface path through the independent shader clock", () => {
    expect(ORBITAL_SURFACE_VERTEX_SHADER).toContain("shaderTime = uTime");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("authoredTime = uTime");
    expect(ORBITAL_SURFACE_VERTEX_SHADER).not.toContain("uLookMotion");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toContain("uLookMotion");
    expect(ORBITAL_SURFACE_VERTEX_SHADER.match(/\buTime\b/gu)).toHaveLength(2);
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER.match(/\buTime\b/gu)).toHaveLength(2);
  });

  it("uses broad latex bulges instead of high-frequency surface vibration", () => {
    expect(ORBITAL_SURFACE_VERTEX_SHADER).toContain("broadBulge");
    expect(ORBITAL_SURFACE_VERTEX_SHADER).toContain("secondaryBulge");
    expect(ORBITAL_SURFACE_VERTEX_SHADER).not.toContain("direction.y * 8.0");
    expect(ORBITAL_SURFACE_VERTEX_SHADER).not.toContain("direction.x + direction.z) * 13.0");
  });

  it("supports real pre and post mapping projector raster renders", () => {
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uOutputPreviewMode");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("uOutputPreviewProjector");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("selectedOutputWeight");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("selectedOutputBlack");
  });

  it("keeps projector rasters vivid when the legacy score is in a dim state", () => {
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("nativeProjectionLight(pigment)");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toContain("signalBrightness");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toContain("luminance * 1.8");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toContain("washedSurface");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("colour *= projectedLight;");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("coverage, 0.0, 1.0) * confidence * outputMask");
  });

  it("starts with neutral output gain and binds independent exposure and brightness controls", () => {
    const material = createOrbitalSurfaceMaterial();
    try {
      expect(material.uniforms.uLookExposure.value).toBe(0);
      expect(material.uniforms.uLookBrightness.value).toBe(1);
      expect(material.uniforms.uLookContrast.value).toBe(1);
      expect(material.uniforms.uLookSaturation.value).toBe(1);
      expect(material.toneMapped).toBe(false);
      expect(material.uniforms.uPreviewExposure.value).toBe(1);
      expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toContain("#include <tonemapping_fragment>");
      expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("sRGBTransferEOTF");
      expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("#include <colorspace_fragment>");
      setOrbitalSurfaceLookControls(material, { exposure: 1, brightness: 0, contrast: 1.4, saturation: 0 });
      expect(material.uniforms.uLookExposure.value).toBe(1);
      expect(material.uniforms.uLookBrightness.value).toBe(0);
      expect(material.uniforms.uLookContrast.value).toBe(1.4);
      expect(material.uniforms.uLookSaturation.value).toBe(0);
      // A renderer instance must not share mutable controls with another output.
      const other = createOrbitalSurfaceMaterial();
      expect(other.uniforms.uLookBrightness.value).toBe(1);
      other.dispose();
    } finally { material.dispose(); }
  });

  it("returns straight pigment coverage and colours highlights without adding white", () => {
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("radiance / boundedCoverage");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("mask + coverage * (1.0 - mask)");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).toContain("highlightPigment");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toContain("vec3 pearl");
    expect(ORBITAL_SURFACE_FRAGMENT_SHADER).not.toContain("vec3(0.55,0.85,1.0) * edge");
  });

  it("scales line filtering to the active raster and camera on each render", () => {
    const material = createOrbitalSurfaceMaterial();
    const geometry = new THREE.BufferGeometry();
    const object = new THREE.Mesh(geometry, material);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
    let height = 1080;
    const renderer = {
      getCurrentViewport: (target: THREE.Vector4) => target.set(0, 0, 1920, height),
    } as unknown as THREE.WebGLRenderer;
    try {
      material.onBeforeRender(renderer, scene, camera, geometry, object, new THREE.Group());
      const fullRasterSpan = material.uniforms.uAngularPixelSpan.value;
      expect(fullRasterSpan).toBeCloseTo(2 * Math.tan(Math.PI / 8) / height);
      height = 120;
      camera.fov = 34;
      camera.updateProjectionMatrix();
      material.onBeforeRender(renderer, scene, camera, geometry, object, new THREE.Group());
      expect(material.uniforms.uAngularPixelSpan.value).toBeCloseTo(2 * Math.tan(34 * Math.PI / 360) / height);
      expect(material.uniforms.uAngularPixelSpan.value).toBeGreaterThan(fullRasterSpan);
      expect(material.uniformsNeedUpdate).toBe(true);
    } finally { material.dispose(); geometry.dispose(); }
  });

  it("keeps shell controls independently switchable and rejects nonfinite imported settings", () => {
    const material = createOrbitalSurfaceMaterial();
    try {
      setOrbitalSurfaceLookControls(material, { shellGrid: 0, shellGridDensity: 40, shellGridWidth: 0.04 });
      expect(material.uniforms.uLookShellGrid.value).toBe(0);
      expect(material.uniforms.uLookShellGridDensity.value).toBe(40);
      expect(material.uniforms.uLookShellGridWidth.value).toBe(0.04);
      setOrbitalSurfaceLookControls(material, { exposure: Infinity, brightness: -20, shellGrid: 3, shellGridDensity: NaN });
      expect(material.uniforms.uLookExposure.value).toBe(0);
      expect(material.uniforms.uLookBrightness.value).toBe(0);
      expect(material.uniforms.uLookShellGrid.value).toBe(1);
      expect(material.uniforms.uLookShellGridDensity.value).toBe(16);
    } finally { material.dispose(); }
  });

});
