import type { ManualCard } from "../net/protocol";
import { PHASE_COLOR } from "./manual/phaseColors";

// The manual's checklist (§F12.3 item 6): progress dots along the bottom of the right page
// (done = black, current = the phase color, upcoming = beige).
export function Checklist({ card }: { card: ManualCard }) {
  return (
    <div className="flex justify-center gap-2" data-testid="progress-dots">
      {card.progress.map((p, i) => (
        <span
          key={i}
          data-state={p}
          className="size-3.5 rounded-full"
          style={{
            background:
              p === "done" ? "#1F1F1F" : p === "current" ? PHASE_COLOR[card.phase] : "#E8DCC0",
          }}
        />
      ))}
    </div>
  );
}
