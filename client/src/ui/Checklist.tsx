import type { ManualCard } from "../net/protocol";
import { useStore } from "../state/store";
import { PHASE_COLOR } from "./manual/phaseColors";

const GREEN = "#30A46C";
/** p1_outro `dots_green`: the dots turn green one by one, this far apart (§F14.4). */
export const DOT_STAGGER_MS = 150;

// The manual's checklist (§F12.3 notes item 4): progress dots along the bottom of the right page
// (done = black, current = the phase color, upcoming = beige). The `dots_green` cue turns every
// dot green one by one; it is a pure function of the cue, so setting it on or off at any time
// (seeking, skipping) lands in the matching final state.
export function Checklist({ card }: { card: ManualCard }) {
  const green = useStore((s) => s.cues.dots_green === true);
  return (
    <div
      className="flex justify-center gap-2"
      data-testid="progress-dots"
      data-green={green ? "1" : "0"}
    >
      {card.progress.map((p, i) => (
        <span
          key={i}
          data-state={green ? "green" : p}
          className="size-3.5 rounded-full"
          style={{
            background: green
              ? GREEN
              : p === "done"
                ? "#1F1F1F"
                : p === "current"
                  ? PHASE_COLOR[card.phase]
                  : "#E8DCC0",
            transition: green ? "background-color 120ms ease-out" : undefined,
            transitionDelay: green ? `${i * DOT_STAGGER_MS}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}
