import { setMasterVolume, setMuted } from "../audio/sfx";
import { useT } from "../i18n/useT";
import { useStore } from "../state/store";
import { SENSITIVITY } from "../scene/freeLookHead";
import { SpeakerIcon } from "./audio/SpeakerIcon";

// Volume slider + mute (§F16.4): both screens, persisted in store.settings (localStorage), and
// applied to the master bus by audio/sfx. The Flyer also gets the free-look mouse sensitivity
// (§F10.3, saved in `wingin:settings`).
export function Settings() {
  const t = useT();
  const setSettings = useStore((s) => s.setSettings);
  const volume = useStore((s) => s.settings.volume);
  const muted = useStore((s) => s.settings.muted);
  const sensitivity = useStore((s) => s.settings.sensitivity);
  const flyer = useStore((s) => s.me?.role === "flyer");
  return (
    <div
      data-testid="settings"
      className="pointer-events-auto flex items-center gap-2 rounded-full bg-night/60 py-1 pr-3 pl-1 text-cream shadow-[0_3px_0_rgb(0_0_0/0.35)] backdrop-blur-sm"
    >
      <button
        type="button"
        data-testid="mute"
        aria-label={t("settings.mute")}
        title={t("settings.mute")}
        aria-pressed={muted}
        onClick={() => setMuted(!muted)}
        className={`flex size-9 items-center justify-center rounded-full transition-colors focus-visible:outline-3 focus-visible:outline-moon ${muted ? "bg-coral text-night" : "bg-white/10 hover:bg-white/20"}`}
      >
        <SpeakerIcon muted={muted} />
      </button>
      <input
        type="range"
        data-testid="volume"
        aria-label={t("settings.volume")}
        title={t("settings.volume")}
        min={0}
        max={1}
        step={0.05}
        value={volume}
        disabled={muted}
        onChange={(e) => setMasterVolume(Number(e.target.value))}
        className="h-2 w-24 cursor-pointer accent-teal disabled:cursor-not-allowed disabled:opacity-40"
      />
      {flyer && (
        <>
          <MouseIcon />
          <input
            type="range"
            data-testid="sensitivity"
            aria-label={t("settings.sensitivity")}
            title={t("settings.sensitivity")}
            min={SENSITIVITY.min}
            max={SENSITIVITY.max}
            step={0.01}
            value={sensitivity}
            onChange={(e) => setSettings({ sensitivity: Number(e.target.value) })}
            className="h-2 w-20 cursor-pointer accent-teal"
          />
        </>
      )}
    </div>
  );
}

function MouseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="ml-1 size-4 shrink-0" aria-hidden="true">
      <rect
        x="4"
        y="1.5"
        width="8"
        height="13"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M8 4v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
