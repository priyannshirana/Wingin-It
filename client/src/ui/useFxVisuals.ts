// Store `fx` → visuals (§A12, §F15). Mounted once per game screen; the Flyer runs the camera,
// lamp and wing-fire effects, both screens run the signal-bar flash. Only batches that arrive after
// mounting play (like useWorldAudio), so a rejoin never replays old one-shots.
import { useEffect } from "react";
import { fxPitchDip, fxShake, fxYaw } from "../cinematics/cameraFx";
import type { Role } from "../net/protocol";
import { flickerLamp, stopFlickers } from "../scene/lampFlicker";
import { getRef } from "../scene/sceneRefs";
import { useStore } from "../state/store";
import { assertNever } from "../util/assertNever";
import { useFxOverlayStore, visualFor, type VisualEffect } from "./fxVisuals";

export function playVisual(effect: VisualEffect): void {
  switch (effect.kind) {
    case "shake":
      fxShake(effect.amount, effect.seconds);
      return;
    case "yaw":
      fxYaw(effect.side);
      return;
    case "pitch_dip":
      fxPitchDip();
      return;
    case "lamp_flicker":
      flickerLamp(effect.objectId);
      return;
    case "flicker_stop":
      stopFlickers();
      return;
    case "burst": {
      // The puff goes on the burning wing (World `fire.side`; never sent to the Tower).
      const side = useStore.getState().flyer.world?.fire.side;
      if (side) getRef(side === "left" ? "wingFireLeft" : "wingFireRight")?.burst(effect.burst);
      return;
    }
    case "signal_flash":
      useFxOverlayStore.getState().bumpSignalFlash();
      return;
    default:
      assertNever(effect);
  }
}

export function useFxVisuals(role: Role): void {
  useEffect(() => {
    let lastFx = useStore.getState().fx.at(-1)?.id ?? 0;
    const unsub = useStore.subscribe((s, p) => {
      if (s.fx === p.fx) return;
      for (const batch of s.fx) {
        if (batch.id <= lastFx) continue;
        lastFx = batch.id;
        for (const raw of batch.effects) {
          const effect = visualFor(role, raw);
          if (effect) playVisual(effect);
        }
      }
    });
    return () => {
      unsub();
      if (role === "flyer") stopFlickers();
      useFxOverlayStore.getState().reset();
    };
  }, [role]);
}
