import type { CSSProperties, ReactNode } from "react";
import { PAGE_H, PAGE_PAD, PAGE_W } from "./bookGeometry";

// Fixed pseudo-random rain smudges for phase 3 pages (§F12.3), per page, in design px.
const SMUDGES = [
  { left: 40, top: 120, size: 46 },
  { left: 236, top: 64, size: 34 },
  { left: 270, top: 410, size: 52 },
  { left: 74, top: 500, size: 38 },
];

interface Props {
  side: "left" | "right";
  smudges: boolean;
  children?: ReactNode;
  /** Position inside the spread (design px); omitted when the page fills a leaf face. */
  x?: number;
  y?: number;
  hidden?: boolean;
  testId?: string;
}

/**
 * One page of the open manual: white paper with a faint warm edge, a 2 px darker border, a soft
 * shadow and a soft gutter shadow along its inner edge (§F12.3). Fixed design size; its content
 * is laid out to fit inside it (the e2e fit test checks every element's box).
 */
export function BookPage({ side, smudges, children, x, y, hidden = false, testId }: Props) {
  const gutterShade =
    side === "left"
      ? "linear-gradient(to left, rgb(60 40 10 / 0.16), rgb(60 40 10 / 0.05) 16px, transparent 34px)"
      : "linear-gradient(to right, rgb(60 40 10 / 0.16), rgb(60 40 10 / 0.05) 16px, transparent 34px)";
  const style: CSSProperties = {
    width: PAGE_W,
    height: PAGE_H,
    padding: PAGE_PAD,
    left: x ?? 0,
    top: y ?? 0,
    visibility: hidden ? "hidden" : undefined,
  };
  return (
    <div
      data-testid={testId ?? `page-${side}`}
      data-page={side}
      className={`absolute flex flex-col border-2 border-[#d9d2c2] bg-white text-ink shadow-[0_10px_24px_rgb(0_0_0/0.3),inset_0_0_0_5px_#F4EFE4] ${side === "left" ? "rounded-l-[18px] rounded-r-md" : "rounded-l-md rounded-r-[18px]"}`}
      style={style}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: gutterShade }}
      />
      {children}
      {smudges &&
        SMUDGES.map((s, i) => (
          <span
            key={i}
            data-testid="smudge"
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-[#6b7c99]/25 blur-md"
            style={{ left: s.left, top: s.top, width: s.size, height: s.size }}
          />
        ))}
    </div>
  );
}
