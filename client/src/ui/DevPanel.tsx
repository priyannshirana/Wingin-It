import { selectDevMode } from "../state/selectors";
import { useStore } from "../state/store";
import { DevCommands } from "./dev/DevCommands";
import { ExposureTable } from "./dev/ExposureTable";
import { DEV_LABELS as L } from "./dev/labels";
import { LastUtterance } from "./dev/LastUtterance";
import { LatencySparkline } from "./dev/LatencySparkline";
import { LiveState } from "./dev/LiveState";
import { useDevHotkeys } from "./dev/useDevHotkeys";

// The backtick dev drawer (§F18.4): a 400 px dark monospace panel on the right rendering
// `store.dev` (`dev_state`, §A13). Mounted only in VITE_DEV_MODE builds (Room.tsx); its hotkeys
// (N F 1 2 3 K) work only while it is open and nothing editable has focus.
export function DevPanel() {
  useDevHotkeys();
  const open = useStore((s) => s.settings.showDevPanel);
  const state = useStore((s) => s.dev);
  const serverDev = useStore(selectDevMode);
  const myId = useStore((s) => s.me?.id ?? null);
  const setSettings = useStore((s) => s.setSettings);
  if (!open) return null;
  return (
    <aside
      data-testid="dev-panel"
      className="fixed top-0 right-0 z-[70] flex h-full w-[400px] flex-col overflow-y-auto border-l border-white/10 bg-[#0d0f14]/95 font-mono text-[12px] leading-[1.45] text-white/90 shadow-[-12px_0_32px_rgba(0,0,0,0.45)] backdrop-blur-sm"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0d0f14] px-4 py-2">
        <span className="font-bold tracking-[0.3em] text-teal">{L.title}</span>
        <button
          type="button"
          aria-label={L.close}
          onClick={() => setSettings({ showDevPanel: false })}
          className="cursor-pointer rounded px-2 text-white/60 hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </header>
      <div className="flex flex-col gap-4 p-4">
        {!serverDev && <p className="text-lamp-yellow">{L.serverDevOff}</p>}
        <DevCommands state={state} />
        {state === null ? (
          <p className="text-white/50">{L.noState}</p>
        ) : (
          <>
            <LiveState dev={state} />
            <LastUtterance last={state.last_utterance} />
            <LatencySparkline values={state.latencies_ms} />
            <ExposureTable exposure={state.exposure} myId={myId} />
          </>
        )}
      </div>
    </aside>
  );
}
