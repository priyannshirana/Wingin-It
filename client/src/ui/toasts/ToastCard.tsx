import type { Toast } from "../../net/protocol";
import { TOAST_FADE_MS, toastLifeMs } from "./toastTiming";

const PLAIN_CLASS =
  "bg-slate/92 px-4 py-2 text-[18px] text-cream shadow-[0_8px_20px_rgba(0,0,0,0.35)]";

const KIND_CLASS: Record<Toast["kind"], string> = {
  crossover:
    "bg-gradient-to-b from-[#FFE066] to-lamp-yellow px-6 py-2.5 text-[24px] font-extrabold tracking-wide text-night shadow-[0_6px_0_#B88A00,0_10px_24px_rgba(0,0,0,0.35)]",
  info: PLAIN_CLASS,
  warning: PLAIN_CLASS,
  error: PLAIN_CLASS,
};

/** A small status dot on the plain toasts (the gold crossover toast stands on its own). */
const DOT_CLASS: Record<Toast["kind"], string | null> = {
  crossover: null,
  info: "bg-teal",
  warning: "bg-lamp-yellow",
  error: "bg-lamp-red",
};

/** One toast: scale-pops in, fades out at the end of its life (§F15). */
export function ToastCard({ kind, text }: { kind: Toast["kind"]; text: string }) {
  const dot = DOT_CLASS[kind];
  return (
    <div
      style={{
        animation: `wingin-toast-out ${TOAST_FADE_MS}ms ease-in ${toastLifeMs(kind) - TOAST_FADE_MS}ms forwards`,
      }}
    >
      <div
        data-testid="toast"
        data-kind={kind}
        className={`flex animate-pop items-center gap-2.5 rounded-2xl font-display leading-tight ${KIND_CLASS[kind]}`}
      >
        {dot && <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${dot}`} />}
        <span>{text}</span>
      </div>
    </div>
  );
}
