import type { QuickLine } from "../net/protocol";

/** The text a quick line sends: Devanagari `alt_text` when the dev toggle is on (§F18.2). */
export function quickText(line: QuickLine, sendDevanagari: boolean): string {
  return sendDevanagari && line.alt_text ? line.alt_text : line.text;
}
