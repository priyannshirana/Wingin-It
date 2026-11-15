import { useEffect } from "react";
import { useT } from "../i18n/useT";
import { send } from "../net/socket";
import { useStore } from "../state/store";
import { isTypingTarget } from "./isTypingTarget";

/**
 * §F19 Demo mode (presenter).
 *
 * Renders the DEMO badge when in a demo room, and registers the N/P hotkeys:
 *   N → presenter next_action (complete the current action)
 *   P → presenter next_phase  (jump to the current phase's outro)
 *
 * Both keys are ignored while the user is typing (input / textarea / contenteditable)
 * and when `e.repeat` is set. The dev panel yields these keys in demo rooms; see
 * PRESENTER_KEY_CODES in hotkeys.ts.
 */
export function PresenterKeys() {
  const demo = useStore((s) => !!(s.welcome?.demo || s.room?.demo));
  const t = useT();

  useEffect(() => {
    if (!demo) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.code === "KeyN") {
        e.preventDefault();
        send({ type: "presenter", cmd: "next_action" });
      } else if (e.code === "KeyP") {
        e.preventDefault();
        send({ type: "presenter", cmd: "next_phase" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [demo]);

  if (!demo) return null;

  return (
    <div
      data-testid="demo-badge"
      aria-label={t("lobby.demo_badge")}
      className="pointer-events-none fixed top-3 right-3 z-50 select-none rounded bg-amber/90 px-2 py-0.5 font-display text-xs font-extrabold tracking-widest text-night"
    >
      {t("lobby.demo_badge")}
    </div>
  );
}
