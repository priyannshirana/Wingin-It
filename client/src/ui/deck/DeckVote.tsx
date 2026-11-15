import { useState } from "react";
import { useT } from "../../i18n/useT";
import { send } from "../../net/socket";
import { useStore } from "../../state/store";
import { ToyButton } from "../ToyButton";

type Vote = "play_again" | "swap_roles";

const PRESSED = "translate-y-1 ring-4 ring-moon/70 hover:translate-y-1";

/**
 * Play again / Swap roles (§F17, §B8.5). After a press, `deck.waiting_vote` shows until the
 * server moves the room on (PROLOGUE or LOBBY unmounts the deck, which resets this state).
 */
export function DeckVote() {
  const t = useT();
  const [localVote, setVote] = useState<Vote | null>(null);
  // After a refresh or rejoin in DECK, restore a play_again vote from room_state. A swap_roles
  // vote can't be restored: Part A has no field for it, so that button starts unpressed again.
  const votedPlayAgain = useStore((s) =>
    s.me ? (s.room?.play_again_votes.includes(s.me.role) ?? false) : false,
  );
  const vote: Vote | null = localVote ?? (votedPlayAgain ? "play_again" : null);
  const cast = (v: Vote) => {
    if (vote === v) return;
    send({ type: v });
    setVote(v);
  };
  // The button not chosen stays pressable after voting, so a player can follow a partner who
  // picked the other option; the server keeps one current vote per player (§B8.5).
  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex gap-3">
        <ToyButton
          variant="primary"
          data-testid="deck-play-again"
          aria-pressed={vote === "play_again"}
          className={vote === "play_again" ? PRESSED : ""}
          onClick={() => cast("play_again")}
        >
          {t("deck.play_again")}
        </ToyButton>
        <ToyButton
          data-testid="deck-swap-roles"
          aria-pressed={vote === "swap_roles"}
          className={vote === "swap_roles" ? PRESSED : ""}
          onClick={() => cast("swap_roles")}
        >
          {t("deck.swap_roles")}
        </ToyButton>
      </div>
      <p
        data-testid="deck-waiting"
        aria-live="polite"
        className={`min-h-[1.5em] font-display text-lg font-bold text-cream/75 ${vote ? "animate-slide-up" : "invisible"}`}
      >
        {vote ? t("deck.waiting_vote") : ""}
      </p>
    </div>
  );
}
