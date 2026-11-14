// Client configuration (§F2, §A3) and the shared timing constants (§A14).

/** Dev tooling and dev routes are compiled in only when VITE_DEV_MODE=1 (§F18). */
export const DEV = import.meta.env.VITE_DEV_MODE === "1";

/** WebSocket base without the room code. Empty env = same origin `/ws` (proxied in dev). */
export const WS_BASE =
  import.meta.env.VITE_WS_URL ||
  (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";

/** REST + clips origin. Empty = same origin. */
export const API_BASE = import.meta.env.VITE_API_URL || "";

// §A14 timing constants (the server uses the same numbers).
export const PRESS_DEBOUNCE_MS = 1200;
export const NEXT_ACTION_DELAY_MS = 1500;
export const CINEMATIC_LEAD_MS = 300;
export const FUEL_BROADCAST_MS = 1000;
export const WRONG_PENALTY_S = 10;
export const CROSSOVER_BONUS_S = 5;
export const LOW_FUEL_S = 20;
export const RECONNECT_GRACE_S = 60;
export const MIN_UTTERANCE_MS = 300;
export const MAX_UTTERANCE_MS = 12000;
export const PREROLL_MS = 200;
export const FRAME_MS = 100;
export const TRANSCRIBE_FINAL_TIMEOUT_MS = 4000;
export const LIFELINE_WAIT_MS = 3000;
export const TRANSLATION_REVEAL_MS = 6000;
export const ECHO_MS = 3000;
export const BOT_DELAY_MS = 2000;
export const SUBTITLES_FLYER = 3;
export const SUBTITLES_TOWER = 5;
export const LIFELINE_WINDOW = 3;
