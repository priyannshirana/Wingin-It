import { useState } from "react";
import { useT } from "../i18n/useT";
import { send } from "../net/socket";
import { useStore } from "../state/store";
import { TowerPortrait } from "./avatars/TowerPortrait";
import { FlyerPortrait } from "./avatars/FlyerPortrait";
import { ToyButton } from "./ToyButton";

// M1 minimum of the end screen (§F17) so a game can be finished and replayed: the header, the
// words, Play again / Swap roles. M5 builds the full deck (report, stats, clips, dealing).
export function WordDeck() {
  const t = useT();
  const deck = useStore((s) => s.deck);
  const role = useStore((s) => s.me?.role);
  const [voted, setVoted] = useState(false);
  if (!deck) return <main data-screen="deck" className="h-full bg-cream" />;
  const Portrait = role === "flyer" ? TowerPortrait : FlyerPortrait;
  const words = [...deck.words].sort((a, b) => Number(b.learned) - Number(a.learned));
  return (
    <main
      data-screen="deck"
      className="flex h-full flex-col items-center gap-8 overflow-auto bg-cream p-10 text-ink"
    >
      <header className="flex items-center gap-6">
        <Portrait gender={deck.partner_gender} state="happy" size={120} />
        <h1 className="font-display text-4xl font-extrabold">
          {t("deck.header", { n: deck.learned_count })}
        </h1>
      </header>
      <ul className="grid grid-cols-4 gap-4">
        {words.map((w) => (
          <li
            key={w.concept}
            className={`flex flex-col gap-1 rounded-2xl bg-page-right p-4 shadow ${w.learned ? "" : "opacity-40"}`}
          >
            <span className="font-display text-[40px] leading-none font-extrabold">{w.word}</span>
            <span className="font-display text-lg">{w.meaning}</span>
          </li>
        ))}
      </ul>
      {voted ? (
        <p className="font-display text-xl">{t("deck.waiting_vote")}</p>
      ) : (
        <div className="flex gap-4">
          <ToyButton
            variant="primary"
            onClick={() => {
              send({ type: "play_again" });
              setVoted(true);
            }}
          >
            {t("deck.play_again")}
          </ToyButton>
          <ToyButton
            onClick={() => {
              send({ type: "swap_roles" });
              setVoted(true);
            }}
          >
            {t("deck.swap_roles")}
          </ToyButton>
        </div>
      )}
    </main>
  );
}
