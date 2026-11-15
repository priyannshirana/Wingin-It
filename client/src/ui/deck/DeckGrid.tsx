import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { useT } from "../../i18n/useT";
import type { DeckWord, Lang } from "../../net/protocol";
import { DeckCard } from "./DeckCard";
import { splitWords } from "./format";
import { useClipPlayer } from "./useClipPlayer";

interface Props {
  words: readonly DeckWord[];
  partnerLang: Lang;
}

/** 4 columns at 1440 px, 3 at 1280 px (§F17). */
const GRID = "grid grid-cols-2 gap-4 min-[1024px]:grid-cols-3 min-[1400px]:grid-cols-4";

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The card grid (§F17): learned words first, then the `deck.still_learning` divider and the rest
 * at 40% opacity without badges. Cards deal in one by one (40 ms stagger, `back.out`, §F0.4).
 */
export function DeckGrid({ words, partnerLang }: Props) {
  const t = useT();
  const { learned, learning } = splitWords(words);
  const { playing, toggle } = useClipPlayer();
  const rootRef = useRef<HTMLDivElement>(null);
  const dealKey = words.map((w) => w.concept).join(",");

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-deal]", {
        y: 36,
        rotation: -4,
        scale: 0.86,
        autoAlpha: 0,
        duration: 0.25,
        ease: "back.out(1.7)",
        stagger: 0.04,
        clearProps: "transform,opacity,visibility",
      });
    }, root);
    return () => ctx.revert();
  }, [dealKey]);

  const card = (w: DeckWord) => (
    <li key={w.concept} data-testid="deck-slot" data-learned={w.learned}>
      <div data-deal="" className={`h-full ${w.learned ? "" : "opacity-40"}`}>
        <DeckCard
          word={w}
          partnerLang={partnerLang}
          playing={playing === w.concept}
          onPlay={toggle}
        />
      </div>
    </li>
  );

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      {learned.length > 0 && <ul className={GRID}>{learned.map(card)}</ul>}
      {learning.length > 0 && (
        <>
          <h2
            data-testid="deck-divider"
            className="flex items-center gap-4 font-display text-lg font-extrabold text-cream/55"
          >
            <span className="h-0.5 flex-1 rounded-full bg-cream/15" />
            {t("deck.still_learning")}
            <span className="h-0.5 flex-1 rounded-full bg-cream/15" />
          </h2>
          <ul className={GRID}>{learning.map(card)}</ul>
        </>
      )}
    </div>
  );
}
