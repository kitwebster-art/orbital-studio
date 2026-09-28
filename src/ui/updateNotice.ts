/**
 * "Update ready" chip for the stable Studio build (port 4178). The build carries
 * version.json; this checks it every 20 seconds and, when a newer build has been
 * published, shows a chip in the header. Nothing reloads by itself, so a running
 * test is never interrupted. The development server has no version.json, so the
 * chip never appears there.
 */
export function installUpdateNotice(header: HTMLElement | null, intervalMs = 20_000): void {
  if (!header) return;
  let loaded: string | null = null;
  const read = async (): Promise<string | null> => {
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return null;
      const value = (await response.json()) as { version?: unknown };
      return typeof value.version === 'string' ? value.version : null;
    } catch {
      return null;
    }
  };
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'update-chip';
  chip.hidden = true;
  chip.textContent = 'Update ready · Reload';
  chip.title = 'A newer Studio has been published. Reload when you are ready: your scan and settings are kept, then press Go live.';
  chip.addEventListener('click', () => window.location.reload());
  header.append(chip);
  void read().then((version) => {
    if (version === null) return; // development server: no published builds
    loaded = version;
    window.setInterval(async () => {
      const latest = await read();
      if (latest && latest !== loaded) chip.hidden = false;
    }, intervalMs);
  });
}
