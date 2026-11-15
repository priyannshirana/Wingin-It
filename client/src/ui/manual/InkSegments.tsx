import type { Segment } from "../../net/protocol";

/**
 * Manual text segments: every keyword gets the same yellow highlighter mark, whatever its
 * concept, and no glosses (§F12.3 item 4).
 */
export function InkSegments({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "keyword" ? (
          <mark key={i} data-testid="ink-keyword" className="highlighter bg-transparent text-ink">
            {seg.text}
          </mark>
        ) : (
          <span key={i} className="whitespace-pre-wrap">
            {seg.text}
          </span>
        ),
      )}
    </>
  );
}
