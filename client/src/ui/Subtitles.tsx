import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ECHO_MS } from "../config";
import { useT } from "../i18n/useT";
import { useStore, type SubtitleItem } from "../state/store";
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
  const all = useStore((s) => s.subtitles);
  const { pinned, unpin } = usePinnedLine(all);
  // A pinned line takes one slot of the rolling stack so the block never grows taller.
  const rollN = pinned ? stack - 1 : stack;
  const items = useMemo(
    () => all.filter((i) => i.id !== pinned?.id).slice(-rollN),
    [all, pinned, rollN],
  );
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
      {pinned && (
        <SubtitleRow
          key={`pin-${pinned.id}`}
          item={pinned}
          opacity={1}
          fontSize={older}
          onUnpin={unpin}
        />
      )}
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

/**
 * §F13: the most recently lifelined line stays pinned (local UI state) until dismissed, the next
 * step starts, or another line is lifelined. History-restored translations (openedAt 0) don't pin.
 */
function usePinnedLine(all: SubtitleItem[]) {
  const openedId = useStore((s) => {
    let best: string | null = null;
    let at = 0;
    for (const [id, tr] of Object.entries(s.translations)) {
      if (!tr.pending && tr.openedAt > at) {
        at = tr.openedAt;
        best = id;
      }
    }
    return best === null ? null : `${best}@${at}`;
  });
  const actionId = useStore((s) => s.game?.action_id ?? null);
  const [pin, setPin] = useState<{ item: SubtitleItem; key: string } | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState(actionId);

  // Derived-during-render updates (React's "adjust state on prop change" pattern).
  if (openedId !== lastKey) {
    setLastKey(openedId);
    const id = openedId?.split("@")[0];
    const item = all.find((i) => i.id === id) ?? (pin?.item.id === id ? pin?.item : undefined);
    if (openedId !== null && item) setPin({ item, key: openedId });
  }
  if (actionId !== lastAction) {
    setLastAction(actionId);
    if (pin) setPin(null);
  }
  return { pinned: pin?.item ?? null, unpin: () => setPin(null) };
}
