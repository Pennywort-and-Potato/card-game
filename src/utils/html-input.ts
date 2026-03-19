// Factory for HTML <input> overlays positioned over the PixiJS canvas.
// This allows native mobile keyboards to appear on touch devices.

import { toScreen, toScreenSize } from "./viewport";

export interface HtmlInputOptions {
  type?: "text" | "password" | "email";
  placeholder?: string;
  maxLength?: number;
  initialValue?: string;
  /** Called whenever the input value changes */
  onChange: (value: string) => void;
  /** Called when Enter is pressed */
  onEnter?: () => void;
}

export interface HtmlInputHandle {
  el: HTMLInputElement;
  getValue: () => string;
  setValue: (v: string) => void;
  destroy: () => void;
  reposition: (
    pixiX: number,
    pixiY: number,
    pixiW: number,
    pixiH: number,
  ) => void;
}

/**
 * Create an HTML <input> absolutely positioned over the PixiJS canvas.
 * @param pixiX  - left edge in PixiJS viewport coordinates
 * @param pixiY  - top edge in PixiJS viewport coordinates
 * @param pixiW  - width in PixiJS viewport coordinates
 * @param pixiH  - height in PixiJS viewport coordinates
 */
export const createHtmlInput = (
  pixiX: number,
  pixiY: number,
  pixiW: number,
  pixiH: number,
  opts: HtmlInputOptions,
): HtmlInputHandle => {
  const el = document.createElement("input");
  el.type = opts.type ?? "text";
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.maxLength) el.maxLength = opts.maxLength;
  if (opts.initialValue !== undefined) el.value = opts.initialValue;

  el.className = "pixi-html-input";

  const position = () => {
    const { x, y } = toScreen(pixiX, pixiY);
    const { w, h } = toScreenSize(pixiW, pixiH);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.fontSize = `${Math.max(12, h * 0.45)}px`;
  };

  position();

  const container = document.getElementById("pixi-container")!;
  container.appendChild(el);

  el.addEventListener("input", () => opts.onChange(el.value));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") opts.onEnter?.();
  });

  const onResize = () => position();
  window.addEventListener("resize", onResize);

  return {
    el,
    getValue: () => el.value,
    setValue: (v) => {
      el.value = v;
    },
    destroy: () => {
      window.removeEventListener("resize", onResize);
      if (el.parentNode) el.parentNode.removeChild(el);
    },
    reposition: (x, y, w, h) => {
      pixiX = x;
      pixiY = y;
      pixiW = w;
      pixiH = h;
      position();
    },
  };
};
