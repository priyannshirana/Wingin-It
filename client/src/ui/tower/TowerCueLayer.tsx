import { useCallback, useState } from "react";
import { Banner } from "./Banner";
import { BlipBounce } from "./BlipBounce";
import { Confetti } from "./Confetti";
import { DawnWarm } from "./DawnWarm";
import { DomPulses } from "./DomPulses";
import { FadeCream } from "./FadeCream";
import { RadarBoot } from "./RadarBoot";
import { RadarCrash } from "./RadarCrash";
import { RadarGlide } from "./RadarGlide";
import { RadarIconFx } from "./RadarIconFx";
import { RadarRunwayPulse } from "./RadarRunwayPulse";
import { RadarStorm } from "./RadarStorm";
import { ScreenShake } from "./ScreenShake";
import { Stamp } from "./Stamp";
import { BLIP, RADAR, TOWER_ROOT } from "./towerDom";

interface TowerDom {
  root: HTMLElement | null;
  radar: SVGSVGElement | null;
  blip: SVGGElement | null;
}

/**
 * Every timed 2D beat of the Tower timelines (§F14.4, §F12.6), each switched by its store cue.
 * Mounted once inside the Tower screen; when it attaches it finds the screen root (shake, stamp
 * jolt), the radar SVG and the blip group (the radar overlays are portaled into those, so they
 * share Radar.tsx's coordinates without editing it).
 */
export function TowerCueLayer() {
  const [dom, setDom] = useState<TowerDom>({ root: null, radar: null, blip: null });
  const attach = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const root = el.closest<HTMLElement>(TOWER_ROOT);
    const radar = root?.querySelector<SVGSVGElement>(RADAR) ?? null;
    setDom({ root, radar, blip: radar?.querySelector<SVGGElement>(BLIP) ?? null });
  }, []);

  return (
    <div ref={attach} data-testid="tower-cues" className="contents">
      <DawnWarm />
      <FadeCream />
      <Banner root={dom.root} />
      <Stamp kind="mayday" root={dom.root} />
      <Stamp kind="landed" root={dom.root} />
      <Confetti />
      <ScreenShake root={dom.root} />
      <DomPulses root={dom.root} />
      <RadarBoot radar={dom.radar} />
      <RadarStorm radar={dom.radar} />
      <RadarGlide radar={dom.radar} />
      <RadarRunwayPulse radar={dom.radar} />
      <RadarIconFx blip={dom.blip} />
      <BlipBounce blip={dom.blip} />
      <RadarCrash radar={dom.radar} />
    </div>
  );
}
