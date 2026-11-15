// What the fake does with a typed line before it becomes a subtitle, after BACKEND_SPEC §B11.1 and
// §B11.3: subtitles are Latin only (§A2 rule 3), so Devanagari is romanized (a small override list,
// then the Hinglish fallback romanizer), digits 1–4 become the speaker's number word, and the
// first letter of every sentence is capitalized. Devanagari never reaches a segment.
import type { Lang } from "../../src/net/protocol";

const DEVA = /[ऀ-ॿ]/;
const DEVA_DIGITS = "०१२३४५६७८९";

/** Overrides for the words the fake's own script uses (the real server reads its lexicon). */
const OVERRIDES: Record<string, string> = {
  लाइट: "light",
  बटन: "button",
  लीवर: "lever",
  स्विच: "switch",
  हैंडल: "handle",
  ब्रेक: "brake",
  करो: "karo",
  दबाओ: "dabao",
  खींचो: "kheencho",
  लाल: "laal",
  नीला: "neela",
  पीला: "peela",
  हाँ: "haan",
  हां: "haan",
  एक: "ek",
  दो: "do",
  तीन: "teen",
  चार: "chaar",
  नंबर: "number",
  आग: "aag",
  बार: "baar",
  चालू: "chalu",
  नीचे: "neeche",
  पहले: "pehle",
  फिर: "phir",
  हम: "hum",
};

const NUMBER_WORDS: Record<Lang, string[]> = {
  en: ["one", "two", "three", "four"],
  hi: ["ek", "do", "teen", "chaar"],
};

const CONSONANTS: Record<string, string> = {
  क: "k",
  ख: "kh",
  ग: "g",
  घ: "gh",
  ङ: "n",
  च: "ch",
  छ: "chh",
  ज: "j",
  झ: "jh",
  ञ: "n",
  ट: "t",
  ठ: "th",
  ड: "d",
  ढ: "dh",
  ण: "n",
  त: "t",
  थ: "th",
  द: "d",
  ध: "dh",
  न: "n",
  प: "p",
  फ: "ph",
  ब: "b",
  भ: "bh",
  म: "m",
  य: "y",
  र: "r",
  ल: "l",
  व: "v",
  श: "sh",
  ष: "sh",
  स: "s",
  ह: "h",
};
/** Consonant + nukta (U+093C). */
const NUKTA: Record<string, string> = {
  क: "q",
  ख: "kh",
  ग: "g",
  ज: "z",
  ड: "r",
  ढ: "rh",
  फ: "f",
};
const VOWELS: Record<string, string> = {
  अ: "a",
  आ: "aa",
  इ: "i",
  ई: "ee",
  उ: "u",
  ऊ: "oo",
  ए: "e",
  ऐ: "ai",
  ओ: "o",
  औ: "au",
  ऋ: "ri",
  ऑ: "o",
};
const MATRAS: Record<string, string> = {
  "ा": "aa",
  "ि": "i",
  "ी": "ee",
  "ु": "u",
  "ू": "oo",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
  "ृ": "ri",
  "ॉ": "o",
  "ॅ": "e",
};
const VIRAMA = "्";
const NUKTA_MARK = "़";

/** The fallback romanizer (§B11.3): readable Hinglish, with schwa deletion at the end. */
export function romanize(word: string): string {
  const s = word.normalize("NFC");
  const out: { t: string; inherent: boolean }[] = [];
  let aksharas = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    const cons = CONSONANTS[ch];
    if (cons !== undefined) {
      aksharas++;
      let c = cons;
      let j = i + 1;
      if (s.charAt(j) === NUKTA_MARK) {
        c = NUKTA[ch] ?? c;
        j++;
      }
      const next = s.charAt(j);
      const matra = MATRAS[next];
      if (next === VIRAMA) {
        out.push({ t: c, inherent: false });
        i = j;
      } else if (matra !== undefined) {
        out.push({ t: c + matra, inherent: false });
        i = j;
      } else {
        out.push({ t: `${c}a`, inherent: true });
        i = j - 1;
      }
      continue;
    }
    const vowel = VOWELS[ch];
    if (vowel !== undefined) {
      aksharas++;
      out.push({ t: vowel, inherent: false });
    } else if (ch === "ं" || ch === "ँ") {
      const next = s.charAt(i + 1);
      out.push({ t: next !== "" && "पफबभम".includes(next) ? "m" : "n", inherent: false });
    } else if (ch === "ः") {
      out.push({ t: "h", inherent: false });
    } else if (ch !== NUKTA_MARK && ch !== VIRAMA) {
      const d = DEVA_DIGITS.indexOf(ch);
      out.push({ t: d >= 0 ? String(d) : ch, inherent: false });
    }
  }
  const last = out[out.length - 1];
  if (last?.inherent && aksharas >= 2) last.t = last.t.slice(0, -1);
  return out.map((p) => p.t).join("");
}

function displayToken(token: string, speaker: Lang): string {
  if (/^[0-9०-९]+$/.test(token)) {
    const ascii = token.replace(/[०-९]/g, (d) => String(DEVA_DIGITS.indexOf(d)));
    const n = Number(ascii);
    return ascii.length === 1 && n >= 1 && n <= 4 ? (NUMBER_WORDS[speaker][n - 1] ?? ascii) : ascii;
  }
  if (!DEVA.test(token)) return token; // Latin: as typed, case kept
  const override = OVERRIDES[token.normalize("NFC")];
  return (override ?? romanize(token)).toLowerCase();
}

/** Latin subtitle text for what a player typed or said (also the speaker's `utterance_echo`). */
export function subtitleText(text: string, speaker: Lang): string {
  const parts = text.normalize("NFC").split(/([\s।॥.,!?;:"“”‘’()[\]{}—–…/\\-]+)/);
  const built = parts
    .map((part, i) => {
      if (i % 2 === 1) return part.replace(/[।॥]/g, ".");
      return part === "" ? "" : displayToken(part, speaker);
    })
    .join("");
  // Capitalize the first letter of the subtitle and after . ! ?
  return built.replace(
    /(^|[.!?]\s+)(\p{L})/gu,
    (_m, lead: string, c: string) => lead + c.toUpperCase(),
  );
}
