import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  testId?: string;
  /** Never shrink below this (a safety net; the design size fits the content). */
  min?: number;
}

/**
 * Fills its (flex) box and scales its content down uniformly if it would not fit, so long
 * server text (hints, sticky notes, titles) can never be clipped or overflow the page.
 */
export function ShrinkToFit({ children, className = "", testId, min = 0.6 }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      // Layout sizes, unaffected by the transform applied to the inner box.
      const availH = o.clientHeight;
      const availW = o.clientWidth;
      const needH = i.scrollHeight;
      const needW = i.scrollWidth;
      if (availH <= 0 || availW <= 0) return;
      const next = Math.max(min, Math.min(1, availH / needH, availW / needW));
      setK((prev) => (Math.abs(prev - next) < 0.005 ? prev : next));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [min]);

  return (
    <div
      ref={outer}
      className={`relative min-h-0 ${className}`}
      data-testid={testId}
      data-shrink="1"
      data-k={k.toFixed(3)}
      data-min={min}
    >
      <div
        ref={inner}
        className="absolute inset-x-0 top-0 origin-top"
        style={{ transform: k < 1 ? `scale(${k})` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
