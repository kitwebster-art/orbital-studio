/**
 * One floating tooltip for every element with a data-tip attribute. It lives
 * on <body> with fixed positioning, so scrolling panels and the dock never clip
 * it. Shows after a short delay on hover, immediately on keyboard focus, and
 * links itself with aria-describedby while visible.
 */

const HOVER_DELAY_MS = 320;
const GAP = 8;
const MARGIN = 10;

export function installTooltips(root: Document = document): () => void {
  const tip = root.createElement("div");
  tip.className = "lab-tooltip";
  tip.id = "lab-tooltip";
  tip.setAttribute("role", "tooltip");
  tip.dataset.visible = "false";
  root.body.append(tip);

  let target: HTMLElement | null = null;
  let timer = 0;

  const findTarget = (node: EventTarget | null): HTMLElement | null =>
    node instanceof Element ? (node.closest("[data-tip]") as HTMLElement | null) : null;

  const place = () => {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const below = target.getAttribute("data-tip-pos") === "below" || rect.top - box.height - GAP < MARGIN;
    const align = target.getAttribute("data-tip-align");
    let x = align === "start" ? rect.left : align === "end" ? rect.right - box.width : rect.left + rect.width / 2 - box.width / 2;
    x = Math.min(window.innerWidth - box.width - MARGIN, Math.max(MARGIN, x));
    let y = below ? rect.bottom + GAP : rect.top - box.height - GAP;
    y = Math.min(window.innerHeight - box.height - MARGIN, Math.max(MARGIN, y));
    tip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  };

  const show = (next: HTMLElement) => {
    const text = next.getAttribute("data-tip");
    if (!text) return;
    target = next;
    tip.textContent = text;
    tip.dataset.visible = "true";
    place();
    next.setAttribute("aria-describedby", tip.id);
  };

  const hide = () => {
    window.clearTimeout(timer);
    if (target?.getAttribute("aria-describedby") === tip.id) target.removeAttribute("aria-describedby");
    target = null;
    tip.dataset.visible = "false";
  };

  const onOver = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const next = findTarget(event.target);
    if (next === target) return;
    hide();
    if (!next) return;
    timer = window.setTimeout(() => show(next), HOVER_DELAY_MS);
  };
  const onOut = (event: PointerEvent) => {
    const next = findTarget(event.relatedTarget);
    if (next && next === findTarget(event.target)) return;
    hide();
  };
  const onFocus = (event: FocusEvent) => {
    const next = findTarget(event.target);
    if (!next) return;
    hide();
    // Only keyboard focus shows a tip immediately; clicks already see the hover tip.
    if (next.matches(":focus-visible")) show(next);
  };

  root.addEventListener("pointerover", onOver);
  root.addEventListener("pointerout", onOut);
  root.addEventListener("focusin", onFocus);
  root.addEventListener("focusout", hide);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") hide();
  };
  root.addEventListener("pointerdown", hide, true);
  root.addEventListener("keydown", onKey);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);

  return () => {
    hide();
    tip.remove();
    root.removeEventListener("pointerover", onOver);
    root.removeEventListener("pointerout", onOut);
    root.removeEventListener("focusin", onFocus);
    root.removeEventListener("focusout", hide);
    root.removeEventListener("pointerdown", hide, true);
    root.removeEventListener("keydown", onKey);
    window.removeEventListener("scroll", hide, true);
    window.removeEventListener("resize", hide);
  };
}
