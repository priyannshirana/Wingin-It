// Class lists shared by every subtitle keyword (§F13, §A2 rule 4). There is exactly ONE chip
// style: it never depends on the concept, the language or the speaker.

/**
 * `background: rgba(43,47,58,.78); color: #fff; border-bottom: 2px solid rgba(255,255,255,.7);
 * border-radius: .45em; padding: 0 .3em` (§F13).
 */
export const KEYWORD_CHIP_CLASS =
  "inline-block rounded-[.45em] border-b-2 border-white/70 bg-[rgba(43,47,58,0.78)] px-[.3em] text-white";

/** `[gloss]` right after the chip: muted yellow #E9D98B, 0.7 em, margin-left .2em (§F13). */
export const GLOSS_CLASS = "ml-[.2em] text-[0.7em] text-gloss";
