// Narrow derived reads over the store. Hooks return primitives or stable references.
import type { Gender, Lang, PlayerPublic, Role } from "../net/protocol";
import type { StoreState } from "./store";

export const otherRole = (role: Role): Role => (role === "flyer" ? "tower" : "flyer");

/** The viewer's language: their player language once joined, else the home-page UI language. */
export const selectLang = (s: StoreState): Lang => s.me?.lang ?? s.uiLang;

export const selectPlayer = (s: StoreState, role: Role): PlayerPublic | undefined =>
  s.room?.players.find((p) => p.role === role);

export const selectPartner = (s: StoreState): PlayerPublic | undefined =>
  s.me ? selectPlayer(s, otherRole(s.me.role)) : undefined;

export const selectGenderOf = (s: StoreState, role: Role): Gender | undefined =>
  s.me?.role === role ? s.me.gender : selectPlayer(s, role)?.gender;

/** Mock rooms replace push-to-talk with the text box (§F16.3). */
export const selectMock = (s: StoreState): boolean =>
  s.welcome?.mock_speech === true || s.room?.mock_speech === true;

/** Voice rooms forward the partner's live audio (binary frames) besides the subtitles. */
export const selectVoice = (s: StoreState): boolean =>
  s.welcome?.voice === true || s.room?.voice === true;

export const selectDemo = (s: StoreState): boolean =>
  s.welcome?.demo === true || s.room?.demo === true || s.game?.demo === true;

export const selectDevMode = (s: StoreState): boolean => s.welcome?.dev_mode === true;

/** §F9.5: clickable = in the server's interactive list AND input isn't locked. */
export const selectInteractive = (s: StoreState, id: string): boolean =>
  s.flyer.interactive.has(id) && s.game?.input_locked !== true;
