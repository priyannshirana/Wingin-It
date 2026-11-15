// Free look DOM wiring (§F10.3): pointer lock, mouse → head, look/interact clicks, Esc and typing.
// Runs inside the cockpit <Canvas>; the head math and the mode reducer live in scene/freeLookHead.ts.
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import {
  type Camera,
  type Intersection,
  type Object3D,
  Raycaster,
  type Scene,
  Vector2,
} from "three";
import { STATIONS_FILE } from "../content/stations";
import { useStore, type StoreState } from "../state/store";
import { isTypingTarget } from "../ui/isTypingTarget";
import { assertNever } from "../util/assertNever";
import {
  addMouse,
  faceStation,
  head,
  type LookEvent,
  nextLookMode,
  pointer,
  resetHead,
  startSettle,
} from "./freeLookHead";

/** Every control id in stations.json: a click on any of them (even inert) keeps interact mode. */
const CONTROL_IDS: ReadonlySet<string> = new Set(
  STATIONS_FILE.stations.flatMap((s) => s.controls.map((c) => c.id)),
);
const STATION_NAMES = ["station-overhead", "station-pedestal", "station-front"];

/** Free look runs only while PLAYING with input unlocked and no local timeline. */
export function selectLookActive(s: StoreState): boolean {
  return s.status === "PLAYING" && s.game?.input_locked !== true && !s.cinePlaying;
}

export function dispatchLook(ev: LookEvent): void {
  head.mode = nextLookMode(head.mode, ev);
  useStore.getState().setLookMode(head.mode);
}

const caster = new Raycaster();
const ndc = new Vector2();
const hits: Intersection[] = [];

/** The control id of a hit mesh (walking up to the StationGroup's named control group). */
export function controlIdOf(o: Object3D | null): string | null {
  let cur = o;
  while (cur) {
    if (cur.name && CONTROL_IDS.has(cur.name)) return cur.name;
    cur = cur.parent;
  }
  return null;
}

/** Whether the first thing on a station under the pointer is a control. */
function hitsControl(e: PointerEvent, el: HTMLElement, camera: Camera, scene: Scene): boolean {
  const rect = el.getBoundingClientRect();
  ndc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  caster.setFromCamera(ndc, camera);
  hits.length = 0;
  for (const name of STATION_NAMES) {
    const station = scene.getObjectByName(name);
    if (station) caster.intersectObject(station, true, hits);
  }
  hits.sort((a, b) => a.distance - b.distance);
  const first = hits[0];
  hits.length = 0;
  return first ? controlIdOf(first.object) !== null : false;
}

function requestLock(el: HTMLElement): void {
  try {
    // Chrome returns a promise (rejected e.g. right after an Esc); older engines return nothing.
    const result: unknown = el.requestPointerLock();
    if (result instanceof Promise) result.catch(() => dispatchLook({ type: "lock_failed" }));
  } catch {
    // No pointer lock (jsdom, embedded without permission): stay in interact mode.
    dispatchLook({ type: "lock_failed" });
  }
}

function exitLock(): void {
  if (document.pointerLockElement) document.exitPointerLock();
}

/** Mounts free look on the cockpit canvas while `enabled` (the Flyer's real screen). */
export function useFreeLook(enabled: boolean): void {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  // Activation follows the store (PLAYING, unlocked, no cinematic).
  useEffect(() => {
    if (!enabled) return;
    const sync = (s: StoreState) => {
      const active = selectLookActive(s);
      if (active && head.mode === "off") {
        // Start of play or the end of a cinematic: face the current station, ease in (0.4 s).
        // SPEC-ASSUMPTION: after a refresh / rejoin (or any resume while unlocked) look mode starts
        // in "enter" — pointer lock needs a user gesture, so the first click re-locks it (§F10.3).
        faceStation(s.flyer.station);
        dispatchLook({ type: "activate", locked: pointer.locked });
      } else if (!active && head.mode !== "off") {
        dispatchLook({ type: "deactivate" });
        exitLock(); // a cinematic, pause, crash or landing needs the cursor (Skip, Retry)
      }
    };
    sync(useStore.getState());
    const unsub = useStore.subscribe(sync);
    return () => {
      unsub();
      dispatchLook({ type: "deactivate" });
      head.weight = 0;
      resetHead();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;
    const onLockChange = () => {
      const locked = document.pointerLockElement === el;
      if (locked === pointer.locked) return;
      pointer.locked = locked;
      // Esc / tab hidden: look → interact eases over 0.3 s like a click-freeze (not when off).
      if (!locked && head.mode === "look") startSettle();
      dispatchLook({ type: locked ? "locked" : "unlocked" });
    };
    const onMove = (e: MouseEvent) => {
      if (!pointer.locked || head.mode !== "look") return;
      addMouse(e.movementX, e.movementY, useStore.getState().settings.sensitivity);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      switch (head.mode) {
        case "look":
          // Freeze: settle onto the nearest panel and show the cursor. R3F handles the same
          // event from the screen centre (freeLookEvents), so a control there is clicked too.
          head.frozeBy = e;
          startSettle();
          dispatchLook({ type: "freeze" });
          exitLock();
          return;
        case "interact":
          if (!hitsControl(e, el, camera, scene)) requestLock(el);
          return;
        case "enter":
          requestLock(el);
          return;
        case "off":
          return;
        default:
          return assertNever(head.mode);
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (isTypingTarget(e.target)) exitLock();
    };
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("focusin", onFocus);
    el.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("focusin", onFocus);
      el.removeEventListener("pointerdown", onDown);
      if (document.pointerLockElement === el) document.exitPointerLock();
      pointer.locked = false;
    };
  }, [enabled, gl, camera, scene]);
}
