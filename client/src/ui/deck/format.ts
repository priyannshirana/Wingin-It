// Pure helpers for the word deck (§F17), kept out of the components so they're unit-testable.
import type { DeckWord } from "../../net/protocol";

/** Seconds → "mm:ss" ("05:07", "12:00", "75:00"); rounds to whole seconds, negatives clamp to 0. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Learned words first, then the rest; the server's order is kept inside each group (§B15.1). */
export function splitWords(words: readonly DeckWord[]): {
  learned: DeckWord[];
  learning: DeckWord[];
} {
  return {
    learned: words.filter((w) => w.learned),
    learning: words.filter((w) => !w.learned),
  };
}

/** Split a template around its `{n}` slot ("Your partner taught you {n} words"). */
export function splitAtSlot(template: string, slot = "{n}"): [string, string] {
  const i = template.indexOf(slot);
  if (i < 0) return [template, ""];
  return [template.slice(0, i), template.slice(i + slot.length)];
}

/** User-perceived characters, so the typing animation never splits a Devanagari conjunct. */
export function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}
