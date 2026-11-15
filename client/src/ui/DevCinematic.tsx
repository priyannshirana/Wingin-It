import gsap from "gsap";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sfx } from "../audio/sfx";
import { cutNow, EXTERIOR_PLANE, rig } from "../cinematics/cameraRig";
import { buildFlyerTimeline } from "../cinematics/timelines";
import type { CinematicParams, TimelineCtx } from "../cinematics/timelineKit";
import { CINEMATIC_IDS, cinematicDurationMs } from "../content/cinematics";
import { installDebugHooks, waitFrames } from "../dev/debugHooks";
import { fixtureRoomState, presetFlyerView, presetShot, PRESET_BEFORE } from "../dev/fixtures";
import type { CinematicId, Gender, Side } from "../net/protocol";
import { CockpitCanvas } from "../scene/CockpitCanvas";
import { worldSync } from "../scene/env/worldSync";
import { getRef } from "../scene/sceneRefs";
import { useStore } from "../state/store";
import { CineFade } from "./CineFade";
import { TitleCard } from "./TitleCard";

interface CineQuery {
  id: CinematicId;
  t: number;
  demo: boolean;
  retry: boolean;
  params: CinematicParams;
  gender: Gender;
}

const isId = (v: string | null): v is CinematicId => CINEMATIC_IDS.some((c) => c === v);

function parseQuery(search: string): CineQuery {
  const q = new URLSearchParams(search);
  const id = q.get("id");
  const side: Side = q.get("fire_side") === "left" ? "left" : "right";
  const retry = q.get("retry") === "1";
  return {
    id: isId(id) ? id : "prologue",
    t: Number(q.get("t") ?? 0) || 0,
    demo: q.get("demo") === "1",
    retry,
    gender: q.get("gender") === "male" ? "male" : "female",
    params: {
      fire_side: side,
      stopped_side: side,
      damaged_side: side,
      retry,
      fuel_left_s: 73,
      total_time_s: 412,
    },
  };
}

/** The scene the cinematic starts from (the world before it), reset the way a fresh state is. */
function resetScene(id: CinematicId, side: Side, gender: Gender): void {
  const s = useStore.getState();
  s.clearCues();
  s.setTitleCard(null);
  s.setCinePlaying(false);
  s.receive(fixtureRoomState(gender));
  const preset = PRESET_BEFORE[id];
  s.receive(presetFlyerView({ preset, fire_side: side, lamps: {} }));
  cutNow(presetShot(preset));
  rig.roll = 0;
  rig.pitchOffset = 0;
  rig.shake = 0;
  rig.restShake = useStore.getState().flyer.world?.turbulence ?? 0;
  const plane = getRef("exteriorPlane");
  plane?.position.copy(EXTERIOR_PLANE);
  plane?.rotation.set(0, 0, 0);
  const clouds = getRef("clouds");
  if (clouds) clouds.speed = 1;
  const lights = getRef("lightRig");
  if (lights) lights.lightning.intensity = 0;
}

