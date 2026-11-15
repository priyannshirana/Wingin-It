export interface ModeFlags {
  demo: boolean;
  mock: boolean;
  voice: boolean;
}

export const MODES = ["demo", "voice", "mock"] as const;

/** `?demo=1&voice=1`-style query for the checked modes ("" when none). */
export function modesQuery(flags: ModeFlags): string {
  const parts = MODES.filter((m) => flags[m]).map((m) => `${m}=1`);
  return parts.length ? `?${parts.join("&")}` : "";
}
