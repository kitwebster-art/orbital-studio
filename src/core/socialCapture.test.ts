import { describe, expect, it } from "vitest";
import {
  SOCIAL_ASPECT_PRESETS,
  SOCIAL_CAMERA_PRESETS,
  socialCaptureFilename,
} from "./socialCapture";

describe("social capture presets", () => {
  it("provides exact portrait square and landscape exports", () => {
    expect(SOCIAL_ASPECT_PRESETS.portrait).toEqual({ label: "Portrait 9:16", width: 1080, height: 1920 });
    expect(SOCIAL_ASPECT_PRESETS.square.width).toBe(SOCIAL_ASPECT_PRESETS.square.height);
    expect(SOCIAL_ASPECT_PRESETS.landscape).toMatchObject({ width: 1920, height: 1080 });
    expect(Object.keys(SOCIAL_CAMERA_PRESETS)).toHaveLength(5);
  });

  it("names outputs by ratio and camera", () => {
    expect(socialCaptureFilename("clip", "portrait", "low"))
      .toBe("orbital-clip-portrait-low.webm");
  });
});

