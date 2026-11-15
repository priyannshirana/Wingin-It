import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { CINEMATICS_FILE } from "../content/cinematics";
import { RECONNECT_GRACE_S } from "../config";
import { useT } from "../i18n/useT";
import { send } from "../net/socket";
import { selectDevMode } from "../state/selectors";
import { useStore } from "../state/store";
import { isTypingTarget } from "./isTypingTarget";
import { SoundChip } from "./SoundChip";
import { ToyButton } from "./ToyButton";
import { useServerNow } from "./useServerNow";

// Full-screen overlays (§F20): the flash and red wrong-action pulse (DOM, never postprocessing),
// the "Click to enable sound" chip (M3c, own file), reconnecting, paused, crash/retry and Skip.
export function Overlays() {
  const conn = useStore((s) => s.conn);
  const status = useStore((s) => s.status);
  return (
    <>
      <FlashLayer />
      <RedPulse />
      <SoundChip />
      <SkipButton />
      <CrashCard />
      {status === "PAUSED" && conn === "open" && <PausedOverlay />}
      {conn === "reconnecting" && <ReconnectingOverlay />}
    </>
  );
}

function Dim({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-night/80 backdrop-blur-sm">
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="size-14 animate-spin rounded-full border-[6px] border-cream/20 border-t-teal" />
  );
}

function ReconnectingOverlay() {
  const t = useT();
  return (
    <Dim>
      <Spinner />
      <p className="font-display text-3xl text-cream">{t("overlay.reconnecting")}</p>
    </Dim>
  );
}

function PausedOverlay() {
  const t = useT();
  const pausedAt = useStore((s) => s.game?.server_ms ?? 0);
  const now = useServerNow(250);
  const left = Math.max(0, Math.ceil(RECONNECT_GRACE_S - (now - pausedAt) / 1000));
  return (
    <Dim>
      <p className="max-w-xl text-center font-display text-3xl text-cream">{t("overlay.paused")}</p>
      <p className="font-display text-6xl font-extrabold text-lamp-yellow tabular-nums">
        {t("hud.seconds", { n: left })}
      </p>
    </Dim>
  );
}

function CrashCard() {
  const t = useT();
  const crashed = useStore((s) => s.crashed);
  const role = useStore((s) => s.me?.role);
  const voted = useStore((s) => (role ? s.retryVotes.includes(role) : false));
  const cin = useStore(
    useShallow((s) =>
      s.cinematic?.id === "crash"
        ? { start: s.cinematic.start_at_ms, duration: s.cinematic.duration_ms }
        : null,
    ),
  );
  const now = useServerNow(200, crashed);
  if (!crashed) return null;
  // §F20: the Retry card appears once the crash timeline (5 s) has played.
  const readyAt = cin ? cin.start + cin.duration : 0;
  if (now < readyAt) return null;
  return (
    <Dim>
      <h2 className="font-display text-7xl font-extrabold text-cream text-shadow-extrude">
        {t("crash.title")}
      </h2>
      {voted ? (
        <p className="font-display text-2xl text-cream/80">{t("crash.waiting")}</p>
      ) : (
        <ToyButton variant="primary" className="text-3xl" onClick={() => send({ type: "retry" })}>
          {t("crash.retry")}
        </ToyButton>
      )}
    </Dim>
  );
}

function SkipButton() {
  const t = useT();
  const playing = useStore((s) => s.cinePlaying);
  const cinematic = useStore(
    useShallow((s) => (s.cinematic ? { id: s.cinematic.id, skipped: s.cinematic.skipped } : null)),
  );
  const role = useStore((s) => s.me?.role);
  const voted = useStore((s) => (role ? s.skipVotes.includes(role) : false));
  const dev = useStore(selectDevMode);
  const skippable =
    playing &&
    cinematic !== null &&
    !cinematic.skipped &&
    CINEMATICS_FILE.cinematics[cinematic.id].skippable;

  // Hotkey K = skip (Dev Mode: the force skip) (§F14.1).
  useEffect(() => {
    if (!skippable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || e.repeat || isTypingTarget(e.target)) return;
      if (dev) send({ type: "dev", cmd: "skip_cinematic" });
      else send({ type: "skip_cinematic" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skippable, dev]);

  if (!skippable) return null;
  return (
    <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2">
      {voted ? (
        <span className="rounded-full bg-night/70 px-5 py-2 font-display text-lg text-cream/80">
          {t("cin.skip_waiting")}
        </span>
      ) : (
        <ToyButton variant="ghost" onClick={() => send({ type: "skip_cinematic" })}>
          {t("cin.skip")} ⏭
        </ToyButton>
      )}
    </div>
  );
}

type FlashStyle = CSSProperties & { "--flash-from": string };

function flashStyle(color: string, ms: number, from: number): FlashStyle {
  return {
    background: color,
    opacity: 0,
    animation: `flash-fade ${ms}ms ease-out`,
    "--flash-from": String(from),
  };
}

/** `flash(color, ms)` from the timelines: a full-screen layer fading 1 → 0 (§F10.1). */
function FlashLayer() {
  const fx = useStore((s) => s.flashFx);
  if (!fx) return null;
  return (
    <div
      key={fx.id}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60]"
      style={flashStyle(fx.color, fx.ms, fx.opacity)}
    />
  );
}

/** The 250 ms red vignette pulse on a wrong action (§F15): radial #E5484D at 0.45. */
function RedPulse() {
  const id = useStore((s) => s.redPulseId);
  if (id === 0) return null;
  return (
    <div
      key={id}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[55]"
      style={{
        background:
          "radial-gradient(ellipse at center, transparent 45%, rgb(229 72 77 / 0.45) 100%)",
        opacity: 0,
        animation: "flash-fade 250ms ease-out",
      }}
    />
  );
}
