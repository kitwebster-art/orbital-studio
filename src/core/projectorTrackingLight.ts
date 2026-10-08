import type { WorldState } from './contracts';
/** Illumination only. Never authorises artwork or supplies invented geometry. */
export function trackingLightAllowed(enabled: boolean, blackout: boolean, world: WorldState | null, probeDark: boolean, index: number, post: boolean): boolean {
  return enabled && !blackout && !probeDark && index === 0 && post
    && world?.mode === 'live' && world.diagnostics.flags.includes('HUATENG_HT_GE134GM_T1P_C');
}
export function trackingLightLinear(level: number): number {
  const v = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
