import { createContext, useContext, useLayoutEffect, useState, type RefObject } from "react";
import { BOOK_H, BOOK_W, TOP_CLEAR } from "./bookGeometry";

export interface BookFit {
  /** Uniform scale of the whole spread (design px → CSS px). */
  scale: number;
  /** Offsets of the scaled book inside its container (CSS px). */
  left: number;
  top: number;
}

const MAX_SCALE = 1.25;
const FALLBACK: BookFit = { scale: 1, left: 0, top: 0 };

/** The book's fit for a container of w × h CSS px (pure; unit-tested). */
export function fitBook(w: number, h: number): BookFit {
  if (w <= 0 || h <= 0) return FALLBACK;
  const scale = Math.min(MAX_SCALE, w / BOOK_W, h / BOOK_H);
  const bw = BOOK_W * scale;
  const bh = BOOK_H * scale;
  const slack = h - bh;
  // Centered, but keep the mug's corner clear above the book when there's room for it.
  const top = Math.min(slack, Math.max(slack / 2, Math.min(TOP_CLEAR, slack)));
  return { scale, left: (w - bw) / 2, top };
}

/** Scales the spread to fit both the width and the height of the container (§F12.3). */
export function useBookFit(ref: RefObject<HTMLElement | null>): BookFit {
  const [fit, setFit] = useState<BookFit>(FALLBACK);
  // Layout effect: the first measurement lands before the first paint, so a freshly mounted
  // book (cover ↔ card swaps) never shows a frame at the wrong scale; the observer follows resizes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      const next = fitBook(w, h);
      setFit((prev) =>
        Math.abs(prev.scale - next.scale) < 1e-4 &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.top - next.top) < 0.5
          ? prev
          : next,
      );
    };
    apply(el.clientWidth, el.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) apply(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return fit;
}

/** The spread's current scale, for parts that size things in on-screen px (diagram digits). */
export const BookScaleContext = createContext(1);
export const useBookScale = () => useContext(BookScaleContext);
