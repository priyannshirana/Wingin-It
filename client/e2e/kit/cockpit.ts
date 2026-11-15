// Clicking a control in the Flyer's 3D cockpit like a player: a real mouse click on the canvas
// at the control's on-screen position. Where that is comes from the live scene (the dev server
// serves the same ES modules the app runs, so importing them in the page gives the same
// instances): the control's group is named by its object id (StationGroup), and the camera pose
// is the rig plus the free-look head the CameraRigDriver applies (fov from cameraFov). The click itself goes through
// R3F's raycaster and the part's own handler, so the client's `interact` is what gets tested.
import { expect, type Frame } from "@playwright/test";

export interface ScreenPoint {
  x: number;
  y: number;
  /** Canvas size in CSS pixels. */
  w: number;
  h: number;
}

// Runs in the page. Plain JS on purpose: it reaches into live module instances by URL.
const PROJECT = `async (id) => {
  const refs = await import("/src/scene/sceneRefs.ts");
  let root = refs.getRef("cockpit");
  while (root && root.parent) root = root.parent; // the scene
  const obj = root && root.getObjectByName(id);
  const canvas = document.querySelector("canvas");
  if (!obj || !canvas) return null;
  obj.updateWorldMatrix(true, true);
  let box = null;
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry || "text" in o) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    box = box ? box.union(b) : b;
  });
  // The camera the CameraRigDriver builds: the rig pose, the free-look head on top, then roll.
  const head = await import("/src/scene/freeLookHead.ts");
  const fov = await import("/src/scene/cameraFov.ts");
  const cam = refs.rig.position.clone();
  const look = refs.rig.target.clone();
  look.y += Math.tan((refs.rig.pitchOffset * Math.PI) / 180) * cam.distanceTo(look);
  head.applyFreeLook(cam, look, 0);
  const c = box ? box.getCenter(cam.clone()) : obj.getWorldPosition(cam.clone());
  const f = look.clone().sub(cam).normalize();
  let r = f.clone().cross(cam.clone().set(0, 1, 0)).normalize();
  let u = r.clone().cross(f);
  const roll = (refs.rig.roll * Math.PI) / 180;
  const r0 = r.clone();
  r = r0.clone().multiplyScalar(Math.cos(roll)).addScaledVector(u, Math.sin(roll)).normalize();
  u = r.clone().cross(f);
  const d = c.clone().sub(cam);
  const z = d.dot(f);
  if (z <= 0) return null;
  const rect = canvas.getBoundingClientRect();
  const t = Math.tan((fov.fovForAspect(rect.width / rect.height) * Math.PI) / 360);
  const nx = d.dot(r) / (z * t * (rect.width / rect.height));
  const ny = d.dot(u) / (z * t);
  return { x: ((nx + 1) / 2) * rect.width, y: ((1 - ny) / 2) * rect.height, w: rect.width, h: rect.height };
}`;

/** Inside the canvas with a small margin (a control cut by the frame edge can't be clicked). */
export function inFrame(p: ScreenPoint, margin = 8): boolean {
  return p.x >= margin && p.y >= margin && p.x <= p.w - margin && p.y <= p.h - margin;
}

function isPoint(v: unknown): v is ScreenPoint {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof Reflect.get(v, "x") === "number" &&
    typeof Reflect.get(v, "y") === "number" &&
    typeof Reflect.get(v, "w") === "number" &&
    typeof Reflect.get(v, "h") === "number"
  );
}

/** Where a control is drawn on the Flyer's canvas, in canvas pixels (null when off screen). */
export async function controlOnScreen(flyer: Frame, objectId: string): Promise<ScreenPoint | null> {
  const p: unknown = await flyer.evaluate(`(${PROJECT})(${JSON.stringify(objectId)})`);
  return isPoint(p) ? p : null;
}

/** The canvas shows the hand cursor (drei useCursor) = the pointer is over a clickable part. */
async function pointerIsHot(flyer: Frame): Promise<boolean> {
  return (await flyer.evaluate("document.body.style.cursor")) === "pointer";
}

/** A canvas corner: nothing but cabin shell is drawn there. */
const EMPTY_SPOT = { x: 8, y: 8 };

const hasPointerLock = (flyer: Frame) =>
  flyer.evaluate<boolean>("document.pointerLockElement !== null");

/**
 * Gets into interact mode the way a player does (§F10.3): a click on empty canvas enters look
 * mode (pointer lock), a second click freezes the view and shows the cursor. A click on empty
 * space while already in interact mode only re-locks, so the second click then freezes again.
 */
async function enterInteractMode(flyer: Frame): Promise<void> {
  const canvas = flyer.locator("canvas").first();
  if (!(await hasPointerLock(flyer))) {
    await canvas.click({ position: EMPTY_SPOT });
    await flyer.page().waitForTimeout(300);
  }
  if (await hasPointerLock(flyer)) {
    await canvas.click({ position: EMPTY_SPOT });
    await flyer.page().waitForTimeout(100);
  }
}

/**
 * Click a cockpit control `times` times (presses 250 ms apart, inside the 1.2 s count window).
 * Waits for the camera to settle on the station shot first, and checks the cursor turns into
 * a hand before clicking so a miss fails loudly instead of clicking the panel.
 */
export async function clickControl(flyer: Frame, objectId: string, times = 1): Promise<void> {
  const canvas = flyer.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await enterInteractMode(flyer);
  // The rig eases to the station shot (≤ 1 s); wait until the projection stops moving.
  let last: ScreenPoint | null = null;
  await expect
    .poll(
      async () => {
        const p = await controlOnScreen(flyer, objectId);
        const still = p !== null && last !== null && Math.hypot(p.x - last.x, p.y - last.y) < 0.5;
        last = p;
        return still;
      },
      { message: `${objectId} on screen and still`, timeout: 15_000, intervals: [250] },
    )
    .toBe(true);
  const p = await controlOnScreen(flyer, objectId);
  if (!p || !inFrame(p)) {
    throw new Error(
      `${objectId} is outside the Flyer's view (${JSON.stringify(p)}): it can't be clicked`,
    );
  }
  await canvas.hover({ position: p });
  await expect
    .poll(() => pointerIsHot(flyer), { message: `hand cursor over ${objectId}` })
    .toBe(true);
  for (let i = 0; i < times; i++) {
    if (i > 0) await flyer.page().waitForTimeout(250);
    await canvas.click({ position: p });
  }
}
