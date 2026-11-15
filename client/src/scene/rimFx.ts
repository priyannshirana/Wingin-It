// §F15 correct action: a green edge flash on the current station (an emissive rim around the
// panel, 0 → 1 → 0 in 400 ms). StationRim.tsx reads `rimFx` every frame; nothing else writes it.
import gsap from "gsap";

export const RIM_FLASH_S = 0.4;

export const rimFx = { v: 0 };

let tween: gsap.core.Timeline | null = null;

export function flashStationRim(): void {
  tween?.kill();
  rimFx.v = 0;
  tween = gsap
    .timeline()
    .to(rimFx, { v: 1, duration: RIM_FLASH_S * 0.3, ease: "power2.out" })
    .to(rimFx, { v: 0, duration: RIM_FLASH_S * 0.7, ease: "power2.in" });
}

export function resetStationRim(): void {
  tween?.kill();
  tween = null;
  rimFx.v = 0;
}
