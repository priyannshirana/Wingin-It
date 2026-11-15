import { useState } from "react";
import type { ManualCard as ManualCardData, PhaseNo } from "../net/protocol";
import { useStore } from "../state/store";
import { BookBinding } from "./manual/BookBinding";
import { BookLeaf } from "./manual/BookLeaf";
import { BookPage } from "./manual/BookPage";
import { BookShell } from "./manual/BookShell";
import { CLOSED_SHIFT, COVER_HALF_MS, RIGHT_PAGE_X, STACK, TURN_MS } from "./manual/bookGeometry";
import { CoverFace } from "./manual/CoverFace";
import { LeftPage } from "./manual/LeftPage";
import { PHASE_COLOR } from "./manual/phaseColors";
import { PhaseTabs } from "./manual/PhaseTabs";
import { RightPage } from "./manual/RightPage";

const NEXT_PHASE: Record<PhaseNo, PhaseNo> = { 1: 2, 2: 3, 3: 3 };

// The open ring-bound manual (§F12.3): a real open book with two equal pages. Left page = the
// title bar and the station diagram; right page = the instruction line, the pictogram rule grid,
// the notes and the progress dots. When the step changes, the right page flips over the gutter
// onto the left (0.4 s), revealing the new step on both pages. The `manual_close` cue closes the
// book to its cover (p1 / p2 outros). Card text arrives localized from the server, as is.
export function ManualCard({ card }: { card: ManualCardData }) {
  const closing = useStore((s) => s.cues.manual_close === true);
  const outro = useStore((s) => s.status === "PHASE_OUTRO");
  const [shown, setShown] = useState(card);
  const [turnFrom, setTurnFrom] = useState<ManualCardData | null>(null);
  if (shown !== card) {
    // Adjusting state on a prop change (no effect): remember the page we're turning away from.
    setShown(card);
    if (shown.action_id !== card.action_id) setTurnFrom(shown);
  }
  const left = turnFrom ?? card; // under the turning leaf, the old left page stays put
  const upcoming = outro ? NEXT_PHASE[card.phase] : card.phase;

  return (
    <BookShell
      testId="manual-card"
      lang={card.lang}
      shiftX={closing ? CLOSED_SHIFT : 0}
      shiftDelayMs={closing ? COVER_HALF_MS : 0}
    >
      <BookBinding spine={PHASE_COLOR[card.phase]} closed={closing} />
      <BookPage side="left" x={STACK} y={STACK} smudges={left.smudges} hidden={closing}>
        <LeftPage card={left} />
      </BookPage>
      <BookPage side="right" x={RIGHT_PAGE_X} y={STACK} smudges={card.smudges}>
        <PhaseTabs current={closing ? upcoming : card.phase} />
        <RightPage card={card} />
      </BookPage>
      {turnFrom && !closing && (
        <BookLeaf
          key={`turn-${card.action_id}`}
          testId="page-turn"
          from={0}
          to={-180}
          ms={TURN_MS}
          onDone={() => setTurnFrom(null)}
          front={
            <BookPage side="right" testId="leaf-page-right" smudges={turnFrom.smudges}>
              <RightPage card={turnFrom} />
            </BookPage>
          }
          back={
            <BookPage side="left" testId="leaf-page-left" smudges={card.smudges}>
              <LeftPage card={card} />
            </BookPage>
          }
        />
      )}
      {closing && (
        <BookLeaf
          key="close"
          testId="cover-leaf"
          from={-180}
          to={0}
          ms={COVER_HALF_MS}
          front={<CoverFace upcoming={upcoming} />}
          back={
            <BookPage side="left" testId="leaf-page-left" smudges={card.smudges}>
              <LeftPage card={card} />
            </BookPage>
          }
        />
      )}
    </BookShell>
  );
}
