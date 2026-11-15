import type { StringKey } from "../../i18n/strings";
import type { PhaseNo } from "../../net/protocol";

/** Phase tab colors (§F12.3 item 6): 1 teal, 2 orange, 3 blue. */
export const PHASE_COLOR: Readonly<Record<PhaseNo, string>> = {
  1: "#2EC4B6",
  2: "#F97316",
  3: "#3E63DD",
};

export const PHASE_KEY: Readonly<Record<PhaseNo, StringKey>> = {
  1: "phase.1",
  2: "phase.2",
  3: "phase.3",
};
