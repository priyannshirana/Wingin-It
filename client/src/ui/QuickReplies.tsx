import { useShallow } from "zustand/react/shallow";
import { send } from "../net/socket";
import { useStore } from "../state/store";
import { quickText } from "./quickText";

// Flyer quick replies (Mock/Dev): one chip per server-provided line.
export function QuickReplies() {
  const lines = useStore(useShallow((s) => s.flyer.quickReplies ?? []));
  const deva = useStore((s) => s.settings.sendDevanagari);
  if (lines.length === 0) return null;
  return (
    <div
      className="pointer-events-auto flex flex-wrap justify-end gap-2"
      data-testid="quick-replies"
    >
      {lines.map((line, i) => (
        <button
          key={`${i}-${line.text}`}
          type="button"
          title={line.text}
          onClick={() => send({ type: "say_text", text: quickText(line, deva) })}
          className="rounded-full bg-night-hi/90 px-3 py-1 font-display text-sm text-cream ring-1 ring-white/20 hover:bg-teal hover:text-night"
        >
          {line.label}
        </button>
      ))}
    </div>
  );
}
