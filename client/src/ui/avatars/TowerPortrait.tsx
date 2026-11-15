import type { Gender } from "../../net/protocol";
import type { PortraitState } from "./FlyerPortrait";

interface Props {
  gender: Gender;
  state?: PortraitState;
  size?: number;
  className?: string;
}

const SKIN = "#C68642";
const INK = "#1F1F1F";

// 2D toy bust of the air-traffic controller (§F9.8): headset with mic boom, navy vest with a teal
// "ATC" badge; male = short dark hair, female = low bun. No mustache (never the captain).
export function TowerPortrait({ gender, state = "idle", size = 96, className }: Props) {
  const male = gender === "male";
  const hair = "#2B1D16";
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      data-portrait={`tower-${gender}`}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="48" fill="#1E3A2F" />
      <path d="M14 100 C16 74 30 66 50 66 C70 66 84 74 86 100 Z" fill="#1F2A44" />
      <path d="M40 66 L50 78 L60 66" fill="#F2E8D5" />
      <rect x="60" y="80" width="16" height="9" rx="2" fill="#2EC4B6" />
      <rect x="44" y="56" width="12" height="12" rx="4" fill={SKIN} />
      {!male && <circle cx="70" cy="50" r="9" fill={hair} />}
      <circle cx="50" cy="42" r="21" fill={SKIN} />
      {male ? (
        <path
          d="M29 40 C28 22 40 17 50 17 C62 17 73 22 71 40 C66 30 58 27 50 27 C42 27 34 30 29 40 Z"
          fill={hair}
        />
      ) : (
        <path
          d="M28 46 C24 22 40 16 50 16 C62 16 77 22 72 46 C68 30 60 26 50 26 C40 26 32 30 28 46 Z"
          fill={hair}
        />
      )}
      <path d="M27 42 C27 14 73 14 73 42" stroke="#3D4352" strokeWidth="4" fill="none" />
      <rect x="22" y="36" width="9" height="14" rx="4" fill="#3D4352" />
      <rect x="69" y="36" width="9" height="14" rx="4" fill="#3D4352" />
      <path
        d="M27 48 Q30 60 44 58"
        stroke="#3D4352"
        strokeWidth="2.5"
        fill="none"
        className={state === "talking" ? "animate-boom" : undefined}
      />
      <circle cx="44.5" cy="58" r="2.8" fill={state === "talking" ? "#E5484D" : "#3D4352"} />
      <circle cx="42" cy="42" r="2.6" fill={INK} />
      <circle cx="58" cy="42" r="2.6" fill={INK} />
      {state === "talking" ? (
        <ellipse cx="52" cy="52" rx="4" ry="3" fill={INK} className="mouth-origin animate-mouth" />
      ) : (
        <path
          d={state === "happy" ? "M43 50 Q51 59 59 50" : "M45 51 Q51 55 57 51"}
          stroke={INK}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