// /dev/cinematic (§F18.5): scrub any Flyer timeline in the real scene. `?id=p2_intro&t=0.85`,
// plus `fire_side`, `demo=1`, `retry=1`, `gender`. `__wingin.seek(id, t, params)` rebuilds the
// timeline from its starting world and seeks to `t` (sounds and flashes muted). Dev-only text.
export function DevCinematic() {
  const query = useMemo(() => parseQuery(location.search), []);
  const seeded = useStore((s) => s.flyer.world !== null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const ctxRef = useRef<gsap.Context | null>(null);
  const [cur, setCur] = useState({ id: query.id, d: 0, t: 0, playing: false });
  const seeking = useRef(false);

  const killTl = useCallback(() => {
    tlRef.current?.kill();
    ctxRef.current?.kill();
    tlRef.current = null;
    ctxRef.current = null;
  }, []);

  const load = useCallback(
    (id: CinematicId, t: number, extra?: CinematicParams): void => {
      killTl();
      const params = { ...query.params, ...extra };
      const side = params.fire_side === "left" ? "left" : "right";
      resetScene(id, side, query.gender);
      const { setTitleCard, setCue, flash } = useStore.getState();
      const ctx: TimelineCtx = {
        params,
        demo: query.demo,
        retry: params.retry === true,
        titleCard: setTitleCard,
        cue: setCue,
        flash: (color, ms, opacity) => {
          if (!seeking.current) flash(color, ms, opacity);
        },
        sfx: {
          play: (name) => {
            if (!seeking.current) sfx.play(name);
          },
          loop: (name, on) => sfx.loop(name, on),
        },
      };
      const ms = cinematicDurationMs(id, { demo: query.demo, retry: params.retry === true });
      const built: { tl?: gsap.core.Timeline } = {};
      ctxRef.current = gsap.context(() => {
        built.tl = buildFlyerTimeline(id, ctx, ms);
      });
      const tl = built.tl ?? gsap.timeline({ paused: true });
      tlRef.current = tl;
      useStore.getState().setCinePlaying(true);
      seeking.current = true;
      tl.seek(Math.min(Math.max(0, t), tl.duration()), false);
      seeking.current = false;
      setCur({ id, d: tl.duration(), t: tl.time(), playing: false });
    },
    [query, killTl],
  );

  useEffect(() => {
    if (!seeded) return;
    // The canvas registers the scene refs after its first frames: build the timeline then.
    let live = true;
    void waitFrames(3).then(() => {
      if (live) load(query.id, query.t);
    });
    return () => {
      live = false;
      killTl();
    };
  }, [seeded, load, killTl, query]);

  useLayoutEffect(() => {
    worldSync.instant = true;
    resetScene(query.id, query.params.fire_side === "left" ? "left" : "right", query.gender);
    return () => {
      worldSync.instant = false;
      useStore.getState().reset();
    };
  }, [query]);

  useEffect(
    () =>
      installDebugHooks({
        setWorld: () => Promise.reject(new Error("use seek() in /dev/cinematic")),
        setShot: () => Promise.reject(new Error("use seek() in /dev/cinematic")),
        seek: (id, t, params) => {
          load(id, t, params);
          return waitFrames(3);
        },
      }),
    [load],
  );

  useEffect(() => {
    if (!cur.playing) return;
    const timer = setInterval(() => {
      const tl = tlRef.current;
      if (tl) setCur((c) => ({ ...c, t: tl.time(), playing: tl.isActive() }));
    }, 100);
    return () => clearInterval(timer);
  }, [cur.playing]);

  return (
    <main data-screen="dev-cinematic" className="relative h-full overflow-hidden bg-night">
      {seeded && <CockpitCanvas />}
      <CineFade />
      <TitleCard />
      <div className="absolute inset-x-0 bottom-2 z-40 mx-auto flex w-[640px] items-center gap-3 rounded bg-black/70 px-3 py-1 font-mono text-xs text-cream">
        <button
          type="button"
          className="rounded bg-teal px-2 py-0.5 text-night"
          onClick={() => {
            const tl = tlRef.current;
            if (!tl) return;
            if (tl.isActive()) {
              tl.pause();
              setCur((c) => ({ ...c, playing: false }));
            } else {
              if (tl.progress() >= 1) tl.seek(0);
              tl.play();
              setCur((c) => ({ ...c, playing: true }));
            }
          }}
        >
          {cur.playing ? "pause" : "play"}
        </button>
        <span>{cur.id}</span>
        <input
          type="range"
          className="flex-1"
          min={0}
          max={cur.d}
          step={0.01}
          value={cur.t}
          onChange={(e) => {
            const tl = tlRef.current;
            if (!tl) return;
            tl.pause();
            seeking.current = true;
            tl.seek(Number(e.target.value), false);
            seeking.current = false;
            setCur((c) => ({ ...c, t: tl.time(), playing: false }));
          }}
        />
        <span>
          {cur.t.toFixed(2)} / {cur.d.toFixed(1)}
        </span>
      </div>
    </main>
  );
}
