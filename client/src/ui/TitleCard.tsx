import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { TITLE_OUT_S } from "../cinematics/tower/beats";
import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";
import { useStore, type TitleCardSpec } from "../state/store";

const PHASE_NAME: Record<1 | 2 | 3, StringKey> = { 1: "phase.1", 2: "phase.2", 3: "phase.3" };
const SIGNAL: Record<1 | 2 | 3, StringKey> = { 1: "signal.1", 2: "signal.2", 3: "signal.3" };
/** Filled signal bars per phase (§F14.1: ▮▮▮ / ▮▮ / ▮); the lost bars stay as dim slots. */
const FILLED: Record<1 | 2 | 3, number> = { 1: 3, 2: 2, 3: 1 };
const BAR_COLOR: Record<1 | 2 | 3, string> = { 1: "#2EC4B6", 2: "#F5C518", 3: "#E5484D" };

const IN_S = 0.4;
const OUT_S = TITLE_OUT_S; // the crash timeline times its hand-off to CrashCard on this

const cardKey = (card: TitleCardSpec) =>
  card.kind === "phase" ? `phase-${card.phase}` : `text-${card.key}`;

// Title cards (§F14.1, §F0.4): driven by the timelines through `store.titleCard`. They slide in
// from the top (0.4 s `power3.out`), hold while the card is set (≥ 1.2 s in every timeline) and
// fade out (0.4 s) after it is cleared. Text in the viewer's language.
export function TitleCard() {
  const card = useStore((s) => s.titleCard);
  const [shown, setShown] = useState<TitleCardSpec | null>(card);
  // Keep the last card on screen while it fades out; a new card replaces it at once.
  if (card !== null && card !== shown) setShown(card);
  if (!shown) return null;
  return (
    <CardView
      key={cardKey(shown)}
      card={shown}
      leaving={card === null}
      onGone={() => setShown(null)}
    />
  );
}

function CardView({
  card,
  leaving,
  onGone,
}: {
  card: TitleCardSpec;
  leaving: boolean;
  onGone: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const gone = useRef(onGone);
  useLayoutEffect(() => {
    gone.current = onGone;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y: -90, opacity: 0 },
        { y: 0, opacity: 1, duration: IN_S, ease: "power3.out" },
      );
    });
    return () => ctx.revert();
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!leaving || !el) return;
    const ctx = gsap.context(() => {
      gsap.to(el, {
        y: -16,
        opacity: 0,
        duration: OUT_S,
        ease: "power2.in",
        onComplete: () => gone.current(),
      });
    });
    return () => ctx.revert();
  }, [leaving]);

  let title: string;
  let subs: string[];
  let bars: 1 | 2 | 3 | null = null;
  if (card.kind === "phase") {
    title = t("title.phase", { n: card.phase, name: t(PHASE_NAME[card.phase]) });
    subs = [t("title.signal", { level: t(SIGNAL[card.phase]) })];
    bars = card.phase;
  } else {
    title = t(card.key, card.params);
    subs = (card.lines ?? []).map((line) => t(line.key, line.params));
  }

  return (
    <div
      ref={ref}
      data-testid="title-card"
      data-leaving={leaving || undefined}
      className="pointer-events-none fixed inset-x-0 top-[22%] z-30 flex justify-center"
    >
      {/* SPEC-ASSUMPTION: a soft dark backdrop panel behind the card — §F14.1 gives only the
          type; without it the cream lines collide with whatever is under them (the Tower's
          manual cover title, the cream fade, bright sky in the 3D scene). */}
      <div
        data-testid="title-panel"
        className="flex max-w-[min(1100px,92vw)] flex-col items-center gap-2 rounded-[36px] bg-night/70 px-12 pt-6 pb-5 text-center shadow-[0_12px_40px_rgb(0_0_0/0.35)] backdrop-blur-[3px]"
      >
        <h2 className="font-display text-[64px] leading-none text-balance font-extrabold text-cream [-webkit-text-stroke:2px_#0B1026] [paint-order:stroke_fill] text-shadow-extrude">
          {title}
        </h2>
        {subs.map((sub, i) => (
          <p
            key={sub}
            className="flex items-center gap-3 font-display text-[28px] leading-tight font-extrabold text-cream [-webkit-text-stroke:1px_#0B1026] [paint-order:stroke_fill]"
          >
            <span>{sub}</span>
            {bars !== null && i === 0 && <SignalGlyphs phase={bars} />}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * "▮▮▮ / ▮▮ / ▮": the filled bars in the phase's signal color, the lost ones as dim slots. Drawn
 * as blocks shaped like the glyph, because Baloo 2 has no U+25AE (it fell back to tofu boxes).
 */
function SignalGlyphs({ phase }: { phase: 1 | 2 | 3 }) {
  const filled = FILLED[phase];
  return (
    // A dark pill behind the bars: phase 1's teal would vanish on the teal manual cover.
    <span
      data-testid="title-bars"
      aria-hidden="true"
      className="flex items-center gap-[0.14em] rounded-full bg-night/85 px-[0.4em] py-[0.18em]"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          data-filled={i < filled || undefined}
          className="inline-block h-[0.72em] w-[0.34em] rounded-[0.08em]"
          style={{ background: i < filled ? BAR_COLOR[phase] : "rgb(242 232 213 / 0.2)" }}
        />
      ))}
    </span>
  );
}
