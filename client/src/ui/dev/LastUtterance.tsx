import type { ReactNode } from "react";
import type { DevState } from "../../net/protocol";
import { DEV_LABELS as L } from "./labels";
import { LATENCY_TARGET_MS } from "./LatencySparkline";

type Last = NonNullable<DevState["last_utterance"]>;
type Match = Last["matches"][number];

const SIDE_CLASS: Record<Match["side"], string> = {
  speaker: "decoration-teal",
  listener: "decoration-[#FFD479]",
};

/** The transcript with every matched range underlined (overlaps keep the first match). */
function markTranscript(transcript: string, matches: Match[]): ReactNode[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of sorted) {
    const start = Math.max(m.start, at);
    const end = Math.min(m.end, transcript.length);
    if (end <= start) continue;
    if (start > at) out.push(transcript.slice(at, start));
    out.push(
      <span
        key={`${m.start}-${m.end}`}
        className={`underline decoration-2 underline-offset-2 ${SIDE_CLASS[m.side]}`}
      >
        {transcript.slice(start, end)}
      </span>,
    );
    at = end;
  }
  if (at < transcript.length) out.push(transcript.slice(at));
  return out;
}

/** §F18.4 last utterance: transcript, matches, segments as sent, latency. */
export function LastUtterance({ last }: { last: DevState["last_utterance"] }) {
  return (
    <section data-testid="dev-last-utterance">
      <h3 className="mb-1 text-[11px] tracking-widest text-teal uppercase">{L.lastUtterance}</h3>
      {last === null ? (
        <p className="text-white/45">{L.none}</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-white/45">
            {last.id} · {last.speaker_role} · {L.latency}{" "}
            <span className={latencyClass(last.latency_ms)}>
              {last.latency_ms === null ? L.none : `${last.latency_ms} ms`}
            </span>
          </p>
          <p className="rounded bg-black/30 px-2 py-1 whitespace-pre-wrap text-white">
            {markTranscript(last.transcript, last.matches)}
          </p>
          <ul className="space-y-0.5" aria-label={L.matches}>
            {last.matches.map((m, i) => (
              <li key={i} className="text-white/75">
                [{m.start}, {m.end}) {m.concepts.join("+")}{" "}
                <span className="text-white/45">{m.side}</span>
              </li>
            ))}
          </ul>
          <ol className="space-y-0.5" aria-label={L.segments} data-testid="dev-segments">
            {last.segments.map((seg, i) => (
              <li key={i} className="whitespace-pre-wrap">
                <span className="text-white/40">{seg.kind === "keyword" ? "kw" : "··"} </span>
                <span className="text-white">&quot;{seg.text}&quot;</span>
                {seg.kind === "keyword" && (
                  <span className="text-white/60">
                    {" "}
                    {seg.concepts?.join("+") ?? seg.concept ?? "?"}
                    {seg.gloss ? <span className="text-gloss"> [{seg.gloss}]</span> : null}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function latencyClass(ms: number | null): string {
  if (ms === null) return "text-white/45";
  return ms > LATENCY_TARGET_MS ? "text-lamp-red" : "text-[#7CE0A3]";
}
