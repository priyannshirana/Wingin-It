import { useWorldAudio } from "../audio/useWorldAudio";
import { useT } from "../i18n/useT";
import { useCinematicRunner } from "../cinematics/runner";
import { buildFlyerTimeline } from "../cinematics/timelines";
import { CockpitCanvas } from "../scene/CockpitCanvas";
import { FlyerFeedback } from "./FlyerFeedback";
import { FlyerHUD } from "./FlyerHUD";
import { CineFade } from "./CineFade";
import { FxOverlays } from "./FxOverlays";

function hasWebGL2(): boolean {
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

const WEBGL2 = typeof document !== "undefined" && hasWebGL2();

// The Flyer's screen (§F1.2): the 3D cockpit + the HUD. Never shows the manual.
export function FlyerScreen() {
  const t = useT();
  useCinematicRunner(buildFlyerTimeline);
  useWorldAudio("flyer");
  if (!WEBGL2) {
    return (
      <main className="flex h-full items-center justify-center bg-night p-10 text-center font-display text-3xl text-cream">
        {t("overlay.unsupported")}
      </main>
    );
  }
  return (
    <main data-screen="flyer" className="relative h-full overflow-hidden bg-night">
      <CockpitCanvas freeLook />
      <CineFade />
      <FlyerHUD />
      <FxOverlays />
      <FlyerFeedback />
    </main>
  );
}
