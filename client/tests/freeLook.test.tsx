// Free look and interact mode (§F10.3): mode transitions, head limits, lean and collision clamp,
// settle target picking, the empty-space / control click rules, and the HUD hint.
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rig, SHOTS, STATION_SHOT } from "../src/cinematics/cameraRig";
import { STATION_FACES } from "../src/content/stations";
import type { StationId } from "../src/net/protocol";
import {
  addMouse,
  anglesOf,
  applyFreeLook,
  clampEye,
  dirFor,
  freeLookEvents,
  head,
  leanFor,
  LOOK,
  nextLookMode,
  pickSettleStation,
  pokeAllowed,
  pointer,
  resetHead,
  SEAT_EYE,
  setHead,
  settleTargetFor,
  startSettle,
} from "../src/scene/freeLookHead";
import { useStore } from "../src/state/store";
import { FreeLookHint } from "../src/ui/FreeLookHint";
import { HINT_USES, hintKeyFor } from "../src/ui/lookHint";
import { gameState, roomState } from "./fixtures/messages";

// The hook reads gl / camera / scene from the R3F root; give it a plain canvas and a tiny scene.
const three = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock("@react-three/fiber", async (orig) => {
  const real = await orig<typeof import("@react-three/fiber")>();
  return {
    ...real,
    useThree: (sel: (s: Record<string, unknown>) => unknown) => sel(three.current ?? {}),
  };
});

const { useFreeLook } = await import("../src/scene/useFreeLook");

const toward = (p: readonly [number, number, number]) =>
  new Vector3(...p).sub(SEAT_EYE).normalize();

describe("mode transitions (§F10.3)", () => {
  it("enter → look on lock, look → interact on freeze or Esc, interact → look on re-lock", () => {
    expect(nextLookMode("off", { type: "activate", locked: false })).toBe("enter");
    expect(nextLookMode("off", { type: "activate", locked: true })).toBe("look");
    expect(nextLookMode("enter", { type: "locked" })).toBe("look");
    expect(nextLookMode("look", { type: "freeze" })).toBe("interact");
    expect(nextLookMode("look", { type: "unlocked" })).toBe("interact"); // Esc / typing
    expect(nextLookMode("interact", { type: "unlocked" })).toBe("interact");
    expect(nextLookMode("interact", { type: "locked" })).toBe("look");
  });

  it("a cinematic switches it off; lock changes while off are ignored", () => {
    for (const m of ["enter", "look", "interact"] as const) {
      expect(nextLookMode(m, { type: "deactivate" })).toBe("off");
    }
    expect(nextLookMode("off", { type: "locked" })).toBe("off");
    expect(nextLookMode("off", { type: "unlocked" })).toBe("off");
    expect(nextLookMode("off", { type: "freeze" })).toBe("off");
    expect(nextLookMode("interact", { type: "activate", locked: false })).toBe("interact");
  });
});

