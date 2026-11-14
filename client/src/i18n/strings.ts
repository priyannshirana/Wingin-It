// Every user-facing string, in English and Hindi (§F7). Hindi values may be gendered
// (`{m, f}`), picked by the gender of the person the string is about.
// M0 holds only the keys the home stub needs; M1 adds the full §F7 table.
import type { Gender, Lang } from "../net/protocol";

export interface Gendered {
  m: string;
  f: string;
}

export interface StringEntry {
  en: string;
  hi: string | Gendered;
}

export const STRINGS = {
  // SPEC-ASSUMPTION: the logo is a brand mark, identical in both languages — §F8.1 gives the
  // text "WINGIN' IT!" but §F7 has no key for it, and every UI string must come from this file.
  "app.logo": { en: "WINGIN' IT!", hi: "WINGIN' IT!" },
  "app.tagline": {
    en: "A translator designed to make itself unnecessary.",
    hi: "एक अनुवादक, जो खुद को गैरज़रूरी बनाने के लिए बना है।",
  },
} satisfies Record<string, StringEntry>;

export type StringKey = keyof typeof STRINGS;

export type StringParams = Record<string, string | number>;

/** Looks up `key` in `lang`, picks the gendered Hindi form and fills `{name}` placeholders. */
export function translate(
  lang: Lang,
  key: StringKey,
  params?: StringParams,
  gender?: Gender,
): string {
  const entry: StringEntry = STRINGS[key];
  const value = lang === "en" ? entry.en : entry.hi;
  const text = typeof value === "string" ? value : gender === "female" ? value.f : value.m;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const param = params[name];
    return param === undefined ? match : String(param);
  });
}

/** The UI language before a player picks one: `hi*` browsers get Hindi, everyone else English. */
export function browserLang(): Lang {
  return navigator.language.toLowerCase().startsWith("hi") ? "hi" : "en";
}
