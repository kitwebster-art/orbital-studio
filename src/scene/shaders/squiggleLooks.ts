/** Seam-free 3D contour fields, authored as straight pigment and filtered ink coverage. */
export const SQUIGGLE_LOOKS_GLSL = /* glsl */ `
  // Phase is measured in contour cycles. A camera/raster footprint keeps
  // antialiasing independent of triangle helper-quad derivative artefacts.
  float squiggleInkMask(float phase, float centre, float width, float pixelSpan) {
    float distanceToInk = abs(fract(phase - centre + 0.5) - 0.5);
    float footprint = min(max(pixelSpan, 0.0001), min(width * 0.45, 0.025));
    float resolvedInk = 1.0 - smoothstep(
      max(0.0, width - footprint * 0.5), width + footprint * 0.5, distanceToInk
    );
    return resolvedInk;
  }

  vec3 squigglePigment(float phase) {
    vec3 pigment = spectralPalette(phase);
    // Normalize only the unshaded hue. The ink mask remains a separate signal.
    return pigment / max(max(pigment.r, pigment.g), pigment.b);
  }

  vec4 squiggleField(
    float mode, vec3 p, float time, float seed,
    float scaleControl, float flowControl, float densityControl,
    float lineWidthControl, float colourOrInversion
  ) {
    float spatialScale = mix(1.8, 6.4, scaleControl) * max(uLookScale, 0.25);
    float flowSpeed = mix(0.08, 1.5, flowControl);
    vec3 seedOffset = vec3(seed * 97.0, seed * -41.0, seed * 23.0);
    // Same gentle advection and phase rate as iridescent film. Density only
    // subdivides this carrier; it never speeds up the underlying flow field.
    vec3 advectedDomain = p * spatialScale + seedOffset + vec3(
      time * flowSpeed * 0.05, -time * flowSpeed * 0.035, time * flowSpeed * 0.027
    );
    // Broad curls need a smooth macro field, not fine fractal micro-loops.
    // Three value-noise samples replace the previous eight noise octaves.
    vec3 macroDomain = advectedDomain * 0.42;
    float macroField = valueNoise(macroDomain) * 0.75 +
      valueNoise(macroDomain * 2.01 + vec3(1.7, 4.2, 2.8)) * 0.25;
    float bendField = valueNoise(advectedDomain * 0.27 + vec3(7.2, 1.4, 3.1));
    float carrierDrift = time * flowSpeed * 0.16;
    // Bound the broad contour field using actual raster height, camera optics
    // and distance. This remains continuous across the sphere's mesh triangles.
    float meanRadius = max((uRadii.x + uRadii.y + uRadii.z) / 3.0, 0.01);
    float surfacePixelSpan = uAngularPixelSpan * distance(cameraPosition, vWorldPosition) / meanRadius;
    float contourCycles = 1.0;
    float coverage = 0.0;
    float invertInk = 0.0;
    vec3 pigment = vec3(1.0);

    if (mode < 48.5) {
      // Dense interleaved filaments: low-frequency cross-axis bending gives
      // each fine contour a wandering oil-film shape without noisy speckles.
      float crossBend = sin(dot(p, normalize(vec3(-0.61, 0.35, 0.71))) *
        spatialScale * 0.9 + bendField * 3.2);
      float filamentCarrier = dot(p, normalize(vec3(0.48, 0.63, -0.61))) *
        mix(0.7, 1.8, scaleControl) * max(uLookScale, 0.25) +
        (macroField - 0.5) * 1.35 + crossBend * 0.26 + carrierDrift;
      contourCycles = mix(6.0, 18.0, densityControl);
      float filamentPhase = filamentCarrier * contourCycles;
      float inkWidth = mix(0.045, 0.14, lineWidthControl);
      coverage = squiggleInkMask(filamentPhase, 0.0, inkWidth, surfacePixelSpan * contourCycles * 2.0);
      pigment = squigglePigment(filamentCarrier * 0.58 + bendField * 0.7 + colourOrInversion);
    } else if (mode < 49.5) {
      // Broad paired ribbons with unequal widths and a quiet gap between
      // pairs. Their large curling folds are distinct from the fine filaments.
      float curlingFold = sin(dot(p, normalize(vec3(0.72, -0.18, 0.67))) *
        spatialScale * 0.7 + macroField * 4.0);
      float ribbonCarrier = dot(p, normalize(vec3(-0.28, 0.91, 0.31))) *
        mix(0.7, 1.4, scaleControl) * max(uLookScale, 0.25) +
        (bendField - 0.5) * 1.3 + curlingFold * 0.34 + carrierDrift;
      contourCycles = mix(3.0, 8.0, densityControl);
      float ribbonPhase = ribbonCarrier * contourCycles;
      float ribbonWidth = mix(0.04, 0.18, lineWidthControl);
      float primaryInk = squiggleInkMask(ribbonPhase, 0.22, ribbonWidth, surfacePixelSpan * contourCycles * 2.0);
      float pairedInk = squiggleInkMask(ribbonPhase, 0.66, ribbonWidth * 0.42, surfacePixelSpan * contourCycles * 2.0);
      vec3 primaryPigment = squigglePigment(ribbonCarrier * 0.43 + colourOrInversion);
      vec3 pairedPigment = squigglePigment(ribbonCarrier * 0.43 + colourOrInversion + 0.32);
      coverage = max(primaryInk, pairedInk);
      // Straight colour avoids applying antialiasing/coverage to RGB twice.
      pigment = mix(primaryPigment, pairedPigment, pairedInk / max(primaryInk + pairedInk, 0.00001));
    } else {
      // Warped closed ridges evoke fingerprints and topography, rather than
      // recolouring either rainbow geometry. Only neutral white ink is emitted.
      vec3 ridgeWarp = sin(p.yzx * spatialScale * 0.65 + vec3(
        macroField * 3.0, bendField * 3.2, (macroField + bendField) * 2.0
      ));
      vec3 ridgePoint = p + ridgeWarp * 0.22;
      float closedRidges = length(ridgePoint - vec3(0.33, -0.22, 0.3));
      float ridgeRelief = sin(dot(p, normalize(vec3(0.31, 0.86, -0.4))) *
        spatialScale * 0.75 + bendField * 2.8) * 0.13;
      float fingerprintCarrier = closedRidges + ridgeRelief + carrierDrift;
      contourCycles = mix(8.0, 22.0, densityControl) *
        mix(0.65, 1.35, scaleControl) * max(uLookScale, 0.25);
      float fingerprintPhase = fingerprintCarrier * contourCycles;
      float inkWidth = mix(0.035, 0.16, lineWidthControl);
      coverage = squiggleInkMask(fingerprintPhase, 0.0, inkWidth, surfacePixelSpan * contourCycles * 2.0);
      invertInk = step(0.5, colourOrInversion);
      pigment = vec3(1.0);
    }

    // Resolve the broad field at normal size; fade genuinely subpixel ink
    // towards black instead of spreading a grey duty cycle across the sphere.
    float samplingFade = 1.0 - smoothstep(0.8, 1.8, surfacePixelSpan * contourCycles * 2.0);
    coverage *= samplingFade;
    coverage = mix(coverage, 1.0 - coverage, invertInk);
    // Native peak-one pigment, black gaps, no extra surface pass or readback.
    return vec4(pigment, clamp(coverage, 0.0, 1.0));
  }
`;
