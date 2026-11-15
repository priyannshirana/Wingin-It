// Flyer `prologue` timeline (§F14.2): the 28 s movie-style opening (12 s in a demo room).
// Dusk takeoff → "1.5 hours later" → the captain dozes off and slumps → "take control" → black →
// a dolly into the Flyer's eyes → the phase 1 title. Beats are laid out in absolute seconds per
// variant (the demo compresses per beat, not uniformly), so it ignores `at()`.
import { cut, EXTERIOR_PLANE as P, SHOTS } from "../cameraRig";
import { getRef } from "../../scene/sceneRefs";
import { type Builder, phaseCard } from "../timelineKit";
import { beats, cam, ext, planeVisible, put, roll, shake, tw } from "./kit";

interface Beat {
  roll0: number; // engines spool, the plane starts to roll
  lift: number; // lift-off
  chase: number; // cut to the chase camera
  logo: [number, number];
  black: [number, number]; // the time-skip black (the card sits inside it)
  card: [number, number];
  interior: number; // cut to WIDE_INTERIOR
  yawn: number;
  nod1: number;
  nod2: number;
  slump: number; // hero: the captain slumps onto the yoke
  take: [number, number]; // "take control" card + dim
  crackle: number;
  black2: [number, number] | null; // black before the dolly (full version only)
  dolly: [number, number];
  title: [number, number];
}

const FULL: Beat = {
  roll0: 0.8,
  lift: 3.5,
  chase: 4,
  logo: [5, 7.1],
  black: [8, 10.5],
  card: [8.4, 10.1],
  interior: 12,
  yawn: 12.5,
  nod1: 13.5,
  nod2: 14.5,
  slump: 15.5,
  take: [17, 20],
  crackle: 17.2,
  black2: [20, 21],
  dolly: [21.5, 24.6],
  title: [25.5, 27.6],
};

// 3 s takeoff, 1.2 s time skip, 3.5 s dozing, 1.5 s take-control, 1.8 s dolly-in, 1 s title.
const DEMO: Beat = {
  roll0: 0.3,
  lift: 1.4,
  chase: 1.6,
  logo: [1.8, 2.7],
  black: [3, 4.2],
  card: [3.2, 4.0],
  interior: 4.7,
  yawn: 4.9,
  nod1: 5.6,
  nod2: 6.1,
  slump: 6.9,
  take: [7.7, 9.2],
  crackle: 7.8,
  black2: null,
  dolly: [9.2, 11],
  title: [11, 12],
};

const WIDE = SHOTS.WIDE_INTERIOR;
const CHASE = SHOTS.EXT_CHASE;

