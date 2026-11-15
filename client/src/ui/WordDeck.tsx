import { useT } from "../i18n/useT";
import { selectLang } from "../state/selectors";
import { useStore } from "../state/store";
import { FlyerPortrait } from "./avatars/FlyerPortrait";
import { TowerPortrait } from "./avatars/TowerPortrait";
import { DeckGrid } from "./deck/DeckGrid";
import { DeckStats } from "./deck/DeckStats";
import { DeckVote } from "./deck/DeckVote";
import { splitAtSlot } from "./deck/format";
import { MissionReport } from "./deck/MissionReport";

/**
 * The end screen (§F17), in the viewer's own language: the partner's portrait and how many words
 * they taught me, the mission report, the word cards, the stats row and the two vote buttons.
 */
export function WordDeck() {
  const t = useT();
  const deck = useStore((s) => s.deck);
  const role = useStore((s) => s.me?.role);
  const lang = useStore(selectLang);
  if (!deck) return <main data-screen="deck" className="h-full bg-night" />;

  // The portrait is the partner's character: the Tower's controller for a Flyer and vice versa.
  const Portrait = role === "flyer" ? TowerPortrait : FlyerPortrait;
  // Use the singular form when exactly 1 word was learned (§I4 plural fix).
  const headerKey = deck.learned_count === 1 ? "deck.header_one" : "deck.header";
  const [before, after] = splitAtSlot(t(headerKey));

  return (
    <main
      data-screen="deck"
      lang={lang}
      className="flex h-full flex-col overflow-hidden bg-night bg-[radial-gradient(ellipse_at_50%_-10%,#2a3a6a_0%,#0b1026_62%)] text-cream"
    >
      <header className="mx-auto flex w-full max-w-[1280px] shrink-0 items-center gap-7 px-10 pt-8 pb-5">
        <div className="shrink-0 rounded-full p-1 ring-4 ring-teal/70">
          <Portrait gender={deck.partner_gender} state="happy" size={120} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h1
            data-testid="deck-header"
            className="font-display text-[34px] leading-tight font-extrabold text-cream"
          >
            {before}
            <span
              data-testid="deck-count"
              className="mx-1 inline-block align-[-0.08em] text-[64px] leading-none text-teal [text-shadow:0_4px_0_#1a7f76]"
            >
              {deck.learned_count}
            </span>
            {after}
          </h1>
          <MissionReport report={deck.report} pending={deck.report_pending} lang={lang} />
        </div>
      </header>

      <section
        data-testid="deck-grid"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-color:rgb(242_232_213/0.25)_transparent]"
      >
        <div className="mx-auto w-full max-w-[1280px] px-10 pt-3 pb-8">
          <DeckGrid words={deck.words} partnerLang={deck.partner_lang} />
        </div>
      </section>

      <footer className="shrink-0 border-t border-white/10 bg-night/80">
        <div className="mx-auto flex w-full max-w-[1280px] items-end justify-between gap-6 px-10 pt-4 pb-5">
          <DeckStats stats={deck.stats} />
          <DeckVote />
        </div>
      </footer>
    </main>
  );
}
