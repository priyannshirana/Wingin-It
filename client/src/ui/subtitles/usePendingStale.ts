import { useCallback, useEffect, useState } from "react";
import { PENDING_CAP_MS } from "./lifeline";

/**
 * True once a decode has been pending for longer than `PENDING_CAP_MS` without an answer.
 * `restart()` starts a fresh wait (call it when the player clicks again).
 */
export function usePendingStale(pending: boolean): { stale: boolean; restart: () => void } {
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [seenPending, setSeenPending] = useState(pending);
  if (seenPending !== pending) {
    setSeenPending(pending);
    setStale(false);
  }
  useEffect(() => {
    if (!pending) return;
    const handle = setTimeout(() => setStale(true), PENDING_CAP_MS);
    return () => clearTimeout(handle);
  }, [pending, attempt]);
  const restart = useCallback(() => {
    setStale(false);
    setAttempt((a) => a + 1);
  }, []);
  return { stale, restart };
}