describe("head limits, lean and collision clamp", () => {
  beforeEach(() => resetHead());

  it("clamps yaw to ±110° and pitch to −55…+60°", () => {
    addMouse(-100_000, 100_000, 0.15);
    expect(head.yaw).toBe(LOOK.yawMax);
    expect(head.pitch).toBe(LOOK.pitchMin);
    addMouse(100_000, -100_000, 0.15);
    expect(head.yaw).toBe(-LOOK.yawMax);
    expect(head.pitch).toBe(LOOK.pitchMax);
  });

  it("turns by sensitivity degrees per pixel (no Y inversion), clamped to 0.05–0.4", () => {
    addMouse(10, 0, 0.15); // right
    expect(head.yaw).toBeCloseTo(-1.5);
    addMouse(0, -10, 0.15); // up
    expect(head.pitch).toBeCloseTo(1.5);
    resetHead();
    addMouse(10, 0, 5);
    expect(head.yaw).toBeCloseTo(-4);
  });

  it("leans ≤ 25 cm forward/down toward the panels, ≤ 20 cm toward a side window", () => {
    const v = new Vector3();
    expect(leanFor(0, 0, v).length()).toBeCloseTo(0);
    const fwd = leanFor(20, -50, v).clone();
    expect(fwd.length()).toBeGreaterThan(0.2);
    expect(fwd.length()).toBeLessThanOrEqual(LOOK.leanForward + 1e-9);
    expect(fwd.z).toBeLessThan(0);
    expect(fwd.y).toBeLessThan(0);
    const right = leanFor(-100, 0, v).clone();
    expect(right.x).toBeCloseTo(LOOK.leanSide);
    const left = leanFor(100, 0, v).clone();
    expect(left.x).toBeCloseTo(-LOOK.leanSide);
    expect(leanFor(-50, 0, v).length()).toBeCloseTo(0); // no side lean below 60°
  });

  it("never brings the eye within 6 cm of cockpit geometry, over the whole look range", () => {
    const v = new Vector3();
    for (let yaw = -110; yaw <= 110; yaw += 10) {
      for (let pitch = -55; pitch <= 60; pitch += 5) {
        const eye = clampEye(leanFor(yaw, pitch, v).add(SEAT_EYE));
        expect(eye.distanceTo(SEAT_EYE)).toBeLessThanOrEqual(0.33);
        expect(clampEye(eye.clone()).distanceTo(eye)).toBeCloseTo(0); // already clear
      }
    }
  });

  it("pushes a point inside an obstacle out to the 6 cm clearance", () => {
    const inside = clampEye(new Vector3(0, 0.8, -0.45)); // in the pedestal
    expect(inside.y).toBeCloseTo(0.94 + LOOK.clearance);
    const out = clampEye(new Vector3(5, 5, 5)); // outside the cabin
    expect(out.x).toBeCloseTo(1.18 - LOOK.clearance);
    expect(out.y).toBeCloseTo(2.26 - LOOK.clearance);
  });
});

describe("settle target picking", () => {
  it("picks the station whose panel the view ray hits", () => {
    for (const id of Object.keys(STATION_FACES) as StationId[]) {
      const dir = toward(STATION_FACES[id].center);
      expect(pickSettleStation(SEAT_EYE.clone(), dir), id).toBe(id);
    }
  });

  it("falls back to the nearest panel within 25°, and to none beyond", () => {
    const a = anglesOf(toward(STATION_FACES.front.center));
    // 15° to the right of the front panel's centre: still off the panel's right edge? either way front
    const near = dirFor(a.yaw - 15, a.pitch + 12, new Vector3());
    expect(pickSettleStation(SEAT_EYE.clone(), near)).toBe("front");
    const window = dirFor(-90, 0, new Vector3());
    expect(pickSettleStation(SEAT_EYE.clone(), window)).toBeNull();
    const back = dirFor(0, 0, new Vector3()).negate();
    expect(pickSettleStation(SEAT_EYE.clone(), back)).toBeNull();
  });

  it("keeps the player's spot on the panel and moves the eye toward the station shot", () => {
    const shot = SHOTS[STATION_SHOT.pedestal];
    const eye = SEAT_EYE.clone();
    const spot = new Vector3(...STATION_FACES.pedestal.center).add(new Vector3(0.1, 0, 0));
    const dir = spot.clone().sub(eye).normalize();
    const t = settleTargetFor("pedestal", eye, dir, new Vector3());
    const next = SEAT_EYE.clone().add(t.offset);
    // the eye moved toward the shot's eye, within the limit
    expect(next.distanceTo(new Vector3(...shot.position))).toBeLessThan(
      SEAT_EYE.distanceTo(new Vector3(...shot.position)),
    );
    expect(t.offset.length()).toBeLessThanOrEqual(LOOK.settleMaxOffset + 1e-9);
    // the new view runs between the player's spot and the shot's aim point
    const view = dirFor(t.yaw, t.pitch, new Vector3());
    const toSpot = spot.clone().sub(next).normalize();
    const toShot = new Vector3(...shot.target).sub(next).normalize();
    const between = toSpot.angleTo(toShot);
    expect(view.angleTo(toSpot)).toBeLessThan(between);
    expect(view.angleTo(toShot)).toBeLessThan(between);
    expect(view.angleTo(toSpot)).toBeLessThan(view.angleTo(toShot)); // mostly the player's spot
  });

  it("eases the settle over 0.3 s and stays exactly put when no panel is near", () => {
    resetHead();
    head.mode = "look";
    const a = anglesOf(toward(STATION_FACES.pedestal.center));
    setHead(a.yaw, a.pitch);
    expect(startSettle()).toBe("pedestal");
    head.mode = "interact";
    const to = { yaw: head.settle?.toYaw, pitch: head.settle?.toPitch };
    for (let i = 0; i < 20; i++) applyFreeLook(new Vector3(), new Vector3(0, 0, -1), 1 / 60);
    expect(head.sYaw).toBeCloseTo(to.yaw ?? NaN);
    expect(head.sPitch).toBeCloseTo(to.pitch ?? NaN);

    setHead(-90, 0);
    head.mode = "look";
    expect(startSettle()).toBeNull();
    head.mode = "interact";
    applyFreeLook(new Vector3(), new Vector3(0, 0, -1), 0.1);
    expect(head.sYaw).toBe(-90);
  });
});

