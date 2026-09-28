/** Hand-drawn 1.6px stroke icon set, 16px grid, inherits currentColor. */

const open = (size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">`;

export const ICONS = {
  mark: `<svg width="26" height="26" viewBox="0 0 26 26" fill="none"><circle cx="13" cy="9.5" r="5.2" stroke="currentColor" stroke-width="1.8"/><path d="M8.2 23c.9-3.8 2-6.1 4.8-8m4.8 8c-.9-3.8-2-6.1-4.8-8" stroke="currentColor" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round"/><path d="M5.5 23h15" stroke="currentColor" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  projection: `${open()}<rect x="1.5" y="5" width="6" height="5" rx="1.2"/><path d="M7.5 6.2 14 3v10l-6.5-3.2"/></svg>`,
  pressure: `${open()}<path d="M2.5 11a5.5 5.5 0 1 1 11 0"/><path d="M8 11 10.8 6.8"/><circle cx="8" cy="11" r=".9" fill="currentColor"/></svg>`,
  material: `${open()}<circle cx="8" cy="8" r="5.8"/><path d="M4.6 5.2c1.2-1.2 3-1.6 4.6-1"/></svg>`,
  air: `${open()}<path d="M2 5.5h7.5a2 2 0 1 0-2-2"/><path d="M2 8.5h11a2 2 0 1 1-2 2"/><path d="M2 11.5h5"/></svg>`,
  forces: `${open()}<path d="M8 1.8v5.4M5.6 4.2 8 1.8l2.4 2.4"/><path d="M8 14.2V8.8m-2.4 3L8 14.2l2.4-2.4"/></svg>`,
  tracking: `${open()}<path d="M2 5V3a1 1 0 0 1 1-1h2M11 2h2a1 1 0 0 1 1 1v2M14 11v2a1 1 0 0 1-1 1h-2M5 14H3a1 1 0 0 1-1-1v-2"/><ellipse cx="8" cy="8" rx="3.2" ry="2.6"/></svg>`,
  guide: `${open()}<circle cx="8" cy="8" r="6.3"/><path d="M6.3 6.2a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3v.3"/><circle cx="8" cy="11.6" r=".3" fill="currentColor"/></svg>`,
  snapshot: `${open()}<path d="M2 5.2a1 1 0 0 1 1-1h2l1.2-1.7h3.6L11 4.2h2a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z"/><circle cx="8" cy="8.4" r="2.4"/></svg>`,
  pause: `${open()}<path d="M5.5 3.5v9M10.5 3.5v9"/></svg>`,
  play: `${open()}<path d="M5 3.2v9.6L12.6 8Z"/></svg>`,
  reset: `${open()}<path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8"/><path d="M2.6 2.4v2.4H5"/></svg>`,
  nudge: `${open()}<circle cx="10.5" cy="8" r="3.2"/><path d="M1.5 8h4.6M4.2 5.6 6.4 8l-2.2 2.4"/></svg>`,
  close: `${open()}<path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  height: `${open(14)}<path d="M8 2v10"/><path d="M5.5 4.5 8 2l2.5 2.5"/><path d="M3 14h10"/></svg>`,
  mass: `${open(14)}<path d="M4.2 6h7.6l1.4 7.5H2.8Z"/><circle cx="8" cy="3.8" r="1.6"/></svg>`,
  margin: `${open(14)}<path d="M2.5 13.5h11"/><path d="M4.5 13.5V9M8 13.5V5.5M11.5 13.5V2.5"/></svg>`,
  sway: `${open(14)}<path d="M1.5 8c1.6-3.2 3.2-3.2 4.3 0s2.7 3.2 4.3 0 2.7-3.2 4.4 0"/></svg>`,
  light: `${open(14)}<circle cx="8" cy="8" r="2.6"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>`,
  target: `${open(14)}<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/></svg>`,
  shape: `${open(14)}<circle cx="8" cy="7" r="4.6"/><path d="M5 14.2h6"/></svg>`,
  ruler: `${open(14)}<path d="M2 11.5 11.5 2l2.5 2.5L4.5 14Z"/><path d="M5 9.5l1.3 1.3M7 7.5l1.3 1.3M9 5.5l1.3 1.3"/></svg>`,
  swatch: `${open(14)}<circle cx="8" cy="8" r="5.6"/><path d="M8 2.4v11.2"/></svg>`,
  helium: `${open(14)}<circle cx="8" cy="6.2" r="4"/><path d="M8 10.2 7.2 12h1.6ZM8 12c.3 1 .1 1.6-.4 2.2"/></svg>`,
  fan: `${open(14)}<circle cx="8" cy="8" r="6"/><path d="M8 8c-.4-2.4.4-3.9 2.2-4.4M8 8c2.2.9 3 2.4 2.4 4.2M8 8c-1.8 1.6-3.5 1.6-4.6.3"/></svg>`,
  layers: `${open(14)}<path d="M8 2 14 5.2 8 8.4 2 5.2Z"/><path d="M2 8.4l6 3.2 6-3.2"/></svg>`,
  clock: `${open(14)}<circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.2 1.4"/></svg>`,
  preset: `${open(14)}<path d="M3 3.5h10M3 8h10M3 12.5h6"/></svg>`,
  sparkle: `${open(14)}<path d="M8 1.8 9.3 6.7 14.2 8 9.3 9.3 8 14.2 6.7 9.3 1.8 8 6.7 6.7Z"/></svg>`,
  book: `${open()}<path d="M2.5 3.2c2-.9 3.8-.9 5.5.4v10c-1.7-1.3-3.5-1.3-5.5-.4Z"/><path d="M13.5 3.2c-2-.9-3.8-.9-5.5.4v10c1.7-1.3 3.5-1.3 5.5-.4Z"/></svg>`,
  design: `${open()}<circle cx="8" cy="6.5" r="4.2"/><path d="M4.5 14h7"/></svg>`,
  results: `${open()}<path d="M2 13.5h12"/><path d="M4 11V8M7.3 11V4.5M10.7 11V6.5M14 11V2.8" /></svg>`,
} as const;

export type IconName = keyof typeof ICONS;
