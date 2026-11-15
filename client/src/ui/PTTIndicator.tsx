import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { canTalk, installPttKeys, pttEnd, pttStart } from "../audio/ptt";
import { useMicMeter } from "../audio/useMicMeter";
import { useT } from "../i18n/useT";
import { otherRole, selectGenderOf } from "../state/selectors";
import { useStore } from "../state/store";
import { LevelMeter } from "./audio/LevelMeter";
import { MicIcon } from "./audio/MicIcon";
import { FlyerPortrait } from "./avatars/FlyerPortrait";
import { TowerPortrait } from "./avatars/TowerPortrait";

export type PttView = "idle" | "transmitting" | "busy";

// Push-to-talk (§F11, §F12.4, §F16.3), real rooms only: hold SPACE or the on-screen button.
// idle = mic + hint; transmitting = red pulsing ring + tiny level meter; busy = amber with the
// partner's portrait (talking) and `ptt.busy_<partner>` in the partner's gender.
export function PTTIndicator() {
  const t = useT();
  const me = useStore(useShallow((s) => (s.me ? { role: s.me.role, gender: s.me.gender } : null)));
  const channel = useStore((s) => s.channel);
  const transmitting = useStore((s) => s.mic.transmitting);
  const allowed = useStore(canTalk);
  const partnerRole = me ? otherRole(me.role) : "tower";
  const partnerGender = useStore((s) => selectGenderOf(s, partnerRole)) ?? "male";
  const { level } = useMicMeter(transmitting);

  useEffect(() => installPttKeys(), []);

  if (!me) return null;
  const view: PttView = transmitting
    ? "transmitting"
    : channel !== null && channel !== me.role
      ? "busy"
      : "idle";
  const Portrait = partnerRole === "flyer" ? FlyerPortrait : TowerPortrait;
  const label =
    view === "transmitting"
      ? t("ptt.transmitting", undefined, me.gender)
      : view === "busy"
        ? t(partnerRole === "flyer" ? "ptt.busy_flyer" : "ptt.busy_tower", undefined, partnerGender)
        : t("ptt.idle");

  const ring =
    view === "transmitting"
      ? "bg-lamp-red text-cream ring-4 ring-lamp-red/40"
      : view === "busy"
        ? "bg-lamp-yellow/25 text-lamp-yellow ring-4 ring-lamp-yellow/50"
        : "bg-teal text-night shadow-[0_5px_0_#1a7f76] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#1a7f76]";

  return (
    <div
      data-testid="ptt"
      data-state={view}
      className={`pointer-events-auto flex w-full items-center gap-3 rounded-3xl px-3 py-2.5 backdrop-blur-sm transition-colors ${
        view === "busy" ? "bg-lamp-yellow/15 ring-2 ring-lamp-yellow/60" : "bg-night/60"
      }`}
    >
      <div className="relative shrink-0">
        {view === "transmitting" && (
          <span className="absolute inset-0 animate-ping rounded-full bg-lamp-red/50" />
        )}
        {view === "busy" ? (
          <span className="flex size-16 items-center justify-center rounded-full bg-lamp-yellow/25 ring-4 ring-lamp-yellow/60">
            <Portrait gender={partnerGender} size={56} state="talking" />
          </span>
        ) : (
          <button
            type="button"
            data-testid="ptt-button"
            aria-label={t("ptt.button")}
            title={t("ptt.button")}
            disabled={!allowed && !transmitting}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              pttStart("pointer");
            }}
            onPointerUp={() => pttEnd("pointer")}
            onPointerLeave={() => pttEnd("pointer")}
            onPointerCancel={() => pttEnd("pointer")}
            onContextMenu={(e) => e.preventDefault()}
            className={`relative flex size-16 touch-none items-center justify-center rounded-full transition-[transform,box-shadow,background-color] duration-100 select-none focus-visible:outline-4 focus-visible:outline-moon disabled:cursor-not-allowed disabled:opacity-40 ${ring}`}
          >
            <MicIcon size={30} />
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span
          className={`font-display text-lg leading-tight font-extrabold ${
            view === "transmitting"
              ? "text-lamp-red"
              : view === "busy"
                ? "text-lamp-yellow"
                : "text-cream"
          }`}
        >
          {label}
        </span>
        {view === "transmitting" ? (
          <LevelMeter level={level} bars={8} height={16} />
        ) : (
          view === "idle" && (
            <span className="font-display text-sm text-cream/55">{t("ptt.button")}</span>
          )
        )}
      </div>
    </div>
  );
}
