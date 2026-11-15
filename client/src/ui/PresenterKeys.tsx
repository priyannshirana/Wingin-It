import { useEffect } from "react";
import { useT } from "../i18n/useT";
import { send } from "../net/socket";
import { useStore } from "../state/store";
import { DemoBadge } from "./DemoBadge";
import { isTypingTarget } from "./isTypingTarget";

/**
 * §F19 Demo mode (presenter).
 *
 * Renders the DEMO badge when in a demo room (fixed bottom-left, clear of the Flyer fuel bar
 * at top-right, signal bars at top-left, and the mock talk-box at bottom-right), and registers
 * the N/P hotkeys:
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
    // Bottom-left: clear of fuel bar (top-right), signal bars (top-left), PTT/talk-box (bottom-right)
    // and subtitles (bottom-center). pointer-events-none so it doesn't eat clicks.
    <div
      data-testid="demo-badge"
      className="pointer-events-none fixed bottom-3 left-3 z-50 select-none"
    >
      <DemoBadge label={t("lobby.demo_badge")} />
    </div>
  );
}
