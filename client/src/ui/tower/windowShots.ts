import type { WindowShot } from "../../cinematics/towerWindowClock";

// The three Tower-window shots (§F12.7) as pure functions of shot progress u (0..1). Meters,
// relative to the exterior-plane stage origin; the plane flies along -Z (nose first), and the
// tower stands 46 m beside the runway's middle, 12 m up, so the plane crosses the view left to
// right. Nothing here reads the store: the Tower never learns the fire side (§A10), so every
// pose is symmetric by construction (one roll angle, one prop speed for both engines).

export const TOWER_CAM = { x: 46, y: 10.8, z: -300 } as const;

/** Shot lengths in seconds as the timelines lay them out (full variants; demo scales them). */
export const CRASH_POOF_U = 2.6 / 3.2;
export const LANDING_TOUCH_U = 0.3;
export const TAKEOFF_LIFT_U = 0.5;

export interface Pose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  roll: number;
  /** 0 hides the plane (the crash POOF swallows it). */
  vis: number;
  props: number;
}

export const newPose = (): Pose => ({ x: 0, y: 0, z: 0, pitch: 0, roll: 0, vis: 1, props: 1 });

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const k = clamp01(v);
  return k * k * (3 - 2 * k);
};

/** The plane's pose at shot progress `u`, written into `out` (no allocation). */
export function planePose(shot: WindowShot, u0: number, out: Pose): Pose {
  const u = clamp01(u0);
  out.vis = 1;
  out.x = 0;
  switch (shot) {
    case "takeoff": {
      if (u < TAKEOFF_LIFT_U) {
        const v = u / TAKEOFF_LIFT_U; // the roll accelerates, wheels on the strip
        out.z = -120 - 180 * v * v;
        out.y = 0;
        out.pitch = 0;
        out.roll = 0;
        out.props = 0.55 + 0.45 * v;
      } else {
        const w = (u - TAKEOFF_LIFT_U) / (1 - TAKEOFF_LIFT_U); // climb away into the dusk
        out.z = -300 - 420 * w;
        out.y = 150 * Math.pow(w, 1.7);
        out.pitch = 0.3 * smooth(w * 3);
        out.roll = 0.1 * Math.sin(w * 3.2);
        out.props = 1;
      }
      return out;
    }
    case "landing": {
      if (u < LANDING_TOUCH_U) {
        const v = u / LANDING_TOUCH_U; // the glide in from the left
        out.z = 340 - 230 * v;
        out.y = 24 * Math.pow(1 - v, 1.3);
        out.pitch = 0.09 * v;
        out.roll = 0;
        out.props = 1;
      } else {
        const v = (u - LANDING_TOUCH_U) / (1 - LANDING_TOUCH_U); // braking to a stop by the tower
        out.z = 110 - 400 * (1 - Math.pow(1 - v, 2.2));
        const hop = u < LANDING_TOUCH_U + 0.1 ? (u - LANDING_TOUCH_U) / 0.1 : 1; // one toy bounce
        out.y = hop < 1 ? 0.9 * Math.sin(Math.PI * hop) : 0;
        out.pitch = 0.09 * (1 - smooth(v * 5));
        out.roll = 0;
        out.props = 1 - 0.7 * smooth(v * 1.4); // both props wind down together
      }
      return out;
    }
    case "crash": {
      const v = clamp01(u / CRASH_POOF_U);
      const ang = v * Math.PI * 4;
      out.x = -10 + 8 * Math.cos(ang) * v;
      out.y = 75 - 55 * v * v + 6 * Math.sin(ang) * v;
      out.z = -360 - 60 * v;
      out.roll = v * v * Math.PI * 4; // 720° of cartoon roll
      out.pitch = 0.8 * smooth(v * 1.5);
      out.props = 1;
      out.vis = u >= CRASH_POOF_U ? 0 : 1;
      return out;
    }
    default: {
      const never: never = shot;
      throw new Error(`unknown window shot ${String(never)}`);
    }
  }
}

/** How far behind the plane the camera's gaze trails (shot progress): the slow follow-pan. */
export const LOOK_LAG_U = 0.008;
