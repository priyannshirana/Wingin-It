import type { Gender } from "../../net/protocol";

export type PortraitState = "idle" | "talking" | "happy";

interface Props {
  gender: Gender;
  state?: PortraitState;
  size?: number;
  className?: string;
}

const SKIN = "#E0AC69";
const SKIN_SHADE = "#C99556";
const INK = "#1F1F1F";
const BLUSH = "#F28B82";

// The Flyer's character as a flat toy bust (§F9.8), matching the 3D FlyerAvatar: male = tousled
// dark-brown hair, teal hoodie with a lighter hood rim, round glasses; female = dark hair with a
// high ponytail, coral bomber with a cream collar and zip, small gold earrings. States: idle
// (a blink every few seconds), talking (the mouth flaps), happy (deck screen).
export function FlyerPortrait({ gender, state = "idle", size = 96, className }: Props) {
  const male = gender === "male";
  const outfit = male ? "#2EC4B6" : "#E07A5F";
  const outfitShade = male ? "#22A397" : "#C6654B";
  const trim = male ? "#7EE0D6" : "#F2E8D5";
  const hair = male ? "#3B2A20" : "#2B1D16";
  const happy = state === "happy";
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      data-portrait={`flyer-${gender}`}
      data-state={state}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`flyer-clip-${gender}`}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#2A3A6A" />
      <g clipPath={`url(#flyer-clip-${gender})`}>
        {/* a soft window glow behind the head */}
        <circle cx="66" cy="30" r="20" fill="#3B4F8A" opacity="0.6" />
        {!male && (
          // high ponytail swinging behind the head
          <g>
            <path
              d="M58 16 C76 8 90 22 84 44 C82 52 76 56 72 52 C78 40 74 26 60 24 Z"
              fill={hair}
            />
            <circle cx="60" cy="19" r="4" fill={outfit} />
          </g>
        )}
        {/* body */}
        <path d="M10 102 C12 76 28 67 50 67 C72 67 88 76 90 102 Z" fill={outfit} />
        <path d="M10 102 C12 84 20 76 30 72 L30 102 Z" fill={outfitShade} opacity="0.7" />
        {male ? (
          // hood rim + drawstrings
          <g>
            <path d="M28 70 C34 84 66 84 72 70 C66 76 34 76 28 70 Z" fill={trim} />
            <path
              d="M44 79 L43 90 M56 79 L57 90"
              stroke={trim}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        ) : (
          // bomber collar + zip
          <g>
            <path d="M34 68 L50 80 L66 68 C62 74 38 74 34 68 Z" fill={trim} />
            <path d="M50 80 L50 102" stroke={trim} strokeWidth="2.2" />
          </g>
        )}
        {/* neck + head */}
        <rect x="43" y="56" width="14" height="14" rx="5" fill={SKIN_SHADE} />
        <circle cx="50" cy="41" r="21" fill={SKIN} />
        <circle cx="29.5" cy="43" r="4" fill={SKIN} />
        <circle cx="70.5" cy="43" r="4" fill={SKIN} />
        {male ? (
          // tousled tufts
          <g fill={hair}>
            <path d="M28 40 C26 22 38 14 51 15 C64 15 75 23 72 40 C70 31 64 27 58 28 C54 24 46 24 42 28 C36 27 31 32 28 40 Z" />
            <ellipse cx="38" cy="21" rx="9" ry="6" transform="rotate(-20 38 21)" />
            <ellipse cx="51" cy="16" rx="10" ry="6" />
            <ellipse cx="63" cy="20" rx="9" ry="6" transform="rotate(20 63 20)" />
            <ellipse cx="45" cy="26" rx="7" ry="4" transform="rotate(-10 45 26)" />
          </g>
        ) : (
          <g>
            <path
              d="M28 44 C25 22 39 15 51 15 C64 15 76 23 72 44 C70 33 64 28 56 27 C48 30 38 31 31 37 Z"
              fill={hair}
            />
            {/* side-swept fringe */}
            <path d="M31 36 C36 26 48 22 58 27 C48 28 40 32 33 40 Z" fill="#3A2820" />
            <circle cx="29" cy="50" r="2.4" fill="#F5C518" />
            <circle cx="71" cy="50" r="2.4" fill="#F5C518" />
          </g>
        )}
        {/* hair highlight */}
        <path
          d="M40 19 C45 17 52 17 56 18"
          stroke="#FFFFFF"
          strokeOpacity="0.18"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        {/* eyes: happy = closed arcs, otherwise dots that blink */}
        {happy ? (
          <g stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round">
            <path d="M38 44 Q42 39 46 44" />
            <path d="M54 44 Q58 39 62 44" />
          </g>
        ) : (
          <g fill={INK}>
            <ellipse cx="42" cy="43" rx="2.7" ry="2.7">
              <animate
                attributeName="ry"
                values="2.7;2.7;0.3;2.7"
                keyTimes="0;0.94;0.97;1"
                dur="4.2s"
                repeatCount="indefinite"
              />
            </ellipse>
            <ellipse cx="58" cy="43" rx="2.7" ry="2.7">
              <animate
                attributeName="ry"
                values="2.7;2.7;0.3;2.7"
                keyTimes="0;0.94;0.97;1"
                dur="4.2s"
                repeatCount="indefinite"
              />
            </ellipse>
          </g>
        )}
        {male && (
          <g stroke={INK} strokeWidth="1.8" fill="none">
            <circle cx="42" cy="43" r="6.2" />
            <circle cx="58" cy="43" r="6.2" />
            <path d="M48.2 43 L51.8 43" />
          </g>
        )}
        <circle cx="35" cy="50" r="3.2" fill={BLUSH} opacity={happy ? 0.75 : 0.5} />
        <circle cx="65" cy="50" r="3.2" fill={BLUSH} opacity={happy ? 0.75 : 0.5} />
        {state === "talking" ? (
          <ellipse
            cx="50"
            cy="53"
            rx="4"
            ry="3"
            fill={INK}
            className="mouth-origin animate-mouth"
          />
        ) : (
          <path
            d={happy ? "M41 51 Q50 61 59 51 Z" : "M44 52 Q50 56 56 52"}
            stroke={INK}
            strokeWidth="2.2"
            fill={happy ? "#7A2A2A" : "none"}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </g>
      <circle cx="50" cy="50" r="48" fill="none" stroke="#1b1d24" strokeWidth="2" />
    </svg>
  );
}
