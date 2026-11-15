import type { Gender } from "../../net/protocol";
import type { PortraitState } from "./FlyerPortrait";

interface Props {
  gender: Gender;
  state?: PortraitState;
  size?: number;
  className?: string;
}

const SKIN = "#C68642";
const SKIN_SHADE = "#A86F35";
const INK = "#1F1F1F";
const HAIR = "#2B1D16";
const NAVY = "#1F2A44";
const TEAL = "#2EC4B6";
const HEADSET = "#3D4352";

// The air-traffic controller as a flat toy bust (§F9.8): a headset with a mic boom, a navy vest
// over a cream shirt with a teal "ATC" badge; male = short dark hair, female = a low bun. Neither
// has a mustache, so they are never confused with the captain. States: idle (a blink every few
// seconds, the boom bobbing gently), talking (the mic tip glows and the mouth flaps), happy.
export function TowerPortrait({ gender, state = "idle", size = 96, className }: Props) {
  const male = gender === "male";
  const talking = state === "talking";
  const happy = state === "happy";
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      data-portrait={`tower-${gender}`}
      data-state={state}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`tower-clip-${gender}`}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#1E3A2F" />
      <g clipPath={`url(#tower-clip-${gender})`}>
        {/* radar rings behind the head */}
        <g stroke="#2E5A47" strokeWidth="1.5" fill="none">
          <circle cx="50" cy="44" r="30" />
          <circle cx="50" cy="44" r="40" />
        </g>
        {/* low bun peeking out behind the neck */}
        {!male && (
          <g>
            <circle cx="71" cy="55" r="9" fill={HAIR} />
            <path d="M64 53 Q69 49 75 52" stroke="#3A2820" strokeWidth="1.6" fill="none" />
          </g>
        )}
        {/* shirt, navy vest, badge */}
        <path d="M10 102 C12 76 28 67 50 67 C72 67 88 76 90 102 Z" fill="#F2E8D5" />
        <path d="M10 102 C12 78 26 69 40 67 L50 86 L60 67 C74 69 88 78 90 102 Z" fill={NAVY} />
        {/* The badge lettering is part of the character art (§F9.8), not UI copy. */}
        <rect x="60" y="80" width="17" height="10" rx="2.5" fill={TEAL} />
        <text
          x="68.5"
          y="87.6"
          textAnchor="middle"
          fontFamily="Baloo 2, sans-serif"
          fontWeight="800"
          fontSize="6.5"
          fill={NAVY}
        >
          ATC
        </text>
        {/* neck + head */}
        <rect x="43" y="56" width="14" height="14" rx="5" fill={SKIN_SHADE} />
        <circle cx="50" cy="42" r="21" fill={SKIN} />
        {male ? (
          <path
            d="M30 34 C29 21 40 16 50 16 C62 16 72 21 70 34 C66 27 58 25 50 25 C42 25 34 27 30 34 Z"
            fill={HAIR}
          />
        ) : (
          <g fill={HAIR}>
            <path d="M27 50 C22 22 40 15 50 15 C62 15 79 22 73 50 C70 33 62 26 50 26 C39 26 31 33 27 50 Z" />
            <path d="M50 17 C46 22 44 26 45 29" stroke="#3A2820" strokeWidth="1.6" fill="none" />
          </g>
        )}
        {/* headset band + ear cups */}
        <path d="M27 42 C27 13 73 13 73 42" stroke={HEADSET} strokeWidth="4" fill="none" />
        <rect x="21.5" y="35" width="10" height="15" rx="4.5" fill={HEADSET} />
        <rect x="68.5" y="35" width="10" height="15" rx="4.5" fill={HEADSET} />
        <rect x="23.5" y="38" width="3" height="9" rx="1.5" fill={TEAL} opacity="0.8" />
        {/* mic boom: bobs gently when idle, glows while talking */}
        <g className={talking ? "animate-boom" : undefined}>
          {!talking && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 27 46;-2 27 46;0 27 46"
              dur="3s"
              repeatCount="indefinite"
            />
          )}
          <path
            d="M27 47 Q29 60 43 58"
            stroke={HEADSET}
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
          {talking && <circle cx="44" cy="58" r="5.5" fill="#E5484D" opacity="0.35" />}
          <circle cx="44" cy="58" r="3" fill={talking ? "#E5484D" : HEADSET} />
        </g>
        {/* eyes */}
        {happy ? (
          <g stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round">
            <path d="M38 43 Q42 38 46 43" />
            <path d="M54 43 Q58 38 62 43" />
          </g>
        ) : (
          <g fill={INK}>
            <ellipse cx="42" cy="42" rx="2.6" ry="2.6">
              <animate
                attributeName="ry"
                values="2.6;2.6;0.3;2.6"
                keyTimes="0;0.95;0.975;1"
                dur="3.7s"
                repeatCount="indefinite"
              />
            </ellipse>
            <ellipse cx="58" cy="42" rx="2.6" ry="2.6">
              <animate
                attributeName="ry"
                values="2.6;2.6;0.3;2.6"
                keyTimes="0;0.95;0.975;1"
                dur="3.7s"
                repeatCount="indefinite"
              />
            </ellipse>
          </g>
        )}
        <path
          d="M37 36 Q42 34 46 36 M54 36 Q58 34 63 36"
          stroke={HAIR}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="35" cy="49" r="3" fill="#E08A6E" opacity={happy ? 0.7 : 0.4} />
        <circle cx="65" cy="49" r="3" fill="#E08A6E" opacity={happy ? 0.7 : 0.4} />
        {talking ? (
          <ellipse
            cx="52"
            cy="52"
            rx="4"
            ry="3"
            fill={INK}
            className="mouth-origin animate-mouth"
          />
        ) : (
          <path
            d={happy ? "M42 50 Q51 60 60 50 Z" : "M45 51 Q51 55 57 51"}
            stroke={INK}
            strokeWidth="2.2"
            fill={happy ? "#6E2A24" : "none"}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </g>
      <circle cx="50" cy="50" r="48" fill="none" stroke="#10241B" strokeWidth="2" />
    </svg>
  );
}
