import { describe, expect, it } from "vitest";

import { detectBrightSphereFromImageData } from "./recordedVideoTracking";

function ellipseFrame(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = ((x - 62) / 23) ** 2 + ((y - 42) / 17) ** 2 <= 1;
      const offset = (y * width + x) * 4;
      const value = inside ? 238 : 12;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

describe("recorded video tracking", () => {
  it("fits a bright balloon-like ellipse", () => {
    const result = detectBrightSphereFromImageData(ellipseFrame(120, 90), {
      minimumWhite: 120,
      thresholdQuantile: 0.8,
    });
    expect(result.detection).not.toBeNull();
    expect(result.detection?.centerPx[0]).toBeCloseTo(62, 0);
    expect(result.detection?.centerPx[1]).toBeCloseTo(42, 0);
    expect(result.detection?.majorDiameterPx).toBeGreaterThan(40);
    expect(result.detection?.minorDiameterPx).toBeGreaterThan(28);
    expect(result.detection?.confidence).toBeGreaterThan(0.6);
  });

  it("returns an explicit miss for a dark frame", () => {
    const data = new Uint8ClampedArray(80 * 60 * 4);
    for (let index = 3; index < data.length; index += 4) data[index] = 255;
    const result = detectBrightSphereFromImageData(
      { data, width: 80, height: 60, colorSpace: "srgb" } as ImageData,
    );
    expect(result.detection).toBeNull();
    expect(result.mask.some((value) => value !== 0)).toBe(false);
  });
});
