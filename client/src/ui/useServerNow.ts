import { useEffect, useState } from "react";
import { serverNow } from "../net/clock";

/** Re-renders every `everyMs` with the current server time (for countdowns). */
export function useServerNow(everyMs = 250, active = true): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(serverNow()), everyMs);
    return () => clearInterval(id);
  }, [everyMs, active]);
  return now;
}
