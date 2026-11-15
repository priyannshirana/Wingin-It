import { useStore, type CueName } from "../../state/store";

/** True while the Tower timeline holds cue `name` on (§F14.4). */
export function useCue(name: CueName): boolean {
  return useStore((s) => s.cues[name] === true);
}
