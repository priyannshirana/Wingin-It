import { useEffect, useState } from "react";
import { initMic } from "../audio/mic";
import { useMicMeter } from "../audio/useMicMeter";
import { useT } from "../i18n/useT";
import { useStore } from "../state/store";
import { LevelMeter } from "./audio/LevelMeter";
import { MicIcon } from "./audio/MicIcon";
import { ToyButton } from "./ToyButton";

// The lobby mic check (§F8.3), real rooms only: "Allow microphone" → a live 12-bar meter with
// "Say something to test your mic" → "Mic works!" once the level holds above 0.15 for 300 ms.
// Denied → `lobby.mic_denied`. This component only shows the state (`store.mic.permission`);
// Lobby.tsx reads the same permission to disable Ready in real rooms.
export function MicCheck() {
  const t = useT();
  const permission = useStore((s) => s.mic.permission);
  const [asking, setAsking] = useState(false);
  const granted = permission === "granted";
  const { level, heard } = useMicMeter(granted);

  // A mic the site may already use starts without a prompt (on the page's first gesture, so the
  // shared AudioContext may start); a blocked one shows the fix-it text before any click.
  useEffect(() => {
    if (permission !== "unknown" || !navigator.permissions?.query) return;
    let live = true;
    const onGesture = () => {
      removeGesture();
      if (live) void initMic();
    };
    const removeGesture = () => {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    };
    navigator.permissions
      .query({ name: "microphone" })
      .then((status) => {
        if (!live) return;
        if (status.state === "denied") {
          useStore.getState().setMic({ permission: "denied" });
        } else if (status.state === "granted") {
          if (navigator.userActivation?.hasBeenActive) void initMic();
          else {
            window.addEventListener("pointerdown", onGesture, true);
            window.addEventListener("keydown", onGesture, true);
          }
        }
      })
      .catch(() => {
        // the Permissions API doesn't know "microphone" here: wait for the click
      });
    return () => {
      live = false;
      removeGesture();
    };
  }, [permission]);

  if (permission === "denied") {
    return (
      <div
        data-testid="mic-check"
        data-state="denied"
        className="flex items-center gap-3 rounded-2xl bg-lamp-red/15 px-4 py-3 ring-2 ring-lamp-red/60"
      >
        <span className="relative text-lamp-red">
          <MicIcon size={30} />
          <span className="absolute top-1/2 left-1/2 h-[3px] w-9 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-lamp-red" />
        </span>
        <p className="max-w-md text-left font-display text-lg leading-snug text-cream">
          {t("lobby.mic_denied")}
        </p>
      </div>
    );
  }

  if (!granted) {
    return (
      <div data-testid="mic-check" data-state="ask">
        <ToyButton
          variant="primary"
          data-testid="mic-allow"
          disabled={asking}
          onClick={() => {
            setAsking(true);
            void initMic().finally(() => setAsking(false));
          }}
          className="flex items-center gap-2"
        >
          <MicIcon size={24} />
          {t("lobby.mic_allow")}
        </ToyButton>
      </div>
    );
  }

  return (
    <div
      data-testid="mic-check"
      data-state={heard ? "ok" : "listening"}
      className={`flex items-center gap-4 rounded-2xl px-4 py-3 transition-colors ${heard ? "bg-lamp-green/15 ring-2 ring-lamp-green/70" : "bg-night/50 ring-2 ring-white/10"}`}
    >
      <span className={heard ? "text-lamp-green" : "text-cream/80"}>
        <MicIcon size={28} />
      </span>
      <LevelMeter level={level} bars={12} height={30} />
      <span
        className={`font-display text-lg font-extrabold ${heard ? "text-lamp-green" : "text-cream/80"}`}
      >
        {heard ? `✓ ${t("lobby.mic_ok")}` : t("lobby.mic_test")}
      </span>
    </div>
  );
}
