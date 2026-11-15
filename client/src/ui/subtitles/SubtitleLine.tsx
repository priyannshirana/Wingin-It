import type { ReactNode } from "react";
import type { Segment } from "../../net/protocol";
import { KeywordChip } from "./KeywordChip";

/**
 * One line of server segments, rendered exactly as sent and in order, spaces preserved (§F13).
 * Segments are always Latin (§A2 rule 3); nothing here transliterates or translates.
 * Without `fontSize` the line inherits the font size of its row. `lead` (the speaker tag) flows
 * inline before the first segment, so wrapped lines use the full width.
 */
export function SubtitleLine({
  segments,
  fontSize,
  lead,
}: {
  segments: Segment[];
  fontSize?: number;
  lead?: ReactNode;
}) {
  return (
    <p
      className="font-display leading-snug whitespace-pre-wrap text-white"
      style={fontSize === undefined ? undefined : { fontSize }}
      lang="en-Latn"
    >
      {lead}
      {segments.map((seg, i) =>
        seg.kind === "keyword" ? (
          <KeywordChip key={i} segment={seg} />
        ) : (
          <span key={i} data-kind="plain">
            {seg.text}
          </span>
        ),
      )}
    </p>
  );
}