export const prologue: Builder = (tl, ctx) => {
  const D = tl.duration();
  const B = D < 20 ? DEMO : FULL;
  const b = beats(tl, ctx);

  const sky = getRef("sky");
  const clouds = getRef("clouds");
  const runway = getRef("runway");
  const props = getRef("propellers");
  const plane = getRef("exteriorPlane");
  const pilot = getRef("pilot");
  const avatar = getRef("flyerAvatar");
  const lights = getRef("lightRig");

  // --- 0 Takeoff at dusk -----------------------------------------------------------------------
  tl.addLabel("takeoff", 0);
  put(tl, sky, { dawn: 1, stars: 0.25, moon: 0.2, storm: 0 }, 0);
  put(tl, clouds, { dawn: 1, storm: 0, density: 1, speed: 1.6 }, 0);
  put(tl, runway?.place, { y: -1.2, z: 300, shown: 1 }, 0);
  put(tl, runway?.stream, { speed: 0, lights: 1 }, 0);
  put(tl, props, { left: 0.3, right: 0.3 }, 0);
  put(tl, plane?.position, { x: P.x, y: P.y, z: P.z }, 0);
  put(tl, plane?.rotation, { x: 0, y: 0, z: 0 }, 0);
  planeVisible(tl, true, 0);
  put(tl, pilot?.pose, { slump: 0, stretch: 0, awake: 1, look: 0, zzz: 0, zzzScale: 1 }, 0);
  put(tl, avatar?.pose, { panic: 0, turn: 0, brace: 0, cheer: 0 }, 0);
  tl.call(() => lights?.setRig("dawn", 0.05), [], 0);
  tl.call(() => ctx.sfx.loop("engine_hum", true), [], B.roll0);
  // Camera A: low in front of the plane at the threshold, then a dolly alongside while it rolls.
  cam(tl, 0, 0, { at: ext(3, -0.5, -12), look: ext(-0.8, 0.9, 0) });
  cam(tl, B.roll0, B.lift - 0.5 - B.roll0, { at: ext(14, 0.1, 1.5), look: ext(-0.5, 0.8, -3.5) });
  tw(tl, runway?.stream, { speed: 60 }, B.roll0, B.lift - B.roll0, "power2.in");
  tw(tl, props, { left: 1, right: 1 }, B.roll0, 1.6, "power1.out");
  // Lift-off: the suspension dips, then the nose comes up and the plane leaves the ground.
  tw(tl, plane?.position, { y: P.y - 0.08 }, B.lift - 0.3, 0.3, "power2.out");
  tw(tl, plane?.position, { y: P.y + 1.6 }, B.lift, B.chase - B.lift, "power2.in");
  tw(tl, plane?.rotation, { x: 0.2 }, B.lift - 0.1, B.chase - B.lift + 0.1, "power2.out");
  cam(tl, B.lift - 0.1, B.chase - B.lift + 0.1, { look: ext(-0.3, 2, -3.5) }, "power2.out");
  tl.call(() => ctx.sfx.play("whoosh"), [], B.lift);
  // Chase: the camera cuts behind and below while the ground drops away under the plane.
  tl.addLabel("chase", B.chase);
  put(tl, plane?.position, { y: P.y }, B.chase);
  put(tl, runway?.place, { y: -2.8 }, B.chase);
  cam(tl, B.chase, 0, { at: ext(-2.2, -0.7, 9.5), look: ext(1.2, 1.0, -6) }, "none");
  const climb = B.black[0] - B.chase;
  cam(tl, B.chase, climb, { at: ext(-3.4, -0.1, 10.5), look: ext(1, 1.2, -6) }, "power1.inOut");
  tw(tl, runway?.place, { y: -40 }, B.chase, climb, "power2.in");
  tw(tl, plane?.rotation, { x: 0.12 }, B.chase, 0.5, "power2.out");
  tw(tl, plane?.rotation, { z: -0.14 }, B.chase + 0.8 * climb * 0.4, climb * 0.35, "sine.inOut");
  tw(tl, clouds, { speed: 2.4 }, B.chase, 0.6);
  // Dusk turns to night.
  const shift = B.chase + (B.black[0] - B.chase) * 0.5;
  tl.call(() => lights?.setRig("night_calm", D < 20 ? 1.5 : 3.5), [], shift);
  tw(tl, sky, { dawn: 0, stars: 1, moon: 1 }, shift, B.black[0] - shift, "power1.inOut");
  tw(tl, clouds, { dawn: 0 }, shift, B.black[0] - shift, "power1.inOut");
  // The logo.
  b.title({ kind: "text", key: "app.logo" }, B.logo[0], B.logo[1]);

  // --- Time skip -------------------------------------------------------------------------------
  tl.addLabel("time_skip", B.black[0]);
  b.cue("fade_black", B.black[0], B.black[1]);
  b.title({ kind: "text", key: "cin.time_skip" }, B.card[0], B.card[1]);
  // Hidden by the black: reset everything the takeoff moved, cut to the night chase.
  const hid = B.black[0] + 0.45;
  put(tl, plane?.position, { x: P.x, y: P.y, z: P.z }, hid);
  put(tl, plane?.rotation, { x: 0, z: 0 }, hid);
  put(tl, runway?.place, { y: -40, z: -600, shown: 0 }, hid);
  put(tl, runway?.stream, { speed: 0, lights: 0 }, hid);
  put(tl, props, { left: 1, right: 1 }, hid);
  put(tl, clouds, { speed: 1 }, hid);
  put(tl, sky, { dawn: 0, stars: 1, moon: 1 }, hid);
  cam(tl, hid, 0, { at: CHASE.position, look: CHASE.target }, "none");
  // Night over moonlit clouds: a slow drift until the cut inside.
  cam(tl, B.black[1], B.interior - B.black[1], { at: ext(-1.4, -0.5, 8.8) }, "none");

  // --- Cruise: the captain dozes off ------------------------------------------------------------
  tl.addLabel("dozing", B.interior);
  tl.add(cut("WIDE_INTERIOR"), B.interior);
  const yawnS = B.nod1 - B.yawn - 0.1;
  tw(tl, pilot?.pose, { stretch: 1 }, B.yawn, yawnS * 0.55, "power2.out");
  tw(tl, pilot?.pose, { stretch: 0 }, B.yawn + yawnS * 0.55, yawnS * 0.45, "power2.inOut");
  for (const n of [B.nod1, B.nod2]) {
    tw(tl, pilot?.pose, { slump: 0.4 }, n, 0.3, "power2.out");
    tw(tl, pilot?.pose, { slump: 0 }, n + 0.35, 0.4, "power2.inOut");
  }
  const dozeLen = B.take[0] - B.interior;
  cam(tl, B.interior, dozeLen, { at: [0.1, 1.8, 1.25], look: [-0.1, 1.1, -0.5] }, "power1.inOut");

  // Hero: the captain slumps onto the yoke (shake + thud), the alarm follows 0.5 s later.
  tl.addLabel("hero", B.slump);
  tw(tl, pilot?.pose, { slump: 1 }, B.slump, 0.7, "power2.in");
  tw(tl, pilot?.pose, { awake: 0 }, B.slump, 0.3, "none");
  tw(tl, pilot?.pose, { zzz: 1 }, B.slump + 0.5, 0.4, "back.out(1.7)");
  tw(tl, avatar?.pose, { turn: 1 }, B.slump, 0.3, "power2.out");
  tw(tl, avatar?.pose, { panic: 1 }, B.slump + 0.3, 0.3, "back.out(1.7)");
  roll(tl, 6, B.slump - 0.1, 0.5, "power2.out");
  roll(tl, 0, B.slump + 0.9, 1.2);
  shake(tl, 0.45, 0.7, B.slump);
  b.sound("clunk", B.slump);
  tl.call(() => lights?.setRig("night_alarm", 0.3), [], B.slump + 0.5);
  tl.call(() => ctx.sfx.loop("alarm_master", true), [], B.slump + 0.5);
  b.flash(B.slump + 0.5, "#E5484D", 200, 0.3);

  // --- "Take control" --------------------------------------------------------------------------
  tl.addLabel("take_control", B.take[0]);
  b.cue("fade_dim", B.take[0], B.take[1]);
  b.title({ kind: "text", key: "cin.take_control_flyer" }, B.take[0], B.take[1] - 0.4);
  b.sound("radio_crackle", B.crackle);

  // --- Black, then into the Flyer's eyes ---------------------------------------------------------
  const dollyFrom = B.black2 ? B.black2[1] + 0.5 : B.dolly[0];
  const reset = B.black2 ? B.black2[0] + 0.45 : B.dolly[0];
  if (B.black2) b.cue("fade_black", B.black2[0], B.black2[1]);
  put(tl, avatar?.pose, { turn: 0, panic: 0 }, reset);
  cam(tl, reset, 0, { at: WIDE.position, look: WIDE.target }, "none");
  tl.addLabel("eyes", dollyFrom);
  const eye = SHOTS.FLYER_DEFAULT;
  cam(
    tl,
    B.dolly[0],
    B.dolly[1] - B.dolly[0],
    { at: eye.position, look: eye.target },
    "power2.inOut",
  );
  // The first-person view settles facing the overhead (the resting shot of the next state).
  const over = SHOTS.OVERHEAD;
  cam(
    tl,
    B.dolly[1],
    B.title[0] - B.dolly[1] + 0.2,
    { at: over.position, look: over.target },
    "power2.inOut",
  );

  // --- Title -----------------------------------------------------------------------------------
  tl.addLabel("title", B.title[0]);
  b.title(phaseCard(1), B.title[0], B.title[1]);
};
