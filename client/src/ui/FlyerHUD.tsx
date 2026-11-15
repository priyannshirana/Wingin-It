import { useShallow } from "zustand/react/shallow";
import { selectDemo, selectMock } from "../state/selectors";
import { useStore } from "../state/store";
import { FreeLookHint } from "./FreeLookHint";
import { FuelBar } from "./FuelBar";
import { Lifelines } from "./Lifelines";
import { MockTalkBox } from "./MockTalkBox";
import { PTTIndicator } from "./PTTIndicator";
import { QuickReplies } from "./QuickReplies";
import { Settings } from "./Settings";
import { SignalBars } from "./SignalBars";
import { Subtitles } from "./Subtitles";
import { TitleCard } from "./TitleCard";

// The Flyer HUD over the canvas (§F11). Every slot is mounted: Lifelines (M2), PTTIndicator
// (M4) and Settings (M3c) fill in their own files.
export function FlyerHUD() {
  const hasGame = useStore((s) => s.game !== null);
  const mock = useStore(selectMock);
  const demo = useStore(selectDemo);
  return (
    <div className="pointer-events-none absolute inset-0 select-none" data-testid="flyer-hud">
      {hasGame && (
        <>
          <div className="absolute top-5 left-6 rounded-2xl bg-night/45 px-4 py-2 backdrop-blur-sm">
            <SignalBars />
          </div>
          <div className="absolute top-6 left-1/2 -translate-x-1/2">
            <ProgressPips />
          </div>
          <div className="absolute top-5 right-6 w-56 rounded-2xl bg-night/45 px-4 py-2 backdrop-blur-sm">
            <FuelBar />
          </div>
        </>
      )}
      <div className="absolute bottom-6 left-1/2 w-[min(720px,50vw)] -translate-x-1/2">
        <Subtitles stack={3} fontSize={26} />
      </div>
      <FreeLookHint />
      <div className="pointer-events-auto absolute bottom-6 left-6">
        <Lifelines />
      </div>
      <div className="absolute right-6 bottom-6 flex w-80 flex-col items-end gap-2">
        {mock || demo ? (
          <>
            <QuickReplies />
            <MockTalkBox />
          </>
        ) : null}
        {!mock && <PTTIndicator />}
      </div>
      <div className="pointer-events-auto absolute top-24 right-6">
        <Settings />
      </div>
      <TitleCard />
    </div>
  );
}

/** One pip per action: done = filled teal, current = pulsing white ring, upcoming = hollow. */
function ProgressPips() {
  const { total, completed, current } = useStore(
    useShallow((s) => ({
      total: s.game?.total_actions ?? 0,
      completed: s.game?.completed ?? 0,
      current: s.game?.action_index ?? -1,
    })),
  );
  return (
    <div className="flex gap-2" data-testid="progress-pips">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          data-state={i < completed ? "done" : i === current ? "current" : "upcoming"}
          className={`size-3.5 rounded-full ${
            i < completed
              ? "animate-pop bg-teal"
              : i === current
                ? "animate-ring bg-transparent"
                : "border-2 border-white/50"
          }`}
        />
      ))}
    </div>
  );
}
