/**
 * Two buttons in the viewport's top-right corner: fold the control column away so
 * the visualisations fill the width, and take the whole studio full screen (for
 * showing the rig or recording it). Both are remembered or reversible with Esc.
 */
const KEY = 'orbital.controls-collapsed/1.0';

export function installViewportChrome(viewport: HTMLElement, shell: HTMLElement): void {
  const bar = document.createElement('div');
  bar.className = 'viewport-chrome';
  bar.innerHTML = '<button type="button" data-chrome="controls" aria-pressed="false" title="Hide or show the controls panel">Hide controls</button><button type="button" data-chrome="fullscreen" aria-pressed="false" title="Full screen">⛶ Full screen</button>';
  viewport.append(bar);
  const controls = bar.querySelector<HTMLButtonElement>('[data-chrome="controls"]')!;
  const fullscreen = bar.querySelector<HTMLButtonElement>('[data-chrome="fullscreen"]')!;

  const setCollapsed = (collapsed: boolean) => {
    shell.dataset.controlsCollapsed = String(collapsed);
    controls.setAttribute('aria-pressed', String(collapsed));
    controls.textContent = collapsed ? 'Show controls' : 'Hide controls';
    try { localStorage.setItem(KEY, String(collapsed)); } catch { /* per-viewer preference only */ }
    // The twin renderer and the HUD size themselves to their boxes; nudge them now.
    window.dispatchEvent(new Event('resize'));
  };
  let stored = false;
  try { stored = localStorage.getItem(KEY) === 'true'; } catch { /* default: shown */ }
  setCollapsed(stored);
  controls.addEventListener('click', () => setCollapsed(shell.dataset.controlsCollapsed !== 'true'));

  const syncFullscreen = () => {
    const on = document.fullscreenElement === shell;
    fullscreen.setAttribute('aria-pressed', String(on));
    fullscreen.textContent = on ? '⛶ Exit full screen' : '⛶ Full screen';
    window.dispatchEvent(new Event('resize'));
  };
  fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shell.requestFullscreen?.().catch(() => undefined);
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
}
