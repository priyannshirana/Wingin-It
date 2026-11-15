import { useT } from "../i18n/useT";
import { useStore } from "../state/store";
import { HINT_KEY, hintKeyFor } from "./lookHint";

// Small, bottom-left over the cockpit (§F10.3), in the viewer's language. A faded hint keeps its
// mode's text at opacity 0 so the words never vanish before the fade does.
export function FreeLookHint() {
  const t = useT();
  const mode = useStore((s) => s.look.mode);
  const uses = useStore((s) => s.look.uses);
  const key = hintKeyFor(mode, uses);
  return (
    <div
      data-testid="free-look-hint"
      data-mode={mode}
      aria-live="polite"
      className={`pointer-events-none absolute bottom-24 left-6 rounded-full bg-night/60 px-4 py-1.5 font-display text-sm text-cream/90 backdrop-blur-sm transition-opacity duration-200 ease-out ${key ? "opacity-100" : "opacity-0"}`}
    >
      {mode === "off" ? null : t(HINT_KEY[mode])}
    </div>
  );
}
