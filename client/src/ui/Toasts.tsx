import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useT } from "../i18n/useT";
import { selectPartner } from "../state/selectors";
import { useStore } from "../state/store";
import { ToastCard } from "./toasts/ToastCard";
import { TOAST_VISIBLE, toastGender, toastLifeMs } from "./toasts/toastTiming";
import "./toasts/toasts.css";

// The toast stack (§F15): top center, at most 3, newest at the bottom, auto-hide after 2.5 s
// (the gold crossover pop after 2 s). Text in the viewer's language from the ToastKey; the
// `toast.partner_*` lines take the partner's gender (§F7.2).
export function Toasts() {
  const t = useT();
  const toasts = useStore(useShallow((s) => s.toasts));
  const visible = toasts.slice(-TOAST_VISIBLE);

  // The partner may already be gone from `room_state` when "partner left the game" arrives, so
  // keep the last gender we knew.
  const livePartner = useStore((s) => selectPartner(s)?.gender ?? s.deck?.partner_gender);
  const [lastPartner, setLastPartner] = useState(livePartner);
  if (livePartner !== undefined && livePartner !== lastPartner) setLastPartner(livePartner);
  const partnerGender = livePartner ?? lastPartner;

  useEffect(() => {
    if (toasts.length === 0) return;
    const { dismissToast } = useStore.getState();
    const handles = toasts.map((toast) =>
      setTimeout(
        () => dismissToast(toast.id),
        Math.max(0, toast.at + toastLifeMs(toast.kind) - Date.now()),
      ),
    );
    return () => handles.forEach(clearTimeout);
  }, [toasts]);

  return (
    <div
      data-testid="toasts"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-16 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {visible.map((toast) => (
        <ToastCard
          key={toast.id}
          kind={toast.kind}
          text={t(toast.key, toast.params, toastGender(toast.key, partnerGender))}
        />
      ))}
    </div>
  );
}
