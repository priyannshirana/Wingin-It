import { useT } from "../../i18n/useT";
import type { Gender, Role } from "../../net/protocol";
import { selectGenderOf, selectLang } from "../../state/selectors";
import { useStore, type SubtitleItem } from "../../state/store";
import { FlyerPortrait } from "../avatars/FlyerPortrait";
import { TowerPortrait } from "../avatars/TowerPortrait";
import { isDecodable, requestLifeline } from "./lifeline";
import { LifelineNote } from "./LifelineNote";
import { SubtitleLine } from "./SubtitleLine";
import { usePendingStale } from "./usePendingStale";

interface Props {
  item: SubtitleItem;
  opacity: number;
  fontSize: number;
  /** A line that just left the stack: drawn once more while it fades, never interactive. */
  leaving?: boolean;
}

/**
 * One partner line (§F13): a dark rounded bar with the speaker's portrait (in their gender), the
 * tag pill and the segments. In phase 3 a decodable line is clickable (one lifeline).
 */
export function SubtitleRow({ item, opacity, fontSize, leaving = false }: Props) {
  const t = useT();
  const lang = useStore(selectLang);
  const gender = useStore((s) => selectGenderOf(s, item.speaker_role)) ?? "male";
  const pending = useStore((s) => s.translations[item.id]?.pending === true);
  const revealed = useStore((s) => {
    const tr = s.translations[item.id];
    return tr !== undefined && !tr.pending && tr.openedAt !== 0;
  });
  const { stale, restart } = usePendingStale(pending);
  const decodable = useStore((s) => !leaving && isDecodable(s, item.id, stale));

  const onDecode = () => {
    restart();
    requestLifeline(item.id, stale);
  };

  return (
    <div
      data-testid={leaving ? "subtitle-leaving" : "subtitle-line"}
      data-decodable={decodable ? "true" : undefined}
      className={`transition-opacity duration-200 ${decodable ? "hover:opacity-100!" : ""}`}
      style={{ opacity: revealed ? 1 : opacity, fontSize }}
    >
      <div
        className={`group relative flex items-start gap-3 rounded-2xl bg-[rgba(10,12,18,0.55)] px-3 py-2 backdrop-blur-[4px] ${
          leaving ? "" : item.level === 3 ? "wingin-sub-glitch-in" : "animate-slide-up"
        } ${decodable ? "hover:bg-[rgba(10,12,18,0.72)]" : ""}`}
      >
        <SpeakerPortrait role={item.speaker_role} gender={gender} />
        <div className="min-w-0 flex-1">
          <SubtitleLine
            segments={item.segments}
            lead={
              <span
                lang={lang}
                data-testid="speaker-tag"
                className="mr-2 inline-block rounded-md bg-slate px-1.5 py-[3px] align-[0.2em] font-display text-[11px] leading-none font-extrabold tracking-wider whitespace-nowrap text-cream/80 uppercase"
              >
                {t(item.speaker_role === "flyer" ? "sub.tag_flyer" : "sub.tag_tower")}
              </span>
            }
          />
          {!leaving && <LifelineNote id={item.id} stale={stale} />}
        </div>
        {decodable && (
          <>
            <DecodeIcon />
            <button
              type="button"
              data-testid="decode"
              aria-label={t("lifeline.hint")}
              title={t("lifeline.hint")}
              className="pointer-events-auto absolute inset-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-gloss"
              onClick={onDecode}
            />
          </>
        )}
      </div>
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

/** The small "decode" badge that appears on hover over a decodable line. */
function DecodeIcon() {
  return (
    <span
      aria-hidden="true"
      className="mt-[0.2em] flex size-7 shrink-0 items-center justify-center rounded-full bg-gloss/90 text-night opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      >
        <circle cx="8" cy="12" r="4.2" />
        <path d="M12.2 12H21M18 12v3.2M21 12v2.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}