describe("settle framing (§F10.3)", () => {
  /** NDC extents of the panel's four corners after settling, at the real FOV 55° and 1440×900. */
  function settledExtent(id: StationId, spot: Vector3) {
    resetHead();
    head.mode = "look";
    const a = anglesOf(spot.clone().sub(SEAT_EYE));
    setHead(a.yaw, a.pitch);
    expect(startSettle()).toBe(id);
    head.mode = "interact";
    for (let i = 0; i < 30; i++) applyFreeLook(new Vector3(), new Vector3(0, 0, -1), 1 / 60);
    const eye = clampEye(SEAT_EYE.clone().add(head.offset));
    const cam = new PerspectiveCamera(55, 1440 / 900, 0.03, 100);
    cam.position.copy(eye);
    cam.lookAt(eye.clone().add(dirFor(head.sYaw, head.sPitch, new Vector3())));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const f = STATION_FACES[id];
    const center = new Vector3(...f.center);
    const normal = new Vector3(...f.target).sub(center).normalize();
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), normal).normalize();
    const up = new Vector3().crossVectors(normal, right).normalize();
    let max = 0;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const c = center
          .clone()
          .addScaledVector(right, (sx * f.size[0]) / 2)
          .addScaledVector(up, (sy * f.size[1]) / 2)
          .project(cam);
        max = Math.max(max, Math.abs(c.x), Math.abs(c.y));
      }
    }
    return max;
  }

  it.each(["overhead", "pedestal", "front"] as const)(
    "frames the whole %s panel inside the view (margin 4%)",
    (id) => {
      const f = STATION_FACES[id];
      const c = new Vector3(...f.center);
      const spots = [
        c.clone(),
        c.clone().add(new Vector3(f.size[0] * 0.3, f.size[1] * 0.3, 0)),
        c.clone().add(new Vector3(-f.size[0] * 0.3, f.size[1] * 0.3, 0)),
      ];
      for (const spot of spots) expect(settledExtent(id, spot)).toBeLessThan(0.96);
    },
  );
});

describe("applyFreeLook (camera blend)", () => {
  beforeEach(() => resetHead());

  it("leaves the rig's pose untouched while off", () => {
    const p = new Vector3(1, 2, 3);
    const l = new Vector3(0, 0, 0);
    applyFreeLook(p, l, 1 / 60);
    expect(p.toArray()).toEqual([1, 2, 3]);
    expect(l.toArray()).toEqual([0, 0, 0]);
  });

  it("eases into the head pose over 0.4 s once active", () => {
    head.mode = "look";
    setHead(-80, 0);
    const p = new Vector3();
    const l = new Vector3();
    for (let i = 0; i < 12; i++) {
      p.set(0.5, 1.3, 0.35);
      l.set(0.2, 1.0, -1.0);
      applyFreeLook(p, l, 1 / 60);
    }
    expect(head.weight).toBeCloseTo(0.5, 1); // 0.2 s of 0.4 s
    for (let i = 0; i < 30; i++) {
      p.set(0.5, 1.3, 0.35);
      l.set(0.2, 1.0, -1.0);
      applyFreeLook(p, l, 1 / 60);
    }
    expect(head.weight).toBe(1);
    const dir = l.clone().sub(p).normalize();
    expect(anglesOf(dir).yaw).toBeCloseTo(-80, 0);
  });
});

