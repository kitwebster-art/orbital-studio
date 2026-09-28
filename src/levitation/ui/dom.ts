/** Minimal DOM building helpers. No framework, no virtual DOM. */

export type Child = Node | string | number | null | undefined | false;

export interface ElementOptions {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  style?: Record<string, string>;
  dataset?: Record<string, string>;
  on?: { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value === undefined || value === false) continue;
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  if (options.style) {
    for (const [key, value] of Object.entries(options.style)) {
      node.style.setProperty(key, value);
    }
  }
  if (options.dataset) {
    for (const [key, value] of Object.entries(options.dataset)) {
      node.dataset[key] = value;
    }
  }
  if (options.on) {
    for (const [type, handler] of Object.entries(options.on)) {
      node.addEventListener(type, handler as EventListener);
    }
  }
  append(node, children);
  return node;
}

/**
 * Mark a scroll container with data-at-end so CSS can drop its bottom fade once
 * the last item is fully in view (the fade only exists to say "more below").
 */
export function watchScrollEnd(node: HTMLElement): void {
  const update = () => {
    const atEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
    if (node.dataset.atEnd !== String(atEnd)) node.dataset.atEnd = String(atEnd);
  };
  node.addEventListener("scroll", update, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(update);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
  }
  update();
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "string" || typeof child === "number"
      ? document.createTextNode(String(child))
      : child);
  }
}

/** Parse a trusted, static SVG string (our own icon set) into an element. */
export function svg(markup: string): SVGElement {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  const node = template.content.firstElementChild;
  if (!(node instanceof SVGElement)) {
    throw new Error("Icon markup must be a single <svg> element");
  }
  node.setAttribute("aria-hidden", "true");
  node.setAttribute("focusable", "false");
  return node;
}

/** Set text only when it changed, to avoid layout work in per-frame readouts. */
export function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function setAttr(node: Element, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

/** Value + unit markup used across readouts. */
export function valueWithUnit(value: string, unit: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(el("span", { class: "num", text: value }));
  if (unit) fragment.append(el("span", { class: "unit", text: unit }));
  return fragment;
}

export function replaceValue(node: Element, value: string, unit: string): void {
  const current = node.getAttribute("data-rendered");
  const next = `${value}|${unit}`;
  if (current === next) return;
  node.setAttribute("data-rendered", next);
  node.replaceChildren(valueWithUnit(value, unit));
}
