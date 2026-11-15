import type { QuickLine } from "../../net/protocol";
import { send } from "../../net/socket";
import { useStore } from "../../state/store";
import { quickText } from "../quickText";

/** Mock/Dev only: ▶ sends the line as `say_text` (Devanagari when the dev toggle is on). */
export function QuickSayButton({ line }: { line: QuickLine | null | undefined }) {
  const deva = useStore((s) => s.settings.sendDevanagari);
  const locked = useStore((s) => s.game?.input_locked === true);
  if (!line) return null;
  return (
    <button
      type="button"
      data-testid="quick-say"
      title={line.label}
      disabled={locked}
      onClick={() => send({ type: "say_text", text: quickText(line, deva) })}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-teal font-display text-sm text-night shadow hover:scale-110 disabled:opacity-30"
    >
      ▶
    </button>
  );
}
