import type { DeckWord, Lang } from "../../net/protocol";
import { useT } from "../../i18n/useT";

interface Props {
  word: DeckWord;
  /** The partner's language: `word` is in it (Latin, romanized when Hindi). */
  partnerLang: Lang;
  playing: boolean;
  onPlay: (concept: string, clipUrl: string) => void;
}

// One class list for every card and every badge: the deck never codes a word by its meaning
// (§F17, §A2 rule 4). Greying a "still learning" card happens on the wrapper, not here.
const CARD =
  "relative flex h-full min-h-[136px] flex-col gap-1 rounded-2xl border-2 border-ink/10 bg-page-right px-4 pt-4 pb-4 text-ink shadow-[0_6px_0_rgb(0_0_0/0.18)]";
const BADGE =
  "inline-flex items-center rounded-full border-2 border-ink/15 bg-ink/5 px-2 py-0.5 font-display text-[15px] leading-tight font-bold text-ink/80";

/** A word-deck card (§F17): the partner-language word, its meaning in my script, badges, ▶. */
export function DeckCard({ word, partnerLang, playing, onPlay }: Props) {
  const t = useT();
  const clip = word.clip_url;
  const badges = word.learned && (word.understood >= 1 || word.spoken >= 1);
  return (
    <article data-testid="deck-card" data-concept={word.concept} className={CARD}>
      <span
        data-testid="deck-word"
        lang={partnerLang}
        className="pr-12 font-display text-[40px] leading-[1.05] font-extrabold break-words"
      >
        {word.word}
      </span>
      <span
        data-testid="deck-meaning"
        lang={word.meaning_script === "deva" ? "hi" : "en"}
        className="font-display text-[22px] leading-snug font-semibold text-ink/70"
      >
        {word.meaning}
      </span>
      {badges && (
        <span className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {word.understood >= 1 && (
            <span data-testid="deck-badge" className={BADGE}>
              {t("deck.understood", { n: word.understood })}
            </span>
          )}
          {word.spoken >= 1 && (
            <span data-testid="deck-badge" className={BADGE}>
              {t("deck.said_it")}
            </span>
          )}
        </span>
      )}
      {clip !== null && (
        <button
          type="button"
          data-testid="deck-play"
          aria-label={word.word}
          aria-pressed={playing}
          onClick={() => onPlay(word.concept, clip)}
          className="absolute top-3.5 right-3.5 grid size-11 place-items-center rounded-full bg-teal text-night shadow-[0_4px_0_#1a7f76] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_1px_0_#1a7f76] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {playing ? (
            <span aria-hidden="true" className="flex h-4 items-center gap-[3px]">
              <span className="h-full w-[4px] animate-[mouth_0.3s_ease-in-out_infinite_alternate] rounded-sm bg-night" />
              <span className="h-2/3 w-[4px] animate-[mouth_0.42s_ease-in-out_infinite_alternate] rounded-sm bg-night" />
              <span className="h-full w-[4px] animate-[mouth_0.36s_ease-in-out_infinite_alternate] rounded-sm bg-night" />
            </span>
          ) : (
            <span aria-hidden="true" className="ml-0.5 text-lg leading-none">
              ▶
            </span>
          )}
        </button>
      )}
    </article>
  );
}
