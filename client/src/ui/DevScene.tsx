import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { cutNow, SHOT_IDS, type ShotId } from "../cinematics/cameraRig";
import {
  fixtureRoomState,
  FixtureError,
  isPresetName,
  parseLamps,
  presetFlyerView,
  presetShot,
  type PresetName,
} from "../dev/fixtures";
import { installDebugHooks, stats, waitFrames, type WinginStats } from "../dev/debugHooks";
import type { Gender, ObjectState, Side } from "../net/protocol";
import { CockpitCanvas } from "../scene/CockpitCanvas";
import { worldSync } from "../scene/env/worldSync";
import { head, setHead, startSettle } from "../scene/freeLookHead";
import { dispatchLook } from "../scene/useFreeLook";
import { useStore } from "../state/store";
import { FreeLookHint } from "./FreeLookHint";
import { isTypingTarget } from "./isTypingTarget";

interface SceneQuery {
  preset: PresetName;
  fireSide: Side;
  shot: ShotId | null;
  lamps: Record<string, ObjectState>;
  fps: boolean;
  look: boolean;
  gender: Gender;
  error: string | null;
}

const isShot = (v: string | null): v is ShotId => SHOT_IDS.some((s) => s === v);

function parseQuery(search: string): SceneQuery {
  const q = new URLSearchParams(search);
  const errors: string[] = [];
  const world = q.get("world");
  const shot = q.get("shot");
  if (world && !isPresetName(world)) errors.push(`unknown world preset "${world}"`);
  if (shot && !isShot(shot)) errors.push(`unknown shot "${shot}"`);
  let lamps: Record<string, ObjectState> = {};
  try {
    lamps = parseLamps(q.get("lamps"));
  } catch (e) {
    if (!(e instanceof FixtureError)) throw e;
    errors.push(e.message);
  }
  return {
    preset: isPresetName(world) ? world : "p1_start",
    fireSide: q.get("fire_side") === "left" ? "left" : "right",
    shot: isShot(shot) ? shot : null,
    lamps,
    fps: q.get("fps") === "1",
    // `look=1` mounts free look (§F10.3) so its frames can be checked; shots no longer apply.
    look: q.get("look") === "1",
    // SPEC-ASSUMPTION: `gender=male|female` picks the Flyer character (default female, like the
    // split view) — §F0.6 needs WIDE_INTERIOR with each character and the sandbox has no lobby.
    gender: q.get("gender") === "male" ? "male" : "female",
    error: errors.length ? errors.join("; ") : null,
  };
}

/** Feed a preset through the store exactly like the server would (§F18.5: no forks). */
function applyPreset(
  preset: PresetName,
  fireSide: Side,
  lamps: Record<string, ObjectState>,
  gender: Gender,
): void {
  const { receive } = useStore.getState();
  receive(fixtureRoomState(gender));
  receive(presetFlyerView({ preset, fire_side: fireSide, lamps }));
}

function cutTo(shot: ShotId): Promise<void> {
  // The resting-shot effect may have started a move after a station change; cut over it.
  return waitFrames(1).then(() => {
    cutNow(shot);
    return waitFrames(2);
  });
}

function StatsReadout() {
  const [s, setS] = useState<WinginStats>(stats);
  useEffect(() => {
    const id = setInterval(() => setS(stats()), 500);
    return () => clearInterval(id);
  }, []);
  const ok = s.fps >= 45 && s.calls < 250;
  return (
    <div
      data-testid="scene-stats"
      className={`pointer-events-none absolute top-2 left-2 rounded bg-black/70 px-2 py-1 font-mono text-xs ${ok ? "text-green-300" : "text-red-300"}`}
    >
      {s.fps} fps · {s.calls} calls · {(s.triangles / 1000).toFixed(0)}k tris
    </div>
  );
}

// /dev/scene (§F18.5): the real Flyer scene rendered from a fixture World, no server. Dev-only
// text, no i18n. Arrow keys step through the shots; O toggles OrbitControls for inspection.
export function DevScene() {
  const query = useMemo(() => parseQuery(location.search), []);
  const [shot, setShot] = useState<ShotId>(query.shot ?? presetShot(query.preset));
  const [preset, setPreset] = useState<PresetName>(query.preset);
  const [, setOrbitTick] = useState(0);
  // The canvas mounts only once the preset is in the store, so the resting-shot effect sees the
  // preset's station on its first run and the explicit shot below is cut after it.
  const seeded = useStore((s) => s.flyer.world !== null);

  // Before the canvas mounts (layout effects run before the resting-shot effect), so the very
  // first frame already shows the preset.
  useLayoutEffect(() => {
    worldSync.instant = true;
    applyPreset(query.preset, query.fireSide, query.lamps, query.gender);
    return () => {
      worldSync.instant = false;
      useStore.getState().reset();
    };
  }, [query]);

  useEffect(() => {
    if (!seeded) return;
    cutNow(shot);
    // The resting-shot effect may start a station move on mount (StrictMode re-runs it); cut
    // again once the canvas has rendered so the requested shot always wins.
    let live = true;
    void waitFrames(3).then(() => {
      if (live) cutNow(shot);
    });
    return () => {
      live = false;
    };
  }, [shot, seeded]);

  useEffect(
    () =>
      installDebugHooks({
        setWorld: (preset, opts) => {
          if (!isPresetName(preset)) return Promise.reject(new Error(`unknown preset ${preset}`));
          applyPreset(preset, opts?.fire_side ?? query.fireSide, {}, query.gender);
          setPreset(preset);
          const next = presetShot(preset);
          setShot(next);
          return cutTo(next);
        },
        setShot: (id) => {
          if (!isShot(id)) return Promise.reject(new Error(`unknown shot ${id}`));
          setShot(id);
          return cutTo(id);
        },
        ...(query.look
          ? {
              // The sandbox has no real pointer lock: the hooks drive the same mode reducer.
              look: (yaw: number, pitch: number) => {
                if (head.mode !== "look") dispatchLook({ type: "locked" });
                setHead(yaw, pitch);
                head.weight = 1;
                return waitFrames(3);
              },
              freeze: () => {
                if (head.mode !== "look") dispatchLook({ type: "locked" });
                const station = startSettle();
                dispatchLook({ type: "freeze" });
                return waitFrames(30).then(() => ({ station }));
              },
            }
          : {}),
      }),
    [query],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const step = e.key === "ArrowRight" ? 1 : -1;
        setShot(
          (s) => SHOT_IDS[(SHOT_IDS.indexOf(s) + step + SHOT_IDS.length) % SHOT_IDS.length] ?? s,
        );
      } else if (e.key === "o" || e.key === "O") {
        const url = new URL(location.href);
        if (url.searchParams.get("orbit") === "1") url.searchParams.delete("orbit");
        else url.searchParams.set("orbit", "1");
        history.replaceState(null, "", url);
        setOrbitTick((n) => n + 1); // CockpitCanvas reads ?orbit=1 on render
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main data-screen="dev-scene" className="relative h-full overflow-hidden bg-night">
      {seeded && <CockpitCanvas freeLook={query.look} />}
      {seeded && query.look && <FreeLookHint />}
      {query.fps && <StatsReadout />}
      <div className="pointer-events-none absolute right-2 bottom-2 rounded bg-black/60 px-2 py-1 font-mono text-xs text-cream/80">
        {preset} · {shot}
      </div>
      {query.error && (
        <div className="absolute inset-x-0 top-0 bg-red-700 p-2 font-mono text-sm text-white">
          {query.error}
        </div>
      )}
    </main>
  );
}
