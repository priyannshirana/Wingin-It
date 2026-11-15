// The open manual's design size (§F12.3). The spread is laid out at these CSS px and scaled as a
// whole to fit the Tower's center column (both its width and its height), so nothing on either
// page can be clipped or scroll at any screen size: only the scale changes.
import { W } from "./diagramLayout";

/** Each page (two equal pages). */
export const PAGE_W = 360;
export const PAGE_H = 664;
/** Gap between the pages for the spine and the rings. */
export const GUTTER = 16;
/** Stacked page edges peeking out along each outer side (and top / bottom). */
export const STACK = 5;
/** How far the phase tabs stick out of the right page's outer edge (inside the reserved width). */
export const TAB_REACH = 26;
/** Page padding. */
export const PAGE_PAD = 18;

export const SPREAD_W = STACK + PAGE_W + GUTTER + PAGE_W + STACK;
export const BOOK_W = SPREAD_W + TAB_REACH;
export const BOOK_H = PAGE_H + STACK * 2;

/** Room kept clear above the book for the desk mug when the column allows it. */
export const TOP_CLEAR = 76;

/** Page border (each side). */
export const PAGE_BORDER = 2;
/** The left page's title bar: the step / phase row, a gap and the two-line title box. */
export const TITLE_BAR_H = 22 + 6 + 78;
const SLOT_GAP = 8;

/** The diagram's box on the left page, and the matching viewBox units per design px. */
export const DIAGRAM_W = PAGE_W - PAGE_PAD * 2 - PAGE_BORDER * 2;
export const DIAGRAM_H = PAGE_H - PAGE_PAD * 2 - PAGE_BORDER * 2 - TITLE_BAR_H - SLOT_GAP;
export const DIAGRAM_U = W / DIAGRAM_W;
/**
 * The diagram fills up to this share of its box's height (a little air under the title).
 * SPEC-ASSUMPTION: §F12.3 asks for the diagram at ≈ 80% of the left page's height; the drawing is
 * bound by the page's 320 px width (its tags stay 14 px), so its drawn height comes out at
 * ≈ 65–72% of the page, centered in the full-height slot under the title.
 */
export const DIAGRAM_ASPECT = (DIAGRAM_H / DIAGRAM_W) * 0.94;

/** x of the right page's left edge inside the spread. */
export const RIGHT_PAGE_X = STACK + PAGE_W + GUTTER;

/** Shift that centers the closed book (the cover on the right half, plus its tabs). */
export const CLOSED_SHIFT = BOOK_W / 2 - (RIGHT_PAGE_X + (PAGE_W + TAB_REACH) / 2);

/** §F12.3: the page turn; §F14.4: the cover opening / closing. */
export const TURN_MS = 400;
export const COVER_MS = 600;
/**
 * The cover motion's two halves: the book slides to / from the center, and the cover flips. They
 * run one after the other (open: slide, then flip; close: flip, then slide), so the flipping leaf
 * never swings out past the manual's column while the book is off-center.
 */
export const COVER_HALF_MS = COVER_MS / 2;
