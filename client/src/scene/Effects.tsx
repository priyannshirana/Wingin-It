import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { DEV } from "../config";
import { useFrameProbe } from "../dev/debugHooks";

/** Dev builds: the per-frame fps / draw-call probe behind `__wingin.stats()` (§F18.5). */
function DevProbe() {
  useFrameProbe();
  return null;
}

// Postprocessing (§F21): Bloom + Vignette. The threshold stays at 1.0, so only the HDR emitters
// (lamps, fire, runway lights, moon, sun) bloom; if a frame glows all over, lower the emitters,
// never raise the threshold. Flashes and the red wrong-action pulse are DOM overlays.
//
// SPEC-ASSUMPTION: a ToneMapping effect (Khronos PBR Neutral) is merged into the same pass — the
// EffectComposer forces renderer.toneMapping = NoToneMapping, which drops the curve §F9.1 sets on
// the canvas. ACES turned the blinking red lamp pink-white in /dev/scene; Neutral keeps the lamp
// hues the players must name ("red", "blue") saturated, at no extra draw call.
export function Effects() {
  return (
    <>
      {DEV && <DevProbe />}
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={1} intensity={0.8} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <Vignette offset={0.3} darkness={0.35} />
      </EffectComposer>
    </>
  );
}
