import { useEffect, useSyncExternalStore } from "react";
import { audioUnlocked, onAudioStateChange, unlockAudio } from "../audio/sfx";
import { useT } from "../i18n/useT";
import { SpeakerIcon } from "./audio/SpeakerIcon";

const SUPPORTED = typeof AudioContext !== "undefined";

// "Click to enable sound" until the shared AudioContext runs (§F20; split-view iframes start
// without a user gesture). Also unlocks on the first click or key anywhere on the page (§F8.3).
export function SoundChip() {
  const t = useT();
  const unlocked = useSyncExternalStore(onAudioStateChange, audioUnlocked, () => true);

  useEffect(() => {
    if (!SUPPORTED || unlocked) return;
    const unlock = () => void unlockAudio();
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, [unlocked]);

  if (!SUPPORTED || unlocked) return null;
  return (
    <button
      type="button"
      data-testid="sound-chip"
      onClick={() => void unlockAudio()}
      className="fixed bottom-28 left-6 z-40 flex animate-pop items-center gap-2 rounded-full bg-lamp-yellow px-4 py-2 font-display text-lg font-extrabold text-night shadow-[0_4px_0_#b38f0c] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:outline-4 focus-visible:outline-moon"
    >
      <SpeakerIcon muted={false} />
      {t("overlay.enable_sound")}
    </button>
  );
}