describe("applyFreeLook hand-over on a cut", () => {
  afterEach(() => {
    rig.position.set(...SHOTS.FLYER_DEFAULT.position);
    resetHead();
  });

  it("snaps to the rig at once when a cinematic cuts away (no 0.4 s flight across the set)", () => {
    resetHead();
    head.mode = "look";
    head.weight = 1;
    head.mode = "off";
    rig.position.set(...SHOTS.EXT_SIDE.position);
    const p = rig.position.clone();
    const l = new Vector3(...SHOTS.EXT_SIDE.target);
    applyFreeLook(p, l, 1 / 60);
    expect(head.weight).toBe(0);
    expect(p.toArray()).toEqual([...SHOTS.EXT_SIDE.position]);
  });
});

describe("R3F events in look mode", () => {
  afterEach(() => {
    pointer.locked = false;
  });

  it("raycasts from the screen centre while the pointer is locked", () => {
    const events = freeLookEvents(
      {} as unknown as Parameters<typeof freeLookEvents>[0], // the factory only stores it
    );
    const camera = new PerspectiveCamera();
    const state = {
      pointer: new Vector2(),
      raycaster: new Raycaster(),
      camera,
      size: { width: 1000, height: 500 },
    };
    const ev = { offsetX: 100, offsetY: 400 };
    const compute = events.compute;
    if (!compute) throw new Error("no compute");
    const call = () =>
      compute(
        ev as unknown as Parameters<typeof compute>[0],
        state as unknown as Parameters<typeof compute>[1],
      );
    call();
    expect(state.pointer.x).toBeCloseTo(-0.8);
    pointer.locked = true;
    call();
    expect(state.pointer.toArray()).toEqual([0, 0]);
  });
});

