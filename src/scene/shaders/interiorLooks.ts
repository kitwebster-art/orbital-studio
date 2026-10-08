/** Bounded, seekable surface illusions. No frame history or captured interior data. */
export const INTERIOR_LOOKS_GLSL = /* glsl */ `
  float illusionLine(float distanceToLine, float width) {
    float aa = max(fwidth(distanceToLine), 0.0012);
    return 1.0 - smoothstep(width, width + aa, abs(distanceToLine));
  }

  // The surface compositor applies coverage once. These effects accumulate
  // covered radiance internally, so return straight colour without brightening
  // the underlying facet, depth or wet-paint shading.
  vec4 straightIllusionSample(vec3 radiance, float coverage) {
    float boundedCoverage = clamp(coverage, 0.0, 1.0);
    if (boundedCoverage <= 0.00001) return vec4(0.0);
    return vec4(radiance / boundedCoverage, boundedCoverage);
  }

  vec3 paintPigment(float index) {
    // Deliberately separate pigments rather than a desaturated rainbow wash.
    float choice = mod(index, 6.0);
    if (choice < 1.0) return vec3(1.0, 0.025, 0.13);
    if (choice < 2.0) return vec3(0.015, 0.58, 1.0);
    if (choice < 3.0) return vec3(1.0, 0.67, 0.015);
    if (choice < 4.0) return vec3(0.40, 0.025, 1.0);
    if (choice < 5.0) return vec3(0.025, 1.0, 0.36);
    return vec3(1.0, 0.035, 0.61);
  }

  vec4 paintImpacts(vec3 p, float time, float seed, float size, float rate,
                    float retention, float scatter, float pigment) {
    float eventTime = time * mix(1.0, 9.0, rate);
    float newest = floor(eventTime);
    vec3 colour = vec3(0.0);
    float coverage = 0.0;
    // Oldest first: each fresh impact lays wet paint over the previous colour.
    // Analytic event age makes pause, seek and repeated seed exactly reproducible.
    for (int slot = 7; slot >= 0; slot--) {
      float event = newest - float(slot);
      float age = eventTime - event;
      float h = hash31(vec3(event, seed * 193.0, 7.31));
      vec3 centre = normalize(vec3(
        hash31(vec3(event, seed * 97.0, 1.1)) * 2.0 - 1.0,
        hash31(vec3(event, seed * 43.0, 2.2)) * 2.0 - 1.0,
        hash31(vec3(event, seed * 71.0, 3.3)) * 2.0 - 1.0) + vec3(0.001));
      vec3 tangent = normalize(cross(centre, abs(centre.y) > 0.9 ? vec3(1,0,0) : vec3(0,1,0)));
      vec3 bitangent = cross(centre, tangent);
      vec2 uv = vec2(dot(p - centre, tangent), dot(p - centre, bitangent));
      float radius = mix(0.12, 0.34, size) / max(uLookScale, 0.25);
      radius *= mix(0.1, 1.0, smoothstep(0.0, 0.32, age));
      // A torn, asymmetric centre rather than a round paint disc.
      vec2 radial = uv / max(length(uv), 0.0001);
      float ragged = 0.72 + scatter * (0.18 * sin(radial.x * 9.0 + radial.y * 5.0 + h * 31.0)
        + 0.12 * sin(radial.y * 17.0 - radial.x * 7.0 - h * 19.0)
        + 0.08 * sin(uv.x * 83.0 + h * 11.0) * sin(uv.y * 67.0));
      float distance = length(uv) - radius * ragged;
      float aa = max(fwidth(distance), 0.0015);
      float mask = 1.0 - smoothstep(-aa, aa, distance);
      for (int jet = 0; jet < 9; jet++) {
        float j = float(jet);
        float random = hash31(vec3(event, j * 13.7, seed * 53.0));
        float phase = j * 0.6981317 + h * 6.2831853 + (random - 0.5) * 0.65;
        vec2 axis = vec2(cos(phase), sin(phase));
        vec2 along = vec2(dot(uv, axis), dot(uv, vec2(-axis.y, axis.x)));
        float reach = radius * mix(1.1, 3.2, random) * mix(0.65, 1.0, scatter);
        float progress = clamp(along.x / max(reach, 0.001), 0.0, 1.0);
        float bend = sin(progress * 2.7 + j) * radius * 0.065 * progress;
        float width = radius * mix(0.035, 0.13, random) * (1.0 - progress * 0.9);
        float trail = (1.0 - smoothstep(width, width + aa, abs(along.y - bend))) *
          smoothstep(0.0, radius * 0.3, along.x) * (1.0 - smoothstep(reach * 0.8, reach, along.x));
        mask = max(mask, trail * mix(0.35, 1.0, scatter));
        // Detached beads beyond the taper, with varied offsets and sizes.
        for (int bead = 0; bead < 2; bead++) {
          float b = float(bead);
          float beadNoise = hash31(vec3(event + b * 17.0, j * 7.1, seed * 31.0));
          vec2 drop = along - vec2(reach * (1.08 + b * 0.42), radius * (beadNoise - 0.5) * 0.5);
          float dropRadius = radius * mix(0.022, 0.11, beadNoise) * (1.0 - b * 0.3);
          float spray = length(drop * vec2(0.7, 1.25)) - dropRadius;
          mask = max(mask, (1.0 - smoothstep(-aa, aa, spray)) * mix(0.35, 1.0, scatter));
        }
      }
      // Sparse mist flecks around the impact, bounded to its local footprint.
      vec2 sprayUv = uv / max(radius, 0.001) * 10.0;
      vec2 cell = floor(sprayUv);
      float grain = hash31(vec3(cell, h * 157.0));
      vec2 centreJitter = vec2(grain, hash31(vec3(cell.yx, h * 71.0)));
      float speckDistance = length(fract(sprayUv) - mix(vec2(0.2), vec2(0.8), centreJitter));
      float speck = 1.0 - smoothstep(0.055, 0.055 + max(fwidth(speckDistance), 0.025), speckDistance);
      speck *= step(0.83, grain) * (1.0 - smoothstep(radius * 1.3, radius * 3.4, length(uv))) * scatter;
      mask = max(mask, speck);
      mask *= smoothstep(0.50, 0.76, dot(p, centre));
      mask *= smoothstep(0.0, 0.07, age) * (1.0 - smoothstep(mix(1.8, 4.5, retention), mix(3.0, 7.8, retention), age));
      vec3 wetColour = paintPigment(floor(h * 6.0) + floor(pigment * 5.99));
      wetColour *= 0.75 + 0.25 * (1.0 - clamp(length(uv) / max(radius, 0.001), 0.0, 1.0));
      colour = mix(colour, wetColour, mask);
      coverage = mask + coverage * (1.0 - mask);
    }
    return straightIllusionSample(colour, coverage);
  }

  vec4 imaginaryInterior(float mode, vec3 p, float time, float seed,
                         float a, float b, float c, float d, float e) {
    // Analytic ray through an imaginary unit sphere. This is an authored view
    // illusion, not transparency, backside capture or measured material pose.
    vec3 ray = normalize((vWorldPosition - cameraPosition) / max(uRadii, vec3(0.01)));
    ray.xz = rotate2d(time * (0.018 + uFluidity * 0.06) + uLookRotation * TAU) * ray.xz;
    ray.xy = rotate2d(uLookRotation * TAU * 0.37) * ray.xy;
    float projection = dot(p, ray);
    float discriminant = projection * projection + 1.0 - dot(p, p);
    if (discriminant <= 0.0) return vec4(0.0);
    float exitDistance = -projection + sqrt(discriminant);
    if (exitDistance <= 0.001) return vec4(0.0);
    vec3 back = p + ray * exitDistance;
    vec3 colour = vec3(0.0);
    float signal = 0.0;
    float spin = time * mix(0.02, 0.5, b) + seed * TAU;

    if (mode < 44.5) {
      // Three genuinely intersected virtual ring planes, with orbiting cores.
      for (int orbit = 0; orbit < 3; orbit++) {
        float id = float(orbit);
        vec3 normal = normalize(vec3(sin(spin + id * 2.1), 0.65 + id * 0.13, cos(spin * 0.71 + id * 2.1)));
        vec3 tangent = normalize(cross(normal, vec3(0,0,1)));
        vec3 bitangent = cross(normal, tangent);
        float radius = mix(0.28, 0.48, a) + id * 0.16;
        float denom = dot(ray, normal);
        if (abs(denom) > 0.02) {
          float distance = -dot(p, normal) / denom;
          vec3 hit = p + ray * distance;
          float ring = illusionLine(length(hit) - radius, mix(0.003, 0.014, d));
          ring *= step(0.0, distance) * step(distance, exitDistance);
          vec3 tint = paintPigment(id + floor(e * 5.0));
          colour += tint * ring * mix(0.35, 1.0, 1.0 - distance / max(exitDistance, 0.001));
          signal = max(signal, ring);
        }
        vec3 moon = (tangent * cos(spin * 2.2 + id) + bitangent * sin(spin * 2.2 + id)) * radius;
        float alongRay = dot(moon - p, ray);
        float miss = length(p + ray * alongRay - moon);
        float core = 1.0 - smoothstep(mix(0.025, 0.07, c), mix(0.035, 0.09, c), miss);
        core *= step(0.0, alongRay) * step(alongRay, exitDistance);
        colour += paintPigment(id + floor(e * 5.0)) * core;
        signal = max(signal, core);
      }
    } else if (mode < 45.5) {
      // A bounded octahedron ray march. No noise, textures or history buffers.
      float travel = max(0.0, -projection - sqrt(discriminant)) + 0.002;
      float radius = mix(0.35, 0.76, a);
      for (int stepIndex = 0; stepIndex < 28; stepIndex++) {
        vec3 point = p + ray * travel;
        point.xz = rotate2d(spin) * point.xz;
        point.xy = rotate2d(spin * 0.63) * point.xy;
        float distance = (dot(abs(point), vec3(1.0)) - radius) * 0.57735027;
        if (distance < 0.003) {
          vec3 normal = sign(point) * 0.57735027;
          float face = max(dot(normal, normalize(vec3(-0.5,0.8,0.7))), 0.0);
          float edge = 1.0 - smoothstep(0.005, mix(0.014,0.055,d), min(abs(point.x), min(abs(point.y), abs(point.z))));
          vec3 facets = paintPigment(floor((normal.x + normal.y * 2.0 + normal.z * 3.0 + 4.0) * 1.5) + floor(e * 5.0));
          // Readable coloured shadows retain relief without an exposure boost.
          colour = facets * (0.66 + face * mix(0.28,0.34,c));
          vec3 edgeTint = mix(facets, vec3(0.04,0.75,1.0), 0.14);
          colour = mix(colour, edgeTint, edge * mix(0.32,0.62,d));
          signal = 1.0;
          break;
        }
        travel += max(distance, 0.002);
        if (travel >= exitDistance) break;
      }
    } else if (mode < 46.5) {
      // Four analytically intersected inner membranes, carrying slow tidal lines.
      for (int layer = 0; layer < 4; layer++) {
        float id = float(layer);
        float radius = mix(0.25,0.42,a) + id * 0.15;
        float disc = projection * projection + radius * radius - dot(p,p);
        if (disc > 0.0) {
          float distance = -projection + sqrt(disc);
          vec3 hit = (p + ray * distance) / radius;
          hit.xz = rotate2d(spin + id * 0.25) * hit.xz;
          float wave = hit.y + 0.15 * sin(hit.x * 5.0 + spin * 3.0) + 0.11 * sin(hit.z * 6.0 - spin * 2.0);
          float bands = sin(wave * mix(9.0,22.0,c) + id * 1.2);
          float line = illusionLine(bands, mix(0.025,0.16,d));
          float depthFade = 0.32 + 0.16 * id;
          vec3 tint = mix(vec3(0.01,0.7,1.0), vec3(1.0,0.26,0.025), clamp(id / 3.0 * e, 0.0, 1.0));
          colour += tint * line * depthFade * 0.85;
          signal = max(signal, line * depthFade);
        }
      }
    } else {
      // Only the far intersection is drawn. The near hemisphere is omitted.
      vec3 cage = back;
      cage.xy = rotate2d(0.24 + e * 0.55) * cage.xy;
      cage.yz = rotate2d(0.35 + spin * 0.28) * cage.yz;
      float gridScale = mix(4.0,12.0,a) * max(uLookScale,0.25);
      float width = mix(0.012,0.055,d);
      float parallels = illusionLine(sin(cage.y * gridScale * PI), width);
      float meridians = 0.0;
      for (int plane = 0; plane < 12; plane++) {
        float angle = float(plane) * PI / 12.0 + spin * 0.12;
        float planeDistance = dot(cage.xz, vec2(cos(angle),sin(angle)));
        meridians = max(meridians, illusionLine(planeDistance, width * 0.065));
      }
      float depthFade = mix(0.32,1.0,1.0 - clamp(exitDistance / 2.0,0.0,1.0));
      signal = max(parallels, meridians) * mix(0.5,1.0,c);
      colour = mix(vec3(0.34,0.025,1.0),vec3(0.025,0.88,1.0),depthFade) * signal;
    }
    return straightIllusionSample(colour, signal);
  }
`;
