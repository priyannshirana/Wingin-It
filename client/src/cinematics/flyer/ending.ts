// Flyer `ending` timeline (§F14.2): a slow 60° orbit of the plane at dawn, the result title,
// and a fade to cream for the last 0.8 s (the deck appears when the server sends `deck`).
import { EXTERIOR_PLANE as P, rig } from "../cameraRig";
import { type Builder, endingCard } from "../timelineKit";
import { beats, put, tw } from "./kit";

const DEG = Math.PI / 180;
// The EXT_CHASE offset from the plane (behind and below), orbited around the plane's Y axis.
const R = { x: -2.2, y: -0.7, z: 9.5 };
const AIM = { x: 1.2, y: 1.0, z: -6 };
const orbit = { a: 0 };

function place(): void {
  const a = orbit.a * 60 * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Rotation about the plane's Y axis: x' = x c + z s, z' = −x s + z c.
  rig.position.set(P.x + R.x * c + R.z * s, P.y + R.y, P.z - R.x * s + R.z * c);
  rig.target.set(P.x + AIM.x * c + AIM.z * s, P.y + AIM.y, P.z - AIM.x * s + AIM.z * c);
}

export const ending: Builder = (tl, ctx) => {
  const b = beats(tl, ctx);
  const D = tl.duration();
  put(tl, orbit, { a: 0 }, 0);
  tl.to(
    orbit,
    { a: 1, duration: D, ease: "power1.inOut", immediateRender: false, onUpdate: place },
    0,
  );
  tw(tl, rig, { roll: 0 }, 0, 0.1);
  tl.call(place, [], 0);
  tl.addLabel("title", 0.5);
  b.title(endingCard(ctx.params), Math.min(0.5, D * 0.1), D - 1.0);
  tl.addLabel("hero", D - 0.8);
  b.cue("fade_cream", D - 0.8);
};
