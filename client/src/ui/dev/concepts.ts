import type { ConceptId } from "../../net/protocol";

/** All 20 concepts in §A6 order (phase 1's 15, then phase 2's 5): the exposure table rows. */
export const CONCEPTS = [
  "RED",
  "GREEN",
  "BLUE",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "PRESS",
  "PULL",
  "ON",
  "OFF",
  "YES",
  "NO",
  "WHICH",
  "TIMES",
  "FIRE",
  "LEFT",
  "RIGHT",
  "YELLOW",
  "DOWN",
] as const satisfies readonly ConceptId[];

// Compile-time check that the list covers every ConceptId.
type Missing = Exclude<ConceptId, (typeof CONCEPTS)[number]>;
const complete: Missing extends never ? true : Missing = true;
void complete;
