import type { Segment } from "../../net/protocol";
import { GLOSS_CLASS, KEYWORD_CHIP_CLASS } from "./styles";

/**
 * One keyword segment: the chip, then its `[gloss]` when the server sent one. A two-concept
 * token ("twice" = TWO + TIMES) is still one segment, so it renders as one chip with one gloss.
 * The concept is deliberately never read here: every chip looks identical (§A2 rule 4).
 */
export function KeywordChip({ segment }: { segment: Segment }) {
  const gloss = segment.gloss;
  return (
    // One no-wrap unit, so a gloss never breaks onto the next line away from its chip.
    <span className="whitespace-nowrap">
      <span data-kind="keyword" data-testid="keyword-chip" className={KEYWORD_CHIP_CLASS}>
        {segment.text}
      </span>
      {gloss ? (
        <span data-testid="gloss" className={GLOSS_CLASS}>
          [{gloss}]
        </span>
      ) : null}
    </span>
  );
}
