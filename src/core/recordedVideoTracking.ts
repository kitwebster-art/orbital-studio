export interface RecordedVideoTrackingOptions {
  minimumWhite: number;
  maximumChroma: number;
  thresholdQuantile: number;
  minimumAreaFraction: number;
  maximumAreaFraction: number;
}

export interface RecordedVideoDetection {
  frameWidth: number;
  frameHeight: number;
  centerPx: [number, number];
  centerNorm: [number, number];
  majorDiameterPx: number;
  minorDiameterPx: number;
  angleDeg: number;
  axisRatio: number;
  areaFraction: number;
  confidence: number;
  threshold: number;
  boundsPx: [number, number, number, number];
}

export interface RecordedVideoTrackingFrame {
  detection: RecordedVideoDetection | null;
  mask: Uint8Array;
  threshold: number;
}

export const DEFAULT_RECORDED_VIDEO_TRACKING_OPTIONS: RecordedVideoTrackingOptions =
  Object.freeze({
    minimumWhite: 135,
    maximumChroma: 92,
    thresholdQuantile: 0.88,
    minimumAreaFraction: 0.0025,
    maximumAreaFraction: 0.48,
  });

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantileThreshold(histogram: Uint32Array, quantile: number, count: number): number {
  const target = Math.max(0, Math.ceil(count * clamp(quantile)) - 1);
  let cumulative = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    cumulative += histogram[value] ?? 0;
    if (cumulative > target) return value;
  }
  return 255;
}

export function detectBrightSphereFromImageData(
  image: ImageData,
  options: Partial<RecordedVideoTrackingOptions> = {},
): RecordedVideoTrackingFrame {
  const settings = { ...DEFAULT_RECORDED_VIDEO_TRACKING_OPTIONS, ...options };
  const { width, height, data } = image;
  if (width <= 0 || height <= 0 || data.length !== width * height * 4) {
    throw new Error("Recorded tracking frame dimensions are invalid");
  }
  const pixelCount = width * height;
  const whiteness = new Uint8Array(pixelCount);
  const histogram = new Uint32Array(256);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const white = Math.min(red, green, blue);
    whiteness[index] = white;
    histogram[white] += 1;
  }
  const threshold = Math.max(
    settings.minimumWhite,
    quantileThreshold(histogram, settings.thresholdQuantile, pixelCount),
  );
  const mask = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const chroma = Math.max(red, green, blue) - (whiteness[index] ?? 0);
    mask[index] = (whiteness[index] ?? 0) >= threshold && chroma <= settings.maximumChroma ? 1 : 0;
  }

  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const minimumArea = pixelCount * settings.minimumAreaFraction;
  const maximumArea = pixelCount * settings.maximumAreaFraction;
  let best: RecordedVideoDetection | null = null;
  let bestScore = -1;

  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (!mask[seed] || visited[seed]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    visited[seed] = 1;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    let sumXY = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    while (head < tail) {
      const index = queue[head++] ?? 0;
      const x = index % width;
      const y = Math.floor(index / width);
      area += 1;
      sumX += x;
      sumY += y;
      sumX2 += x * x;
      sumY2 += y * y;
      sumXY += x * y;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (!mask[next] || visited[next]) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    if (area < minimumArea || area > maximumArea) continue;
    const centerX = sumX / area;
    const centerY = sumY / area;
    const covX = Math.max(0, sumX2 / area - centerX * centerX);
    const covY = Math.max(0, sumY2 / area - centerY * centerY);
    const covXY = sumXY / area - centerX * centerY;
    const trace = covX + covY;
    const spread = Math.sqrt(Math.max(0, (covX - covY) ** 2 + 4 * covXY ** 2));
    const majorVariance = Math.max(0.01, (trace + spread) * 0.5);
    const minorVariance = Math.max(0.01, (trace - spread) * 0.5);
    const majorDiameterPx = 4 * Math.sqrt(majorVariance);
    const minorDiameterPx = 4 * Math.sqrt(minorVariance);
    const axisRatio = majorDiameterPx / Math.max(1, minorDiameterPx);
    if (axisRatio > 3.2) continue;
    const angleDeg = ((Math.atan2(2 * covXY, covX - covY) * 90) / Math.PI + 180) % 180;
    const ellipseArea = Math.PI * majorDiameterPx * minorDiameterPx * 0.25;
    const ellipseFill = area / Math.max(1, ellipseArea);
    if (ellipseFill < 0.34 || ellipseFill > 1.5) continue;
    const bboxArea = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
    const bboxFill = area / bboxArea;
    const sizeQuality = clamp(area / Math.max(1, minimumArea * 7));
    const ellipseQuality = Math.exp(-2.4 * Math.abs(Math.log(Math.max(0.001, ellipseFill))));
    const roundQuality = Math.exp(-0.72 * Math.max(0, axisRatio - 1));
    const borderQuality = x0 < 2 || y0 < 2 || x1 > width - 3 || y1 > height - 3 ? 0.58 : 1;
    const confidence = clamp(
      0.16 + sizeQuality * 0.24 + ellipseQuality * 0.25 + roundQuality * 0.2 + clamp(bboxFill / 0.72) * 0.15,
    ) * borderQuality;
    const score = area * confidence;
    if (score <= bestScore) continue;
    bestScore = score;
    best = {
      frameWidth: width,
      frameHeight: height,
      centerPx: [centerX, centerY],
      centerNorm: [centerX / width, centerY / height],
      majorDiameterPx,
      minorDiameterPx,
      angleDeg,
      axisRatio,
      areaFraction: area / pixelCount,
      confidence,
      threshold,
      boundsPx: [x0, y0, x1, y1],
    };
  }
  return { detection: best, mask, threshold };
}
