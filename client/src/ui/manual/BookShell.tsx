import { useRef, type ReactNode } from "react";
import type { Lang } from "../../net/protocol";
import { BOOK_H, BOOK_W, COVER_HALF_MS, GUTTER, PAGE_W, STACK } from "./bookGeometry";
import { BookScaleContext, useBookFit } from "./useBookScale";

interface Props {
  testId: string;
  lang?: Lang;
  /** Design-px shift of the spread (the closed book slides to the center), eased. */
  shiftX?: number;
  /** Wait this long before sliding (the close slides after its flip). */
  shiftDelayMs?: number;
  children: ReactNode;
}

/**
 * The manual's frame: fills the Tower's center column and scales the fixed-size spread (design
 * px) uniformly to fit both its width and its height, so nothing is ever clipped or scrolls
 * (§F12.3). The spread is absolutely positioned, so it never pushes the column wider.
 */
export function BookShell({ testId, lang, shiftX = 0, shiftDelayMs = 0, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const fit = useBookFit(ref);
  const axis = STACK + PAGE_W + GUTTER / 2;
  return (
    <div ref={ref} className="relative h-full w-full" data-testid={testId} lang={lang}>
      <div
        data-testid="manual-spread"
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: BOOK_W,
          height: BOOK_H,
          transform: `translate(${fit.left}px, ${fit.top}px) scale(${fit.scale})`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: shiftX ? `translateX(${shiftX}px)` : undefined,
            transition: `transform ${COVER_HALF_MS}ms ease-in-out ${shiftDelayMs}ms`,
            perspective: 2400,
            perspectiveOrigin: `${axis}px 50%`,
          }}
        >
          <BookScaleContext.Provider value={fit.scale}>{children}</BookScaleContext.Provider>
        </div>
      </div>
    </div>
  );
}
