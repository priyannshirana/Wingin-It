import { useEffect, useMemo, useState } from "react";
import { useT } from "../../i18n/useT";
import type { Lang } from "../../net/protocol";
import { graphemes } from "./format";

interface Props {
  report: string | null;
  pending: boolean;
  /** The viewer's language: the report is written in it (Devanagari for Hindi). */
  lang: Lang;
}

const TYPE_MS = 45;
/** Extra ticks the full line stays up before it types again. */
const HOLD_TICKS = 28;

/**
 * The mission report under the deck header (§F17): Baloo 2, 20 px, in the player's own script.
 * While the server's report is pending, `deck.report_loading` types itself out in a loop.
 */
export function MissionReport({ report, pending, lang }: Props) {
  if (report !== null && report !== "") {
    return (
      <p
        data-testid="deck-report"
        lang={lang}
        className="max-w-3xl animate-slide-up font-display text-[20px] leading-relaxed font-semibold text-cream/90"
      >
        {report}
      </p>
    );
  }
  if (!pending) return null;
  return <ReportLoading lang={lang} />;
}

function ReportLoading({ lang }: { lang: Lang }) {
  const t = useT();
  const text = t("deck.report_loading");
  const chars = useMemo(() => graphemes(text), [text]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) % (chars.length + HOLD_TICKS)), TYPE_MS);
    return () => clearInterval(id);
  }, [chars.length]);
  const shown = chars.slice(0, Math.min(tick, chars.length)).join("");
  return (
    <p
      data-testid="deck-report-loading"
      lang={lang}
      aria-live="polite"
      className="max-w-3xl font-display text-[20px] leading-relaxed font-semibold text-cream/60"
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{shown}</span>
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block h-[1.1em] w-[3px] translate-y-[3px] animate-pulse rounded-sm bg-teal"
      />
    </p>
  );
}