describe("useFreeLook (pointer lock, clicks, typing, cinematics)", () => {
  let canvas: HTMLCanvasElement;
  let lockEl: Element | null;
  const requestPointerLock = vi.fn();
  const exitPointerLock = vi.fn();

  const setLock = (el: Element | null) => {
    lockEl = el;
    act(() => {
      document.dispatchEvent(new Event("pointerlockchange"));
    });
  };
  const move = (dx: number, dy: number) =>
    act(() => {
      // jsdom's MouseEvent ignores movementX/Y in its init dict.
      const e = new MouseEvent("mousemove");
      Object.defineProperty(e, "movementX", { value: dx });
      Object.defineProperty(e, "movementY", { value: dy });
      document.dispatchEvent(e);
    });
  const down = (x: number, y: number) =>
    act(() => {
      canvas.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y }),
      );
    });

  beforeEach(() => {
    resetHead();
    useStore.getState().reset();
    lockEl = null;
    canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100);
    canvas.requestPointerLock = requestPointerLock;
    document.body.appendChild(canvas);
    Object.defineProperty(document, "pointerLockElement", {
      configurable: true,
      get: () => lockEl,
    });
    document.exitPointerLock = exitPointerLock;
    requestPointerLock.mockReset();
    exitPointerLock.mockReset();

    // A pedestal with one real control in the middle of the view (camera at the origin, −Z).
    const scene = new Scene();
    const station = new Group();
    station.name = "station-pedestal";
    const control = new Group();
    control.name = "PD_LEVER_1";
    const mesh = new Mesh(new BoxGeometry(0.4, 0.4, 0.1), new MeshBasicMaterial());
    control.add(mesh);
    control.position.set(0, 0, -2);
    station.add(control);
    scene.add(station);
    scene.updateMatrixWorld(true);
    const camera = new PerspectiveCamera(55, 2, 0.03, 100);
    camera.updateMatrixWorld(true);
    three.current = { gl: { domElement: canvas }, camera, scene };

    act(() => {
      useStore.getState().receive(roomState({ status: "PLAYING" }));
      useStore.getState().receive(gameState());
    });
  });

  afterEach(() => {
    cleanup();
    canvas.remove();
    pointer.locked = false;
  });

  it("goes enter → look (pointer lock) → interact (freeze) → look on an empty click", () => {
    renderHook(() => useFreeLook(true));
    expect(useStore.getState().look.mode).toBe("enter");

    down(100, 50);
    expect(requestPointerLock).toHaveBeenCalledTimes(1);
    setLock(canvas);
    expect(useStore.getState().look.mode).toBe("look");

    const before = head.yaw;
    move(20, 0);
    expect(head.yaw).toBeCloseTo(before - 20 * 0.15); // mouse right → head right, 0.15°/px

    down(100, 50); // freeze
    expect(exitPointerLock).toHaveBeenCalledTimes(1);
    expect(useStore.getState().look.mode).toBe("interact");
    setLock(null);
    expect(useStore.getState().look.mode).toBe("interact");

    const yaw = head.yaw;
    move(50, 0);
    expect(head.yaw).toBe(yaw); // the view stays still in interact mode

    requestPointerLock.mockReset();
    down(195, 5); // the corner: nothing there
    expect(requestPointerLock).toHaveBeenCalledTimes(1);
    setLock(canvas);
    expect(useStore.getState().look.mode).toBe("look");
  });

  it("a click on a control in interact mode keeps interact mode", () => {
    renderHook(() => useFreeLook(true));
    down(100, 50);
    setLock(canvas);
    down(100, 50);
    setLock(null);
    requestPointerLock.mockReset();
    down(100, 50); // the control in the centre
    expect(requestPointerLock).not.toHaveBeenCalled();
    expect(useStore.getState().look.mode).toBe("interact");
  });

  it("Esc (the browser releases the lock) → interact; focusing an input releases the lock", () => {
    renderHook(() => useFreeLook(true));
    down(100, 50);
    setLock(canvas);
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => input.focus());
    expect(exitPointerLock).toHaveBeenCalled();
    setLock(null);
    expect(useStore.getState().look.mode).toBe("interact");
    input.remove();
  });

  it("a cinematic (input_locked) switches it off and ignores the mouse; unlock resumes look", () => {
    renderHook(() => useFreeLook(true));
    down(100, 50);
    setLock(canvas);
    act(() => useStore.getState().receive(gameState({ input_locked: true })));
    expect(useStore.getState().look.mode).toBe("off");
    const yaw = head.yaw;
    move(50, 0);
    expect(head.yaw).toBe(yaw);
    exitPointerLock.mockReset(); // the cinematic start already released the lock
    down(100, 50);
    expect(exitPointerLock).not.toHaveBeenCalled();
    // the pointer stayed locked through the cinematic: straight back into look mode
    act(() => useStore.getState().receive(gameState({ input_locked: false })));
    expect(useStore.getState().look.mode).toBe("look");
  });

  it("releases the pointer lock when a cinematic starts, and re-enters in enter mode after", () => {
    renderHook(() => useFreeLook(true));
    down(100, 50);
    setLock(canvas);
    exitPointerLock.mockReset();
    act(() => useStore.getState().receive(gameState({ input_locked: true })));
    expect(exitPointerLock).toHaveBeenCalledTimes(1);
    setLock(null);
    expect(useStore.getState().look.mode).toBe("off");
    act(() => useStore.getState().receive(gameState({ input_locked: false })));
    expect(useStore.getState().look.mode).toBe("enter"); // unlocked → needs a click again
  });

  it.each(["CRASH", "ENDING", "PAUSED"] as const)(
    "releases the pointer lock when the status becomes %s (Retry / Skip stay clickable)",
    (status) => {
      renderHook(() => useFreeLook(true));
      down(100, 50);
      setLock(canvas);
      exitPointerLock.mockReset();
      act(() => useStore.getState().receive(roomState({ status })));
      expect(exitPointerLock).toHaveBeenCalledTimes(1);
      setLock(null);
      expect(useStore.getState().look.mode).toBe("off");
    },
  );

  it("Esc eases to interact with the 0.3 s settle; a deactivation does not settle", () => {
    renderHook(() => useFreeLook(true));
    down(100, 50);
    setLock(canvas);
    const a = anglesOf(toward(STATION_FACES.pedestal.center));
    setHead(a.yaw, a.pitch);
    setLock(null); // Esc
    expect(useStore.getState().look.mode).toBe("interact");
    expect(head.settle).not.toBeNull();
    expect(head.settle?.t).toBe(0);

    resetHead();
    useStore.getState().reset();
    cleanup();
    act(() => {
      useStore.getState().receive(roomState({ status: "PLAYING" }));
      useStore.getState().receive(gameState());
    });
    renderHook(() => useFreeLook(true));
    down(100, 50);
    setLock(canvas);
    setHead(a.yaw, a.pitch);
    act(() => useStore.getState().receive(gameState({ input_locked: true })));
    setLock(null);
    expect(head.settle).toBeNull();
  });

  it("the freezing click does not poke the hands, whatever the listener order; later clicks do", () => {
    const early: boolean[] = [];
    const late: boolean[] = [];
    canvas.addEventListener("pointerdown", (e) => early.push(pokeAllowed(e))); // before the hook
    renderHook(() => useFreeLook(true));
    canvas.addEventListener("pointerdown", (e) => late.push(pokeAllowed(e))); // after it
    down(100, 50);
    setLock(canvas);
    expect([early, late]).toEqual([[false], [false]]); // look-mode click: no poke
    down(100, 50); // freeze
    expect([early, late]).toEqual([
      [false, false],
      [false, false],
    ]);
    setLock(null);
    down(100, 50); // a control click in interact mode
    expect([early[2], late[2]]).toEqual([true, true]);
  });

  it("does nothing when disabled (sandboxes, the Tower)", () => {
    renderHook(() => useFreeLook(false));
    down(100, 50);
    expect(requestPointerLock).not.toHaveBeenCalled();
    expect(useStore.getState().look.mode).toBe("off");
  });
});

