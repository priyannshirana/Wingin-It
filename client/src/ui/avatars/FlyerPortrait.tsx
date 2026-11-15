import type { Gender } from "../../net/protocol";

export type PortraitState = "idle" | "talking" | "happy";

interface Props {
  gender: Gender;
  state?: PortraitState;
  size?: number;
  className?: string;
}

const SKIN = "#E0AC69";
const INK = "#1F1F1F";

// 2D toy bust of the Flyer's character (§F9.8). M1 placeholder art in the spec colors:
// male = brown tousled hair, teal hoodie, round glasses; female = dark ponytail, coral bomber,
// earrings. M3a refines it to match the 3D model.
export function FlyerPortrait({ gender, state = "idle", size = 96, className }: Props) {
  const male = gender === "male";
  const outfit = male ? "#2EC4B6" : "#E07A5F";
  const hair = male ? "#3B2A20" : "#2B1D16";
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      data-portrait={`flyer-${gender}`}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="48" fill="#2A3A6A" />
      {!male && <ellipse cx="78" cy="30" rx="9" ry="16" fill={hair} transform="rotate(25 78 30)" />}
      <path d="M14 100 C16 74 30 66 50 66 C70 66 84 74 86 100 Z" fill={outfit} />
      {male ? (
        <path d="M30 70 Q50 82 70 70" stroke="#7EE0D6" strokeWidth="5" fill="none" />
      ) : (
        <path d="M38 66 L50 80 L62 66" stroke="#F2E8D5" strokeWidth="4" fill="none" />
      )}
      <rect x="44" y="56" width="12" height="12" rx="4" fill={SKIN} />
      <circle cx="50" cy="42" r="21" fill={SKIN} />
      {male ? (
        <g fill={hair}>
          <ellipse cx="38" cy="26" rx="11" ry="7" />
          <ellipse cx="50" cy="22" rx="12" ry="7" />
          <ellipse cx="62" cy="26" rx="11" ry="7" />
          <ellipse cx="30" cy="34" rx="5" ry="8" />
          <ellipse cx="70" cy="34" rx="5" ry="8" />
        </g>
      ) : (
        <g fill={hair}>
          <path d="M28 44 C26 22 40 16 50 16 C62 16 75 22 72 44 C66 32 58 28 50 28 C42 28 34 32 28 44 Z" />
          <circle cx="29" cy="50" r="2.5" fill="#F5C518" />
          <circle cx="71" cy="50" r="2.5" fill="#F5C518" />
        </g>
      )}
      <circle cx="42" cy="43" r="2.6" fill={INK} />
      <circle cx="58" cy="43" r="2.6" fill={INK} />
      {male && (
        <g stroke={INK} strokeWidth="1.8" fill="none">
          <circle cx="42" cy="43" r="6" />
          <circle cx="58" cy="43" r="6" />
          <path d="M48 43 L52 43" />
        </g>
      )}
      <circle cx="35" cy="50" r="3" fill="#F28B82" opacity="0.5" />
      <circle cx="65" cy="50" r="3" fill="#F28B82" opacity="0.5" />
      {state === "talking" ? (
        <ellipse cx="50" cy="53" rx="4" ry="3" fill={INK} className="mouth-origin animate-mouth" />
      ) : (
        <path
          d={state === "happy" ? "M42 51 Q50 60 58 51" : "M44 52 Q50 56 56 52"}
          stroke={INK}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
