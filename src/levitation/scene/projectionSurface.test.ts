import { describe, expect, it } from "vitest";
import { ORBITAL_SURFACE_FRAGMENT_SHADER } from "../../scene/shaders/orbitalSurface";
import { LAB_SURFACE_VERTEX_SHADER, createLabSurfaceMaterial, patchStudioFragmentShader } from "./projectionSurface";
import { projectorAzimuths } from "./projectors";

describe("Studio surface shader adapter", () => {
  it("patches every anchor in the real Studio fragment shader", () => {
    const { shader, report } = patchStudioFragmentShader(ORBITAL_SURFACE_FRAGMENT_SHADER);
    expect(report).toEqual({ contribution: true, projectedLight: true, normals: true });
    expect(shader).toContain("contribution *= labProjectorVisibility(index, incidence);");
    expect(shader).toContain("mix(1.0, rigCoverage, uLabRigLighting)");
    // Inside main() the only remaining reference to the raw varying is the
    // two-sided normal assignment.
    const body = shader.slice(shader.lastIndexOf("void main() {"));
    const uses = body.match(/vWorldNormal/g) ?? [];
    expect(uses).toHaveLength(1);
    expect(body).toContain("labWorldNormal = normalize(vWorldNormal)");
  });

  it("leaves shaders without the anchors untouched and reports it", () => {
    const { shader, report } = patchStudioFragmentShader("void main() { gl_FragColor = vec4(1.0); }");
    expect(report.contribution).toBe(false);
    expect(report.projectedLight).toBe(false);
    expect(shader).toContain("gl_FragColor");
  });

  it("keeps the varyings the Studio fragment shader reads", () => {
    for (const varying of ["vWorldPosition", "vSurfaceDirection", "vWorldNormal", "vDeformation"]) {
      expect(LAB_SURFACE_VERTEX_SHADER).toContain(`varying`);
      expect(LAB_SURFACE_VERTEX_SHADER).toContain(varying);
    }
    expect(LAB_SURFACE_VERTEX_SHADER).not.toContain("uOutputWarp");
  });

  it("builds a material that keeps Studio uniforms and adds the lab ones", () => {
    const { material, report } = createLabSurfaceMaterial();
    expect(report.contribution && report.projectedLight && report.normals).toBe(true);
    for (const name of ["uShaderMode", "uShaderSeed", "uProjectorPositions", "uLabAtlas", "uContentInverse"]) {
      expect(material.uniforms[name]).toBeDefined();
    }
    material.dispose();
  });
});

describe("projector placement", () => {
  const angleGap = (a: number, b: number) => {
    const d = Math.abs(((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
    return d;
  };

  it("never stands a projector directly in front of the viewer", () => {
    const viewer = 0.4;
    for (let count = 1; count <= 5; count += 1) {
      const azimuths = projectorAzimuths(count, viewer);
      expect(azimuths).toHaveLength(count);
      for (const azimuth of azimuths) {
        expect(angleGap(azimuth, viewer)).toBeGreaterThan(0.5);
      }
    }
  });

  it("spreads three or more projectors evenly", () => {
    const azimuths = projectorAzimuths(4, 0);
    const step = (Math.PI * 2) / 4;
    for (let i = 1; i < azimuths.length; i += 1) {
      expect(azimuths[i] - azimuths[i - 1]).toBeCloseTo(step);
    }
  });
});
