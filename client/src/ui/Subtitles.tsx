import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ECHO_MS } from "../config";
import { useT } from "../i18n/useT";
import { useStore } from "../state/store";
import { SubtitleRow } from "./subtitles/SubtitleRow";
import { useLeavingItems } from "./subtitles/useLeavingItems";
import "./subtitles/subtitles.css";

interface Props {
  stack: 3 | 5;
  fontSize: number;
}

const OPACITY: Record<3 | 5, number[]> = {
  3: [0.35, 0.6, 1], // oldest → newest (§F11)
  5: [0.35, 0.5, 0.65, 0.8, 1],
};

/** Older lines are drawn at 80% of the newest line's size. */
const OLDER_SCALE = 0.8;

// The partner's subtitle stack (§F13), newest at the bottom, plus my own partial / echo above.
// One component for both screens: the Flyer passes stack 3 / 26 px, the Tower stack 5 / 20 px.
export function Subtitles({ stack, fontSize }: Props) {
  const items = useStore(useShallow((s) => s.subtitles.slice(-stack)));
  const glitch = useStore((s) => s.cues.subtitle_glitch === true);
  const leaving = useLeavingItems(items);
  const opacities = OPACITY[stack].slice(-items.length);
  const older = Math.round(fontSize * OLDER_SCALE);
  return (
    <div
      className={`flex flex-col gap-2 ${glitch ? "wingin-sub-glitch" : ""}`}
      data-testid="subtitles"
    >
      <MyLine />
      <div className="relative flex flex-col gap-2">
        {leaving.map((item) => (
          <div
            key={`leaving-${item.id}`}
            className="wingin-sub-leave pointer-events-none absolute inset-x-0 bottom-full mb-2"
            aria-hidden="true"
          >
            <SubtitleRow item={item} opacity={1} fontSize={older} leaving />
          </div>
        ))}
        {items.map((item, i) => (
          <SubtitleRow
            key={item.id}
            item={item}
            opacity={opacities[i] ?? 1}
            fontSize={i === items.length - 1 ? fontSize : older}
          />
        ))}
      </div>
    </div>
  );
}

/** My live caption while transmitting, then "You: …" for 3 s (§F11). Grey, no chips. */
function MyLine() {
  const t = useT();
  const partial = useStore((s) => s.partial);
  const echo = useStore(useShallow((s) => s.echo));
  const [expired, setExpired] = useState<number | null>(null);
  useEffect(() => {
    if (!echo) return;
    const left = echo.at + ECHO_MS - Date.now();
    const id = setTimeout(() => setExpired(echo.at), Math.max(0, left));
    return () => clearTimeout(id);
  }, [echo]);
  if (partial) {
    return <p className="px-3 font-display text-lg text-white/80 italic">{partial}</p>;
  }
  if (echo && expired !== echo.at) {
    return (
      <p className="px-3 font-display text-lg text-white/50">
        {t("sub.you")} {echo.text}
      </p>
    );
  }
  return null;
}
