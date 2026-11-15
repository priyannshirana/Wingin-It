import type { PhaseNo } from "../../net/protocol";
import { useStore } from "../../state/store";
import { BookBinding } from "./BookBinding";
import { BookLeaf } from "./BookLeaf";
import { BookPage } from "./BookPage";
import { BookShell } from "./BookShell";
import { CLOSED_SHIFT, COVER_HALF_MS, RIGHT_PAGE_X, STACK } from "./bookGeometry";
import { CoverFace } from "./CoverFace";
import { PHASE_COLOR } from "./phaseColors";
import { PhaseTabs } from "./PhaseTabs";

// The closed manual (§F12.3): the teal hardback with the title, a plane emblem, the phase tabs
// and the upcoming phase's name, centered on the desk. The `manual_open` cue (p1_intro) swings
// the cover open over the spine (0.6 s) onto two blank pages, the same spread the first card then
// fills. The pose is a pure function of the cue (CSS transition), so seeking / skipping always
// lands in the matching state.
export function ManualCover({ upcoming }: { upcoming: PhaseNo }) {
  const open = useStore((s) => s.cues.manual_open === true);
  return (
    // open: slide to the spread's place, then flip; close again: flip back, then slide
    <BookShell
      testId="manual-cover"
      shiftX={open ? 0 : CLOSED_SHIFT}
      shiftDelayMs={open ? 0 : COVER_HALF_MS}
    >
      <div data-testid="cover-state" data-open={open ? "1" : "0"} hidden />
      <BookBinding spine={PHASE_COLOR[upcoming]} closed={!open} />
      <BookPage side="right" x={RIGHT_PAGE_X} y={STACK} smudges={false}>
        <PhaseTabs current={upcoming} />
      </BookPage>
      <BookLeaf
        testId="cover-leaf"
        to={open ? -180 : 0}
        ms={COVER_HALF_MS}
        delayMs={open ? COVER_HALF_MS : 0}
        front={<CoverFace upcoming={upcoming} />}
        back={<BookPage side="left" testId="leaf-page-left" smudges={false} />}
      />
    </BookShell>
  );
}
