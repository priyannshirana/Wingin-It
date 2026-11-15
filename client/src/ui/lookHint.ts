// Free-look HUD hint rules (§F10.3).
import type { StringKey } from "../i18n/strings";
import type { LookMode } from "../state/store";

/** The hint fades after the first 3 uses of each mode (§F10.3); `enter` always shows. */
export const HINT_USES = 3;

export const HINT_KEY: Record<Exclude<LookMode, "off">, StringKey> = {
  enter: "look.hint_enter",
  look: "look.hint_look",
  interact: "look.hint_interact",
};

/** The free-look hint text for a mode, or null when it has faded / does not apply. */
export function hintKeyFor(
  mode: LookMode,
  uses: { look: number; interact: number },
): StringKey | null {
  if (mode === "off") return null;
  if (mode === "enter") return HINT_KEY.enter;
  return uses[mode] <= HINT_USES ? HINT_KEY[mode] : null;
}
