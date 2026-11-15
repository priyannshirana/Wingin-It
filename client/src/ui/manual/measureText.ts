// Real callout-tag text widths (Baloo 2 600 at CALLOUT_PX), measured with a canvas once the
// font faces for that text are loaded. Until then, and in tests (jsdom has no canvas or font
// engine), it returns null and the layout falls back to its deliberately generous estimate.
import { useSyncExternalStore } from "react";
import { CALLOUT_PX, estimateTextPx, type TextMeasure } from "./diagramLayout";

const FONT = `600 ${CALLOUT_PX}px "Baloo 2"`;
const cache = new Map<string, number>();
let ctx: CanvasRenderingContext2D | null | undefined;
let version = 0;
const listeners = new Set<() => void>();

function canMeasure(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof navigator !== "undefined" &&
    !navigator.userAgent.includes("jsdom") &&
    "fonts" in document
  );
}

function context(): CanvasRenderingContext2D | null {
  if (ctx === undefined)
    ctx = canMeasure() ? document.createElement("canvas").getContext("2d") : null;
  return ctx;
}

/** The real width in CSS px at CALLOUT_PX, or null when the font isn't available (yet). */
export function realTagPx(text: string): number | null {
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const c = context();
  if (!c) return null;
  if (!document.fonts.check(FONT, text)) {
    // Ask for the faces this text needs; `loadingdone` bumps the version and re-lays out.
    void document.fonts.load(FONT, text).catch(() => undefined);
    return null;
  }
  c.font = FONT;
  const w = c.measureText(text).width;
  cache.set(text, w);
  return w;
}

/**
 * The width the diagram lays a tag out with: the real width, but never less than the generous
 * estimate. Real text therefore never overflows its pill, and the layout stays exactly the one
 * the unit tests check (made with the estimate) unless a real width is ever wider.
 */
export const measureTagPx: TextMeasure = (text) => {
  const real = realTagPx(text);
  return real === null ? null : Math.max(real, estimateTextPx(text));
};

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (listeners.size === 1 && canMeasure()) {
    document.fonts.addEventListener("loadingdone", bump);
    void document.fonts.ready.then(bump);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && canMeasure()) {
      document.fonts.removeEventListener("loadingdone", bump);
    }
  };
}

function bump() {
  version += 1;
  for (const l of listeners) l();
}

/** Changes whenever more font faces have loaded (re-measure, re-lay out). */
export function useFontsVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}
