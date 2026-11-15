import { BOOK_H, GUTTER, PAGE_H, PAGE_W, RIGHT_PAGE_X, SPREAD_W, STACK } from "./bookGeometry";

const RING_Y = [0.1, 0.3, 0.5, 0.7, 0.9];
const RING_H = 16;
const BITE = 15; // how far each ring reaches onto each page

interface Props {
  /** Spine strip color (the phase color). */
  spine: string;
  /** Only the right half is shown (the closed book). */
  closed?: boolean;
}

/**
 * The binding of the open manual (§F12.3): stacked page edges along both outer sides, a thin
 * colored spine strip in the gutter and five chunky metal rings over punched holes. Original art.
 */
export function BookBinding({ spine, closed = false }: Props) {
  const axis = STACK + PAGE_W + GUTTER / 2;
  return (
    <>
      {/* stacked sheets peeking out behind the pages (outer sides, top and bottom) */}
      {(closed ? ["right"] : ["left", "right"]).map((side) =>
        [2, 1].map((n) => (
          <span
            key={`${side}-${n}`}
            aria-hidden="true"
            data-testid="page-stack"
            className="absolute rounded-[18px] border-2 border-[#cfc6b2] bg-[#F7F2E6]"
            style={{
              top: STACK - n * 2.5,
              height: PAGE_H + n * 5,
              width: PAGE_W,
              left: side === "left" ? STACK - n * 3 : RIGHT_PAGE_X + n * 3,
            }}
          />
        )),
      )}
      {/* spine strip */}
      <span
        aria-hidden="true"
        className="absolute rounded-sm"
        style={{
          left: axis - 3,
          width: 6,
          top: STACK + 10,
          height: PAGE_H - 20,
          background: spine,
          opacity: 0.85,
        }}
      />
      <svg
        aria-hidden="true"
        data-testid="book-rings"
        className="pointer-events-none absolute top-0 left-0 z-20"
        width={SPREAD_W}
        height={BOOK_H}
        viewBox={`0 0 ${SPREAD_W} ${BOOK_H}`}
      >
        <defs>
          <linearGradient id="book-ring" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#5b606c" />
            <stop offset="0.35" stopColor="#3a3e48" />
            <stop offset="1" stopColor="#1d2027" />
          </linearGradient>
        </defs>
        {RING_Y.map((f) => {
          const y = STACK + PAGE_H * f;
          const x0 = axis - GUTTER / 2 - BITE;
          const x1 = axis + GUTTER / 2 + BITE;
          return (
            <g key={f}>
              {!closed && <circle cx={x0 + 6} cy={y} r={4.5} fill="#1E222B" />}
              <circle cx={x1 - 6} cy={y} r={4.5} fill="#1E222B" />
              <rect
                x={closed ? axis - 6 : x0}
                y={y - RING_H / 2}
                width={closed ? x1 - axis + 6 : x1 - x0}
                height={RING_H}
                rx={RING_H / 2}
                fill="none"
                stroke="url(#book-ring)"
                strokeWidth={6}
              />
              <path
                d={`M${(closed ? axis - 6 : x0) + 8} ${y - RING_H / 2 + 1.5} H${x1 - 8}`}
                stroke="#9aa0ad"
                strokeWidth={1.5}
                strokeLinecap="round"
                opacity={0.7}
              />
            </g>
          );
        })}
      </svg>
    </>
  );
}
