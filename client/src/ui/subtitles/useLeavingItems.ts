import { useEffect, useState } from "react";
import type { SubtitleItem } from "../../state/store";

/**
 * Lines that just dropped out of the visible stack, kept for `ms` so they can fade out where
 * they were (§F13 "lines older than the stack fade out"). `visible` must be referentially
 * stable while its contents don't change (select it with `useShallow`).
 */
export function useLeavingItems(visible: SubtitleItem[], ms = 200): SubtitleItem[] {
  const [prevVisible, setPrevVisible] = useState(visible);
  const [leaving, setLeaving] = useState<SubtitleItem[]>([]);
  if (prevVisible !== visible) {
    setPrevVisible(visible);
    const gone = prevVisible.filter((p) => !visible.some((v) => v.id === p.id));
    if (gone.length > 0) {
      setLeaving((l) => [...l.filter((x) => !visible.some((v) => v.id === x.id)), ...gone]);
    }
  }
  useEffect(() => {
    if (leaving.length === 0) return;
    const handle = setTimeout(() => setLeaving([]), ms);
    return () => clearTimeout(handle);
  }, [leaving, ms]);
  return leaving;
}
