// Phase 3 lifeline rules on the client (§F13). The server stays the judge (it answers with
// `translation` or an error); these only decide what the UI offers and when to send.
import { LIFELINE_WAIT_MS, LIFELINE_WINDOW } from "../../config";
import { send } from "../../net/socket";
import { useStore, type StoreState } from "../../state/store";

// SPEC-ASSUMPTION: a pending decode with no answer after LIFELINE_WAIT_MS + 2 s (a lost
// message) stops spinning and the line becomes decodable again — the store has no action to
// clear one pending entry, and a spinner that never stops is the worst outcome on stage.
export const PENDING_CAP_MS = LIFELINE_WAIT_MS + 2000;

/** Ids of the partner's last `LIFELINE_WINDOW` lines (the only ones a lifeline may target). */
export function partnerWindowIds(s: StoreState): string[] {
  const role = s.me?.role;
  if (!role) return [];
  return s.subtitles
    .filter((u) => u.speaker_role !== role)
    .slice(-LIFELINE_WINDOW)
    .map((u) => u.id);
}

/**
 * Decodable = lifelines are on this phase, the server marked the line `lifeline_available`, it
 * is one of the partner's last 3, and it isn't already revealed or being decoded. The number of
 * lifelines left is NOT part of it: with 0 left a click still answers with `toast.no_lifelines`.
 */
export function isDecodable(s: StoreState, id: string, stalePending = false): boolean {
  // �F14.1: no lifelines during any cinematic or event (input_locked), even inside PLAYING.
  if (s.game?.lifelines_enabled !== true || s.game.input_locked) return false;
  const item = s.subtitles.find((u) => u.id === id);
  if (!item?.lifeline_available) return false;
  if (!partnerWindowIds(s).includes(id)) return false;
  const tr = s.translations[id];
  return tr === undefined || (tr.pending && stalePending);
}

/** When each utterance last had a lifeline sent: a double-click (or a quick second click on a
 * stale retry) never spends twice while the first request is still pending. A failed decode
 * (`translation_failed` clears the pending entry) can be retried at once. */
const sentAt = new Map<string, number>();

/** A click on a subtitle: spend a lifeline on it, or explain why not. */
export function requestLifeline(id: string, stalePending = false): void {
  const s = useStore.getState();
  const role = s.me?.role;
  if (!role || !s.game || !isDecodable(s, id, stalePending)) return;
  const last = sentAt.get(id);
  const inFlight = s.translations[id]?.pending === true;
  if (inFlight && last !== undefined && Date.now() - last < PENDING_CAP_MS) return;
  if (s.game.lifelines[role] <= 0) {
    s.pushToast("toast.no_lifelines", {}, "warning");
    return;
  }
  sentAt.set(id, Date.now());
  s.markLifelinePending(id);
  send({ type: "lifeline", utterance_id: id });
}
