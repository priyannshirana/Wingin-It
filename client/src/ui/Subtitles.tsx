import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ECHO_MS } from "../config";
import { useT } from "../i18n/useT";
import type { Gender, Role, Segment } from "../net/protocol";
import { selectGenderOf } from "../state/selectors";
import { useStore, type SubtitleItem } from "../state/store";
import { FlyerPortrait } from "./avatars/FlyerPortrait";
import { TowerPortrait } from "./avatars/TowerPortrait";

interface Props {
  stack: 3 | 5;
  fontSize: number;
}

const OPACITY: Record<3 | 5, number[]> = {
  3: [0.35, 0.6, 1], // oldest → newest
  5: [0.35, 0.5, 0.65, 0.8, 1],
};

// The partner's subtitle stack (§F13), newest at the bottom, plus my own partial / echo above.
// Segments render exactly as sent, in order. M2 adds the keyword chips, glosses and lifelines.
export function Subtitles({ stack, fontSize }: Props) {
  const items = useStore(useShallow((s) => s.subtitles.slice(-stack)));
  const opacities = OPACITY[stack].slice(-items.length);
  return (
    <div className="flex flex-col gap-2" data-testid="subtitles">
      <MyLine />
      {items.map((item, i) => (
        <SubtitleRow
          key={item.id}
          item={item}
          opacity={opacities[i] ?? 1}
          fontSize={i === items.length - 1 ? fontSize : Math.round(fontSize * 0.8)}
        />
      ))}
    </div>
  );
}

function SubtitleRow({
  item,
  opacity,
  fontSize,
}: {
  item: SubtitleItem;
  opacity: number;
  fontSize: number;
}) {
  const t = useT();
  const gender = useStore((s) => selectGenderOf(s, item.speaker_role)) ?? "male";
  return (
    <div
      data-testid="subtitle-line"
      className="animate-slide-up flex items-center gap-3 rounded-2xl bg-[rgba(10,12,18,0.55)] px-3 py-2 backdrop-blur-[4px] transition-opacity duration-200"
      style={{ opacity }}
    >
      <SpeakerPortrait role={item.speaker_role} gender={gender} />
      <span className="rounded-md bg-slate px-1.5 py-0.5 font-display text-[11px] font-extrabold tracking-wider text-cream/80 uppercase">
        {t(item.speaker_role === "flyer" ? "sub.tag_flyer" : "sub.tag_tower")}
      </span>
      <SubtitleLine segments={item.segments} fontSize={fontSize} />
    </div>
  );
}

function SpeakerPortrait({ role, gender }: { role: Role; gender: Gender }) {
  return role === "flyer" ? (
    <FlyerPortrait gender={gender} size={28} className="shrink-0" />
  ) : (
    <TowerPortrait gender={gender} size={28} className="shrink-0" />
  );
}

/** One line of segments, rendered in order with spaces preserved. */
export function SubtitleLine({
  segments,
  fontSize = 20,
}: {
  segments: Segment[];
  fontSize?: number;
}) {
  return (
    <p
      className="font-display leading-snug whitespace-pre-wrap text-white"
      style={{ fontSize }}
      lang="en-Latn"
    >
      {segments.map((seg, i) => (
        <span key={i} data-kind={seg.kind}>
          {seg.text}
        </span>
      ))}
    </p>
  );
}

/** My live caption while transmitting, then "You: …" for 3 s (§F11). */
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
