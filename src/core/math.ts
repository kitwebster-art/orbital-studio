import type { AudiovisualParameters, Vec3 } from "./contracts";

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function smoothstep(amount: number): number {
  const value = clamp(amount);
  return value * value * (3 - 2 * value);
}

export function lerpVec3(start: Vec3, end: Vec3, amount: number): Vec3 {
  return {
    x: lerp(start.x, end.x, amount),
    y: lerp(start.y, end.y, amount),
    z: lerp(start.z, end.z, amount),
  };
}

export function addVec3(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

export function subtractVec3(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

export function scaleVec3(value: Vec3, amount: number): Vec3 {
  return {
    x: value.x * amount,
    y: value.y * amount,
    z: value.z * amount,
  };
}

export function interpolateParameters(
  start: AudiovisualParameters,
  end: AudiovisualParameters,
  amount: number,
): AudiovisualParameters {
  const eased = smoothstep(amount);
  return Object.fromEntries(
    Object.keys(start).map((key) => [
      key,
      lerp(
        start[key as keyof AudiovisualParameters],
        end[key as keyof AudiovisualParameters],
        eased,
      ),
    ]),
  ) as unknown as AudiovisualParameters;
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${minutes.toString().padStart(2, "0")}:${remaining
    .toString()
    .padStart(2, "0")}`;
}
