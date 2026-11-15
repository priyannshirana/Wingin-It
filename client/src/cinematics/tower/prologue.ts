import { type Builder, phaseCard } from "../timelineKit";
import { beats, STAMP_IMPACT_S, TITLE_OUT_S } from "./beats";
import { windowShot } from "./window";

// Tower prologue (§F14.4), on the Flyer prologue's server-clock beats (cinematics/flyer/
// prologue.ts): the tower window shows the takeoff, the radar boots as it closes, the
// time-skip black, the cruising radar, MAYDAY, the take-control card, black, the manual cover
// and the phase 1 title. The demo (12 s) is compressed per beat, like the Flyer's.
interface Beat {
  window: number; // the window slides closed; the radar boots
  black: [number, number]; // the time-skip black (the card sits inside it)
  card: [number, number];
  mayday: number; // the blip turns red, the radio crackles, the stamp slams
  stampOff: number; // the stamp leaves, hidden under the black
  take: [number, number]; // "take control" card + dim
  black2: [number, number] | null; // black before the manual cover (full version only)
  title: [number, number];
}

const FULL: Beat = {
  window: 7.5,
  black: [8, 10.5],
  card: [8.4, 10.1],
  mayday: 17,
  stampOff: 20.4,
  take: [17, 20],
  black2: [20, 21],
  title: [25.5, 27.6],
};

const DEMO: Beat = {
  window: 2.5,
  black: [3, 4.2],
  card: [3.2, 4.0],
  mayday: 7.7,
  stampOff: 9.2,
  take: [7.7, 9.2],
  black2: null,
  title: [11, 11.6],
};

export const prologue: Builder = (tl, ctx) => {
  const D = tl.duration();
  const B = D < 20 ? DEMO : FULL;
  const b = beats(tl, ctx);

  // The takeoff from the tower window: it opens at 0 and slides away over 0.5 s from B.window.
  tl.addLabel("takeoff", 0);
  windowShot(tl, b, "takeoff", 0, B.window);
  b.sound("whoosh", B.window * 0.5);

  // The radar boots as the window closes.
  tl.addLabel("boot", B.window);
  b.cue("radar_boot", B.window, B.black[1]);

  // Time skip.
  tl.addLabel("time_skip", B.black[0]);
  b.cue("fade_black", B.black[0], B.black[1]);
  b.title({ kind: "text", key: "cin.time_skip" }, B.card[0], B.card[1]);

  // Hero: the blip turns red, the radio crackles, MAYDAY slams (flash + sound + shake triple).
  tl.addLabel("hero", B.mayday);
  b.sound("radio_crackle", B.mayday);
  b.sound("stamp", B.mayday + STAMP_IMPACT_S);
  b.flash(B.mayday, "#E5484D", 160, 0.25);
  b.cue("mayday_stamp", B.mayday, B.stampOff);

  // "Take control": the dimmed screen and the card.
  tl.addLabel("take_control", B.take[0]);
  b.cue("fade_dim", B.take[0], B.take[1]);
  b.title({ kind: "text", key: "cin.take_control_tower" }, B.take[0], B.take[1] - TITLE_OUT_S);
  if (B.black2) b.cue("fade_black", B.black2[0], B.black2[1]);

  // The manual cover (the desk's resting state), then the phase 1 title over it.
  tl.addLabel("title", B.title[0]);
  b.title(phaseCard(1), B.title[0], B.title[1]);
};
