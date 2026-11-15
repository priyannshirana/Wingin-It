import { useEffect, useState } from "react";
import { useWorldAudio } from "../audio/useWorldAudio";
import { useCinematicRunner } from "../cinematics/runner";
import { buildTowerTimeline } from "../cinematics/towerTimelines";
import type { PhaseNo } from "../net/protocol";
import { selectDemo, selectMock } from "../state/selectors";
import { useStore } from "../state/store";
import { TowerPortrait } from "./avatars/TowerPortrait";
import { FuelBar } from "./FuelBar";
import { FxOverlays } from "./FxOverlays";
import { Lifelines } from "./Lifelines";
import { ManualCard } from "./ManualCard";
import { ManualCover } from "./manual/ManualCover";
import { MockTalkBox } from "./MockTalkBox";
import { PTTIndicator } from "./PTTIndicator";
import { Radar } from "./Radar";
import { Settings } from "./Settings";
import { SignalBars } from "./SignalBars";
import { Subtitles } from "./Subtitles";
import { TitleCard } from "./TitleCard";
import { TowerCueLayer } from "./tower/TowerCueLayer";
import { TowerWindowHost } from "./tower/TowerWindowHost";
import { TowerFeedback } from "./TowerFeedback";

// Columns are 22 / 58 / 20 %: the open-book manual's two equal pages need the wider center (§F12.3).
const NEXT_PHASE: Record<0 | PhaseNo, PhaseNo> = { 0: 1, 1: 2, 2: 3, 3: 3 };
const MIN_W = 1280;
const MIN_H = 720;

/** Below 1280 × 720 the whole layout scales down (§F12). */
function useFitScale(): number {
  const read = () => Math.min(1, window.innerWidth / MIN_W, window.innerHeight / MIN_H);
  const [scale, setScale] = useState(read);
  useEffect(() => {
    const onResize = () => setScale(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return scale;
}

// The Tower's 2D screen (§F12). Never mounts the cockpit canvas or shows Flyer secrets.
// Every slot is mounted; the cinematic stamps / banners / shake land through store cues (M3b).
export function TowerScreen() {
  useCinematicRunner(buildTowerTimeline);
  useWorldAudio("tower");
  const scale = useFitScale();
  const card = useStore((s) => s.card);
  const status = useStore((s) => s.status);
  const phase = useStore((s) => s.game?.phase ?? 0);
  const gender = useStore((s) => s.me?.gender ?? "male");
  const transmitting = useStore((s) => s.mic.transmitting);
  const mock = useStore(selectMock);
  const demo = useStore(selectDemo);
  const upcoming: PhaseNo = status === "PHASE_OUTRO" ? NEXT_PHASE[phase] : phase === 0 ? 1 : phase;

  const w = scale < 1 ? `${100 / scale}%` : "100%";
  const h = scale < 1 ? `${100 / scale}%` : "100%";
  return (
    <main data-screen="tower" className="relative h-full overflow-hidden bg-desk">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
        aria-hidden="true"
      >
        <filter id="desk-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#desk-noise)" />
      </svg>
      <div
        className="relative flex origin-top-left gap-6 p-6"
        style={{ width: w, height: h, transform: scale < 1 ? `scale(${scale})` : undefined }}
      >
        <aside className="flex w-[22%] flex-col items-center gap-5 pt-4">
          <Radar />
          <div className="flex w-full max-w-[320px] flex-col gap-4">
            <FuelBar />
            <SignalBars />
          </div>
        </aside>
        <section className="relative flex w-[58%] items-center justify-center">
          <Mug />
          {card ? <ManualCard card={card} /> : <ManualCover upcoming={upcoming} />}
        </section>
        <aside className="flex w-[20%] flex-col gap-4">
          <div className="flex items-start justify-between">
            <Settings />
            <TowerPortrait gender={gender} size={96} state={transmitting ? "talking" : "idle"} />
          </div>
          <div className="flex flex-1 flex-col justify-end">
            <Subtitles stack={5} fontSize={20} />
          </div>
          <Lifelines />
          {(mock || demo) && <MockTalkBox />}
          {!mock && <PTTIndicator />}
        </aside>
      </div>
      <TowerWindowHost />
      <TitleCard />
      <TowerCueLayer />
      <FxOverlays />
      <TowerFeedback />
    </main>
  );
}

/** Desk decoration: a coffee mug with a steam wisp. */
function Mug() {
  return (
    <svg viewBox="0 0 80 90" className="absolute -top-2 left-0 w-16 opacity-90" aria-hidden="true">
      <path d="M30 20 C 24 12 36 8 30 0" stroke="#F2E8D5" strokeWidth="3" fill="none" opacity="0.5">
        <animate attributeName="opacity" values="0.1;0.6;0.1" dur="3s" repeatCount="indefinite" />
      </path>
      <rect x="10" y="26" width="44" height="54" rx="8" fill="#E07A5F" />
      <path d="M54 38 C 72 38 72 64 54 64" stroke="#E07A5F" strokeWidth="7" fill="none" />
      <ellipse cx="32" cy="28" rx="20" ry="5" fill="#4A2E1F" />
    </svg>
  );
}
