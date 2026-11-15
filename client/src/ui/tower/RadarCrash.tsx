import gsap from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCue } from "./useCue";
import { BLIP, BLIP_CORE, RADAR_C, radarPoint } from "./towerDom";

const SPIRAL_S = 0.7;
const TURNS = 2.25;
const R_END = 112;
const R_MIN = 12;
const TRAIL = 6;
const TRAIL_LAG = 0.035;
const RED = "#E5484D";

interface Spiral {
  r0: number;
  a0: number;
}

function spiralAt(sp: Spiral, s: number): { x: number; y: number } {
  const u = Math.max(0, s);
  const r = sp.r0 + (R_END - sp.r0) * u;
  const a = sp.a0 + u * TURNS * Math.PI * 2;
  return { x: RADAR_C + r * Math.cos(a), y: RADAR_C + r * Math.sin(a) };
}

/**
 * The crash on the radar (§F14.4): the blip spirals outward off its route (0.7 s, `power2.in`,
 * leaving a fading trail) and pops into a tiny cartoon POOF cloud. Drawn inside the radar SVG
 * through a portal, so it shares the radar's 280 × 280 coordinates; the real blip is hidden while
 * either cue is on and restored (GSAP revert) after.
 */
export function RadarCrash({ radar }: { radar: SVGSVGElement | null }) {
  const spiral = useCue("blip_spiral");
  const poof = useCue("poof");
  if (!radar || (!spiral && !poof)) return null;
  return createPortal(<CrashMarks radar={radar} poof={poof} />, radar);
}

function CrashMarks({ radar, poof }: { radar: SVGSVGElement; poof: boolean }) {
  const [sp] = useState<Spiral>(() => {
    const p = radarPoint(radar, radar.querySelector(BLIP_CORE)); // the core, not the label bbox
    const dx = p.x - RADAR_C;
    const dy = p.y - RADAR_C;
    return { r0: Math.max(R_MIN, Math.hypot(dx, dy)), a0: Math.atan2(dy, dx) };
  });

  useLayoutEffect(() => {
    const blip = radar.querySelector(BLIP);
    if (!blip) return;
    const ctx = gsap.context(() => gsap.set(blip, { opacity: 0 }));
    return () => ctx.revert();
  }, [radar]);

  return (
    <g data-fx data-testid="radar-crash" clipPath="url(#radar-disc)">
      {poof ? <Poof at={spiralAt(sp, 1)} /> : <SpiralBlip sp={sp} />}
    </g>
  );
}

function SpiralBlip({ sp }: { sp: Spiral }) {
  const head = useRef<SVGGElement>(null);
  const trail = useRef<(SVGCircleElement | null)[]>([]);

  useLayoutEffect(() => {
    const el = head.current;
    if (!el) return;
    const state = { s: 0 };
    const place = () => {
      const p = spiralAt(sp, state.s);
      const k = 1 - 0.35 * state.s;
      el.setAttribute("transform", `translate(${p.x} ${p.y}) scale(${k})`);
      for (let i = 0; i < TRAIL; i++) {
        const dot = trail.current[i];
        if (!dot) continue;
        const q = spiralAt(sp, state.s - (i + 1) * TRAIL_LAG);
        dot.setAttribute("cx", String(q.x));
        dot.setAttribute("cy", String(q.y));
      }
    };
    place();
    const ctx = gsap.context(() => {
      gsap.to(state, { s: 1, duration: SPIRAL_S, ease: "power2.in", onUpdate: place });
    });
    return () => ctx.revert();
  }, [sp]);

  return (
    <g data-testid="radar-spiral">
      {Array.from({ length: TRAIL }, (_, i) => (
        <circle
          key={i}
          ref={(c) => {
            trail.current[i] = c;
          }}
          r={4.5 - i * 0.5}
          fill={RED}
          opacity={0.6 - i * 0.08}
        />
      ))}
      <g ref={head}>
        <circle r="16" fill="url(#blip-glow)" />
        <circle r="6" fill={RED} />
      </g>
    </g>
  );
}

const PUFFS = [
  { x: 0, y: 0, r: 9 },
  { x: -9, y: 3, r: 7 },
  { x: 9, y: 2, r: 7.5 },
  { x: -4, y: -7, r: 6.5 },
  { x: 5, y: -7, r: 6 },
  { x: -13, y: -3, r: 4.5 },
  { x: 14, y: -4, r: 4 },
];
// SPEC-ASSUMPTION: the POOF is ~60 viewBox units wide (scale 1.3) — "tiny" has no size; this is
// the smallest cloud that still reads as a POOF on the 300–320 px radar. Art only, no word: there
// is no `tower.poof` string yet.
const POOF_SCALE = 1.3;
const SPARKS = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2 + 0.2);

function Poof({ at }: { at: { x: number; y: number } }) {
  const ref = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.fromTo(
        "[data-puff]",
        { scale: 0, transformOrigin: "50% 50%" },
        {
          scale: 1,
          duration: 0.35,
          ease: "back.out(2.5)",
          // the outline and the fill of one puff pop together
          stagger: (i: number) => (i % PUFFS.length) * 0.03,
        },
      );
      tl.fromTo(
        // The spark ring is symmetric about the POOF's centre, so its bbox centre is that point
        // (svgOrigin would use the radar's global coordinates instead).
        "[data-sparks]",
        { scale: 0.2, opacity: 1, transformOrigin: "50% 50%" },
        { scale: 1, opacity: 0, duration: 0.45, ease: "power2.out" },
        0.05,
      );
      tl.to("[data-cloud]", { y: -6, opacity: 0.75, duration: 1.4, ease: "power1.out" }, 0.4);
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <g
      ref={ref}
      data-testid="radar-poof"
      transform={`translate(${at.x} ${at.y}) scale(${POOF_SCALE})`}
    >
      <g data-sparks>
        {SPARKS.map((a, i) => (
          <line
            key={i}
            x1={Math.cos(a) * 15}
            y1={Math.sin(a) * 15}
            x2={Math.cos(a) * 24}
            y2={Math.sin(a) * 24}
            stroke="#FFD166"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
      </g>
      <g data-cloud>
        {/* One grey outline layer under one fill layer: a single cartoon silhouette. */}
        {PUFFS.map((p, i) => (
          <circle key={`o${i}`} data-puff cx={p.x} cy={p.y} r={p.r + 1.6} fill="#8B8D98" />
        ))}
        {PUFFS.map((p, i) => (
          <circle key={`f${i}`} data-puff cx={p.x} cy={p.y} r={p.r} fill="#F2F4FF" />
        ))}
      </g>
    </g>
  );
}
