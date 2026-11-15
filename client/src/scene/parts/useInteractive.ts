// Part interaction (§F9.5) and optimistic motion with bounce (§F9.6).
import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ControlDef } from "../../content/stations";
import type { ObjectState, Verb } from "../../net/protocol";
import { sfx } from "../../audio/sfx";
import { send } from "../../net/socket";
import { selectInteractive } from "../../state/selectors";
import { useStore } from "../../state/store";

const DOUBLE_FIRE_MS = 80;
const CONFIRM_TIMEOUT_MS = 800;
const BOUNCE = { duration: 0.35, ease: "elastic.out(1, 0.4)" };

/** The verb a click sends for this part in its current server state (§A6, §F9.5). */
export function verbFor(
  control: Pick<ControlDef, "type">,
  state: ObjectState | undefined,
  shift: boolean,
): Verb | null {
  switch (control.type) {
    case "PushButton":
      return "press";
    case "ToggleSwitch":
      return "toggle";
    case "PullHandle":
      return state?.kind === "handle" && state.value === "out" ? null : "pull";
    case "UpDownLever":
      return state?.kind === "lever" && state.value === "down" ? "move_up" : "move_down";
    case "NotchLever":
      return shift ? "move_up" : "move_down";
    case "Lamp":
    case "FuelGauge":
    case "Screen":
      return null;
    default:
      return null;
  }
}

/** The state a verb would lead to, for the optimistic pose (the server decides the truth). */
export function predictState(state: ObjectState | undefined, verb: Verb): ObjectState | undefined {
  if (!state) return state;
  switch (state.kind) {
    case "toggle":
      return verb === "toggle"
        ? { kind: "toggle", value: state.value === "on" ? "off" : "on" }
        : state;
    case "handle":
      return verb === "pull" ? { kind: "handle", value: "out" } : state;
    case "lever":
      if (verb === "move_down") return { kind: "lever", value: "down" };
      if (verb === "move_up") return { kind: "lever", value: "up" };
      return state;
    case "notch": {
      if (verb === "move_down") return { kind: "notch", value: state.value === 0 ? 1 : 2 };
      if (verb === "move_up") return { kind: "notch", value: state.value === 2 ? 1 : 0 };
      return state;
    }
    default:
      return state;
  }
}

export interface PoseMotion {
  duration: number;
  ease: string;
}

/**
 * An animated pose value for one part. It follows the server state (springing back with
 * `elastic.out` on `bounce`), and `predict()` moves it at once toward a predicted state; if no
 * `object_state` for this part arrives within 800 ms it springs back to the server state.
 * The value lives in a plain object that `useFrame` reads, so no React state changes per frame.
 */
export function usePose(
  id: string,
  poseOf: (state: ObjectState | undefined) => number,
  motion: PoseMotion,
) {
  const anim = useMemo(() => ({ v: poseOf(useStore.getState().flyer.objects[id]) }), [id, poseOf]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let prevState = useStore.getState().flyer.objects[id];
    let prevTick = useStore.getState().bounceTick[id] ?? 0;
    const unsubscribe = useStore.subscribe((s) => {
      const state = s.flyer.objects[id];
      const tick = s.bounceTick[id] ?? 0;
      if (state === prevState && tick === prevTick) return;
      const bounced = tick !== prevTick;
      prevState = state;
      prevTick = tick;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      gsap.to(anim, { v: poseOf(state), ...(bounced ? BOUNCE : motion), overwrite: true });
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
      gsap.killTweensOf(anim);
    };
  }, [id, anim, poseOf, motion]);

  function predict(state: ObjectState | undefined) {
    gsap.to(anim, { v: poseOf(state), ...motion, overwrite: true });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      gsap.to(anim, {
        v: poseOf(useStore.getState().flyer.objects[id]),
        ...BOUNCE,
        overwrite: true,
      });
    }, CONFIRM_TIMEOUT_MS);
  }

  return { anim, predict };
}

/**
 * Hover + click for a part. Interactive iff the id is in `flyer.interactive` and input isn't
 * locked; otherwise the part renders but ignores the pointer. `onLocal(verb)` runs the
 * optimistic motion right after the intent is sent.
 */
export function useInteractive(control: ControlDef, onLocal?: (verb: Verb) => void) {
  const interactive = useStore((s) => selectInteractive(s, control.id));
  const [hovered, setHovered] = useState(false);
  const lastClick = useRef(0);
  const hot = hovered && interactive;
  useCursor(hot);

  const handlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
    },
    onPointerOut: () => setHovered(false),
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (!selectInteractive(useStore.getState(), control.id)) return;
      const now = performance.now();
      if (now - lastClick.current < DOUBLE_FIRE_MS) return; // hardware double-fire
      lastClick.current = now;
      const state = useStore.getState().flyer.objects[control.id];
      const verb = verbFor(control, state, e.shiftKey);
      if (!verb) return;
      send({ type: "interact", object_id: control.id, verb });
      // §F9.5: click for buttons and switches, clunk for handles and levers, played at once.
      sfx.play(
        control.type === "PushButton" || control.type === "ToggleSwitch" ? "click" : "clunk",
      );
      onLocal?.(verb);
    },
  };

  return { interactive, hovered: hot, handlers };
}
