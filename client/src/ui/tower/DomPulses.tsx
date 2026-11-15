import gsap from "gsap";
import { useLayoutEffect } from "react";
import { useCue } from "./useCue";
import { LIFELINE_DOT, LIFELINES, RADAR, SUBTITLES } from "./towerDom";

/**
 * One-shot effects on parts of the Tower screen that other components own (§F14.4):
 * - `subtitle_glitch` (p3_intro): the subtitle column glitches once (RGB split + jitter);
 * - `lifeline_dots_pop` (p3_intro): the three lifeline dots pop in (`back.out`, staggered);
 * - `radar_flicker` (lightning_strike): the radar flickers for 0.5 s.
 * Each is a GSAP tween reverted when its cue ends, so the element returns to its React state.
 */
export function DomPulses({ root }: { root: HTMLElement | null }) {
  const glitch = useCue("subtitle_glitch");
  const dots = useCue("lifeline_dots_pop");
  const flicker = useCue("radar_flicker");

  useLayoutEffect(() => {
    const el = glitch ? root?.querySelector<HTMLElement>(SUBTITLES) : null;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      const split = "2px 0 rgb(229 72 77 / 0.85), -2px 0 rgb(46 196 182 / 0.85)";
      tl.set(el, { textShadow: split, x: 4, skewX: -6, opacity: 0.7 });
      tl.set(el, { x: -3, skewX: 4, opacity: 1 }, 0.06);
      tl.set(el, { x: 2, skewX: 0, opacity: 0.55 }, 0.12);
      tl.set(el, { x: -1, opacity: 1 }, 0.2);
      tl.set(el, { x: 0, textShadow: "none" }, 0.32);
      tl.set(el, { clearProps: "transform,opacity,textShadow" }, 0.4);
    });
    return () => ctx.revert();
  }, [glitch, root]);

  useLayoutEffect(() => {
    const host = dots ? root?.querySelector<HTMLElement>(LIFELINES) : null;
    if (!host) return;
    const found = host.querySelectorAll<HTMLElement>(LIFELINE_DOT);
    const targets = found.length > 0 ? Array.from(found) : [host];
    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(3)", stagger: 0.15 },
      );
    });
    return () => ctx.revert();
  }, [dots, root]);

  useLayoutEffect(() => {
    const el = flicker ? root?.querySelector<SVGElement>(RADAR) : null;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      [0.25, 1, 0.4, 1, 0.15, 0.85, 1].forEach((opacity, i) => {
        tl.set(el, { opacity }, i * 0.07);
      });
      tl.set(el, { clearProps: "opacity" }, 0.5);
    });
    return () => ctx.revert();
  }, [flicker, root]);

  return null;
}
