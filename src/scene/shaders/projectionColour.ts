/** Shader palettes are authored in sRGB, as projector pixels, not photographic HDR. */
export type ProjectionRgb = readonly [number, number, number];

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Limit out-of-gamut light with one scalar, preserving linear RGB chromaticity. */
export function limitProjectionChroma(rgb: ProjectionRgb): ProjectionRgb {
  const colour = rgb.map(positive) as unknown as ProjectionRgb;
  const peak = Math.max(1, ...colour);
  return colour.map(value => value / peak) as unknown as ProjectionRgb;
}

export function projectionSrgbToLinear(rgb: ProjectionRgb): ProjectionRgb {
  return rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) as unknown as ProjectionRgb;
}

export function projectionLinearToSrgb(rgb: ProjectionRgb): ProjectionRgb {
  return rgb.map(value => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055) as unknown as ProjectionRgb;
}

/** Reference for the GPU light signal before coverage, confidence and feathering. */
export function nativeProjectionLight(srgb: ProjectionRgb, brightness = 1, exposureEv = 0): ProjectionRgb {
  const linear = projectionSrgbToLinear(limitProjectionChroma(srgb));
  const gain = positive(brightness) * 2 ** (Number.isFinite(exposureEv) ? Math.min(3, Math.max(-3, exposureEv)) : 0);
  return limitProjectionChroma(linear.map(value => value * gain) as unknown as ProjectionRgb);
}

export const PROJECTION_COLOUR_GLSL = /* glsl */ `
  // Preserve pigment ratios. Do not normalize shaded pixels below one:
  // their face shading, interior depth and wet-paint variation are intentional.
  vec3 limitProjectionChroma(vec3 colour) {
    colour = max(colour, vec3(0.0));
    float peak = max(1.0, max(colour.r, max(colour.g, colour.b)));
    return colour / peak;
  }

  vec3 nativeProjectionLight(vec3 authoredSrgb) {
    vec3 pigment = limitProjectionChroma(authoredSrgb);
    vec3 linearLight = sRGBTransferEOTF(vec4(pigment, 1.0)).rgb;
    return limitProjectionChroma(linearLight * exp2(uLookExposure) * uLookBrightness);
  }
`;
