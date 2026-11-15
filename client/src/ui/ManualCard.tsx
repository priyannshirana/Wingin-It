import type { ReactNode } from "react";
import { useT } from "../i18n/useT";
import type { ManualCard as ManualCardData } from "../net/protocol";
import { Checklist } from "./Checklist";
import { FindOut } from "./manual/FindOut";
import { InkSegments } from "./manual/InkSegments";
import { PanelDrawing } from "./manual/PanelDrawing";
import { PhaseTabs, TAB_REACH_PX } from "./manual/PhaseTabs";
import { RuleTable } from "./manual/RuleTable";

// Fixed pseudo-random rain smudges for phase 3 pages (§F12.3), per page.
const SMUDGES = [
  { left: "12%", top: "18%", size: 46 },
  { left: "68%", top: "9%", size: 34 },
  { left: "78%", top: "62%", size: 52 },
  { left: "22%", top: "74%", size: 38 },
];

// The open ring-bound manual (§F12.3). Left page = the step as one module page (title, diagram,
// instruction line, pictogram rule grid); right page = notes and progress. Card text arrives
// localized from the server and renders as is.
export function ManualCard({ card }: { card: ManualCardData }) {
  const t = useT();
  return (
    <div
      className="relative mx-auto flex h-full max-h-[860px] w-full max-w-[1100px]"
      style={{ paddingRight: TAB_REACH_PX }}
      data-testid="manual-card"
      lang={card.lang}
    >
      <Page side="left" key={card.action_id} turning smudges={card.smudges}>
        <header className="flex shrink-0 items-start justify-between gap-3">
          <h2
            data-testid="module-title"
            className="font-display text-[34px] leading-none font-extrabold tracking-wide uppercase"
          >
            {card.title}
          </h2>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded-full bg-ink px-3 py-0.5 font-display text-sm font-extrabold text-white">
              {t("manual.step", { i: card.index + 1, n: card.total })}
            </span>
            <span className="font-display text-sm font-semibold text-ink/60">
              {card.phase_name}
            </span>
          </div>
        </header>
        <div className="min-h-[26%] shrink grow basis-[45%]" data-testid="diagram-slot">
          <PanelDrawing
            station={card.station}
            lang={card.lang}
            circled={card.highlight.circled}
            question={card.highlight.question}
          />
        </div>
        <FindOut card={card} />
        <RuleTable card={card} />
      </Page>

      <div className="relative flex min-w-0 flex-[0.44]">
        <Rings />
        <Page side="right" smudges={card.smudges}>
          <PhaseTabs current={card.phase} />
          <div className="relative mt-4 flex items-start gap-2" data-testid="hint">
            <svg viewBox="0 0 60 40" className="mt-1 w-12 shrink-0" aria-hidden="true">
              <path
                d="M56 30 C 40 34 20 30 8 14"
                fill="none"
                stroke="#555"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M4 22 L8 13 L17 16"
                fill="none"
                stroke="#555"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="-rotate-2 font-hand text-[20px] leading-snug text-pencil-grey">
              {card.hint}
            </p>
          </div>
          {card.sticky && (
            <div
              data-testid="sticky"
              className="relative mx-auto mt-8 w-[85%] rotate-[4deg] bg-sticky p-4 font-hand text-[22px] leading-snug text-ink shadow-[0_8px_14px_rgb(0_0_0/0.18)]"
            >
              <span className="absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 -rotate-2 bg-white/70 shadow-sm" />
              {card.sticky}
            </div>
          )}
          {card.last_wrong && (
            <p
              data-testid="last-wrong"
              className="mt-8 -rotate-2 font-hand text-xl text-wrong-ink underline decoration-wavy decoration-2 underline-offset-4"
            >
              {t("manual.last_try")} <InkSegments segments={card.last_wrong.label} /> ×
              {card.last_wrong.count} ✗
            </p>
          )}
          <div className="mt-auto pt-4">
            <Checklist card={card} />
          </div>
          {card.stamp === "emergency" && (
            <span
              data-testid="emergency-stamp"
              className="pointer-events-none absolute top-[54%] right-4 left-6 rotate-12 rounded-xl border-4 border-double border-lamp-red px-1 py-0.5 text-center font-display text-lg font-extrabold tracking-wide text-lamp-red opacity-85 mix-blend-multiply"
            >
              {t("manual.emergency")}
            </span>
          )}
        </Page>
      </div>
    </div>
  );
}

interface PageProps {
  side: "left" | "right";
  turning?: boolean;
  smudges: boolean;
  children: ReactNode;
}

function Page({ side, turning = false, smudges, children }: PageProps) {
  const shape =
    side === "left"
      ? "flex-1 rounded-l-2xl origin-right gap-2.5 p-[5%]"
      : "flex-1 rounded-r-2xl origin-left p-5";
  return (
    <div
      className={`relative flex min-w-0 flex-col border-2 border-[#d9d2c2] bg-white text-ink shadow-[0_14px_30px_rgb(0_0_0/0.35),inset_0_0_0_6px_#F4EFE4] ${shape} ${turning ? "animate-page-turn" : ""}`}
    >
      {children}
      {smudges &&
        SMUDGES.map((s, i) => (
          <span
            key={i}
            data-testid="smudge"
            className="pointer-events-none absolute rounded-full bg-[#6b7c99]/25 blur-md"
            style={{ left: s.left, top: s.top, width: s.size, height: s.size }}
          />
        ))}
    </div>
  );
}

/** Five chunky metal rings over punched holes in the gutter. */
function Rings() {
  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 z-10 h-full w-10 -translate-x-1/2"
      viewBox="0 0 40 500"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ring-metal" x1="0" x2="1">
          <stop offset="0" stopColor="#6b6f7a" />
          <stop offset="0.5" stopColor="#e6e8ee" />
          <stop offset="1" stopColor="#6b6f7a" />
        </linearGradient>
      </defs>
      {[60, 150, 250, 350, 440].map((y) => (
        <g key={y}>
          <circle cx="8" cy={y} r="4" fill="#1E222B" />
          <circle cx="32" cy={y} r="4" fill="#1E222B" />
          <rect
            x="5"
            y={y - 7}
            width="30"
            height="14"
            rx="7"
            fill="none"
            stroke="url(#ring-metal)"
            strokeWidth="5"
          />
        </g>
      ))}
    </svg>
  );
}