describe("HUD hint and the sensitivity setting", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });
  afterEach(cleanup);

  it("shows enter always and each mode's hint for its first 3 uses", () => {
    expect(hintKeyFor("off", { look: 0, interact: 0 })).toBeNull();
    expect(hintKeyFor("enter", { look: 9, interact: 9 })).toBe("look.hint_enter");
    expect(hintKeyFor("look", { look: HINT_USES, interact: 0 })).toBe("look.hint_look");
    expect(hintKeyFor("look", { look: HINT_USES + 1, interact: 0 })).toBeNull();
    expect(hintKeyFor("interact", { look: 0, interact: 1 })).toBe("look.hint_interact");
  });

  it("counts mode uses in the store", () => {
    const { setLookMode } = useStore.getState();
    for (let i = 0; i < 4; i++) {
      setLookMode("look");
      setLookMode("interact");
    }
    expect(useStore.getState().look.uses).toEqual({ look: 4, interact: 4 });
  });

  it("renders in the viewer's language (Hindi for a Hindi Flyer)", () => {
    act(() => {
      useStore.getState().setUiLang("hi");
      useStore.getState().setLookMode("enter");
    });
    render(<FreeLookHint />);
    expect(screen.getByTestId("free-look-hint").textContent).toBe("चारों ओर देखने के लिए क्लिक करो");
    act(() => useStore.getState().setUiLang("en"));
    expect(screen.getByTestId("free-look-hint").textContent).toBe("Click to look around");
  });

  it("saves the sensitivity in wingin:settings (default 0.15)", () => {
    expect(useStore.getState().settings.sensitivity).toBe(0.15);
    useStore.getState().setSettings({ sensitivity: 0.3 });
    const saved: unknown = JSON.parse(localStorage.getItem("wingin:settings") ?? "{}");
    expect(saved).toMatchObject({ sensitivity: 0.3 });
  });
});
