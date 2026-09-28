/** Accessible, styled form controls: slider, segmented control, switch. */
import { el, svg, setAttr, replaceValue } from "./dom";
import { ICONS, type IconName } from "./icons";
import type { Formatted } from "../format";

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${(uid += 1)}`;

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

export interface SliderOptions {
  label: string;
  icon?: IconName;
  min: number;
  max: number;
  /** Value snapping applied after mapping (optional). */
  snap?: (value: number) => number;
  scale?: "linear" | "log";
  format: (value: number) => Formatted;
  hint?: (value: number) => string | Node;
  accent?: "air" | "light";
  tip?: string;
  onInput: (value: number) => void;
}

const POSITIONS = 400;

export class Slider {
  readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly output: HTMLOutputElement;
  private readonly hintNode: HTMLDivElement | null;
  private value: number;

  constructor(private readonly options: SliderOptions, initial: number) {
    const id = nextId("slider");
    this.value = initial;
    this.input = el("input", {
      class: options.accent === "light" ? "range range--amber" : "range",
      attrs: { type: "range", id, min: 0, max: POSITIONS, step: 1 },
    });
    this.output = el("output", { class: "field__value", attrs: { for: id } });
    const label = el("label", { class: "field__label", attrs: { for: id } }, [
      options.icon ? svg(ICONS[options.icon]) : null,
      options.label,
    ]);
    if (options.tip) {
      label.setAttribute("data-tip", options.tip);
      label.setAttribute("data-tip-align", "start");
    }
    this.hintNode = options.hint ? el("div", { class: "field__hint" }) : null;
    this.root = el("div", { class: "field" }, [
      el("div", { class: "field__row" }, [label, this.output]),
      this.input,
      this.hintNode,
    ]);
    this.input.addEventListener("input", () => {
      const raw = this.fromPosition(Number(this.input.value));
      const next = options.snap ? options.snap(raw) : raw;
      this.value = next;
      this.paint();
      options.onInput(next);
    });
    this.set(initial);
  }

  get current(): number {
    return this.value;
  }

  set(value: number): void {
    this.value = value;
    this.input.value = String(Math.round(this.toPosition(value)));
    this.paint();
  }

  private paint(): void {
    const position = Number(this.input.value) / POSITIONS;
    this.input.style.setProperty("--fill", `${(position * 100).toFixed(2)}%`);
    const formatted = this.options.format(this.value);
    replaceValue(this.output, formatted.value, formatted.unit);
    setAttr(this.input, "aria-valuetext", formatted.unit ? `${formatted.value} ${formatted.unit}` : formatted.value);
    if (this.hintNode && this.options.hint) {
      const hint = this.options.hint(this.value);
      if (typeof hint === "string") {
        if (this.hintNode.textContent !== hint) this.hintNode.textContent = hint;
      } else {
        this.hintNode.replaceChildren(hint);
      }
    }
  }

  private toPosition(value: number): number {
    const { min, max } = this.options;
    const clamped = Math.min(max, Math.max(min, value));
    if (this.options.scale === "log") {
      return (Math.log(clamped / min) / Math.log(max / min)) * POSITIONS;
    }
    return ((clamped - min) / (max - min)) * POSITIONS;
  }

  private fromPosition(position: number): number {
    const { min, max } = this.options;
    const t = Math.min(1, Math.max(0, position / POSITIONS));
    if (this.options.scale === "log") return min * Math.pow(max / min, t);
    return min + (max - min) * t;
  }
}

// ---------------------------------------------------------------------------
// Segmented control (radio group with a sliding indicator)
// ---------------------------------------------------------------------------

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  key?: string;
  tip?: string;
}

export interface SegmentedOptions<T extends string> {
  label: string;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  variant?: "default" | "amber";
  compact?: boolean;
  block?: boolean;
}

export class Segmented<T extends string> {
  readonly root: HTMLDivElement;
  private readonly indicator: HTMLSpanElement;
  private readonly buttons = new Map<T, HTMLButtonElement>();
  private value: T;

  constructor(private readonly options: SegmentedOptions<T>, initial: T) {
    this.value = initial;
    this.indicator = el("span", { class: "seg__indicator", attrs: { "aria-hidden": "true" } });
    const classes = ["seg"];
    if (options.variant === "amber") classes.push("seg--amber");
    if (options.compact) classes.push("seg--compact");
    if (options.block) classes.push("seg--block");
    this.root = el("div", {
      class: classes.join(" "),
      attrs: { role: "radiogroup", "aria-label": options.label },
    }, [this.indicator]);
    for (const option of options.options) {
      const button = el("button", {
        class: "seg__opt",
        attrs: {
          type: "button",
          role: "radio",
          "aria-checked": "false",
          tabindex: -1,
          "data-tip": option.tip,
          "data-tip-pos": option.tip ? "below" : undefined,
        },
      }, [
        option.icon ? svg(ICONS[option.icon]) : null,
        el("span", { text: option.label }),
        option.key ? el("span", { class: "seg__key", text: option.key, attrs: { "aria-hidden": "true" } }) : null,
      ]);
      button.addEventListener("click", () => this.choose(option.value, true));
      button.addEventListener("keydown", (event) => this.onKey(event));
      this.buttons.set(option.value, button);
      this.root.append(button);
    }
    this.set(initial);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.placeIndicator()).observe(this.root);
    }
  }

  set(value: T): void {
    this.value = value;
    for (const [key, button] of this.buttons) {
      const active = key === value;
      setAttr(button, "aria-checked", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    this.placeIndicator();
  }

  get current(): T {
    return this.value;
  }

  placeIndicator(): void {
    const button = this.buttons.get(this.value);
    if (!button || button.offsetWidth === 0) return;
    this.indicator.style.width = `${button.offsetWidth}px`;
    this.indicator.style.transform = `translateX(${button.offsetLeft}px)`;
  }

  private choose(value: T, focus: boolean): void {
    if (value !== this.value) {
      this.set(value);
      this.options.onChange(value);
    }
    if (focus) this.buttons.get(value)?.focus({ preventScroll: true });
  }

  private onKey(event: KeyboardEvent): void {
    const values = this.options.options.map((option) => option.value);
    const index = values.indexOf(this.value);
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % values.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + values.length) % values.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = values.length - 1;
    else return;
    event.preventDefault();
    this.choose(values[next], true);
  }
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

export class Switch {
  readonly root: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private checked: boolean;

  constructor(label: string, hint: string, initial: boolean, onChange: (checked: boolean) => void) {
    const id = nextId("switch");
    this.checked = initial;
    this.button = el("button", {
      class: "switch",
      attrs: { type: "button", role: "switch", "aria-checked": String(initial), "aria-labelledby": `${id}-label` },
    });
    this.button.addEventListener("click", () => {
      this.set(!this.checked);
      onChange(this.checked);
    });
    this.root = el("div", { class: "toggle-row" }, [
      el("div", { class: "toggle-row__text" }, [
        el("span", { class: "toggle-row__label", text: label, attrs: { id: `${id}-label` } }),
        el("span", { class: "toggle-row__hint", text: hint }),
      ]),
      this.button,
    ]);
  }

  set(checked: boolean): void {
    this.checked = checked;
    setAttr(this.button, "aria-checked", String(checked));
  }
}

// ---------------------------------------------------------------------------
// Toggle chip (top bar)
// ---------------------------------------------------------------------------

export function toggleChip(label: string, key: string, tip: string, onClick: () => void): HTMLButtonElement {
  const button = el("button", {
    class: "chip-toggle",
    attrs: { type: "button", "aria-pressed": "false", "data-tip": tip, "data-tip-pos": "below", "aria-keyshortcuts": key },
  }, [el("span", { class: "chip-toggle__dot", attrs: { "aria-hidden": "true" } }), label]);
  button.addEventListener("click", onClick);
  return button;
}

export function iconButton(icon: IconName, label: string, onClick: () => void, extraClass = ""): HTMLButtonElement {
  const button = el("button", {
    class: `icon-btn ${extraClass}`.trim(),
    attrs: { type: "button", "aria-label": label, "data-tip": label, "data-tip-pos": "below" },
  }, [svg(ICONS[icon])]);
  button.addEventListener("click", onClick);
  return button;
}

// ---------------------------------------------------------------------------
// Arrow-key navigation for radio-style grids (roving tabindex)
// ---------------------------------------------------------------------------

/**
 * Arrow keys move between items (Left/Right by one, Up/Down by a row), skipping
 * items marked aria-disabled. Selection follows focus, like native radios.
 */
export function attachGridNavigation(
  items: HTMLElement[],
  columns: number,
  onChoose: (index: number) => void,
): void {
  items.forEach((item, index) => {
    item.addEventListener("keydown", (event) => {
      let step = 0;
      if (event.key === "ArrowRight") step = 1;
      else if (event.key === "ArrowLeft") step = -1;
      else if (event.key === "ArrowDown") step = columns;
      else if (event.key === "ArrowUp") step = -columns;
      else return;
      event.preventDefault();
      let next = index;
      for (let guard = 0; guard < items.length; guard += 1) {
        next = (next + step + items.length) % items.length;
        if (items[next].getAttribute("aria-disabled") !== "true") break;
      }
      items[next].focus({ preventScroll: false });
      onChoose(next);
    });
  });
}
