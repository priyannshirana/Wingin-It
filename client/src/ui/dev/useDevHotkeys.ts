import { useEffect } from "react";
import { CINEMATICS_FILE } from "../../content/cinematics";
import { send } from "../../net/socket";
import { useStore, type StoreState } from "../../state/store";
import { devHotkey, isPanelToggle } from "../hotkeys";

/** Same condition as the Overlays skip button: it owns K while a skippable cinematic plays. */
function overlaySkips(s: StoreState): boolean {
  const c = s.cinematic;
  return s.cinePlaying && c !== null && !c.skipped && CINEMATICS_FILE.cinematics[c.id].skippable;
}

/** Window key listener for the dev panel (§F18.4): backtick toggles, N F 1 2 3 K while open. */
export function useDevHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (isPanelToggle(e)) {
        e.preventDefault();
        s.setSettings({ showDevPanel: !s.settings.showDevPanel });
        return;
      }
      const demo = !!(s.welcome?.demo || s.room?.demo);
      const command = devHotkey(e, s.settings.showDevPanel, overlaySkips(s), demo);
      if (!command) return;
      e.preventDefault();
      send({ type: "dev", ...command });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
