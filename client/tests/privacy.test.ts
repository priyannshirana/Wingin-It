import { describe, expect, it } from "vitest";

// §A2 / §F22: the client may import only stations.json and cinematics.json from content/.
// Reads every source file as raw text through Vite, so dynamic imports and globs are covered.
const sources = import.meta.glob<string>("../src/**/*.{ts,tsx,js,jsx,mts,css}", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Any mention of the alias or a relative path into content/ (no `\b`: catches `@content"` too).
const CONTENT_REF = /@content|(?:\.\.\/)+content\//g;
// The only accepted form: the alias + an allowed file name + a closing quote. Wildcards, braces,
// template strings, concatenation, a bare alias and relative paths all fail this.
const ALLOWED_REF = /^@content\/(?:stations|cinematics)\.json["'`]/;

/** Returns every disallowed content reference in `text` (with a little context). */
function contentViolations(text: string): string[] {
  const bad: string[] = [];
  for (const match of text.matchAll(CONTENT_REF)) {
    const rest = text.slice(match.index);
    if (!ALLOWED_REF.test(rest)) bad.push(rest.slice(0, 40));
  }
  return bad;
}

describe("privacy: content imports", () => {
  it("scans the client sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
  });

  it("references content only as @content/stations.json or @content/cinematics.json", () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(contentViolations(text), file).toEqual([]);
    }
  });

  it("never names lexicon.json or phase*.json", () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/lexicon\.json|phase\d[\w-]*\.json/);
    }
  });

  it("actually imports both public content files", () => {
    const all = Object.values(sources).join("\n");
    expect(all).toContain('from "@content/stations.json"');
    expect(all).toContain('from "@content/cinematics.json"');
  });

  it("self-test: the checker accepts the allowed forms", () => {
    expect(contentViolations('import a from "@content/stations.json";')).toEqual([]);
    expect(contentViolations("import b from '@content/cinematics.json';")).toEqual([]);
  });

  it("self-test: the checker catches globs, concatenation and other files", () => {
    const leaks = [
      'const all = import.meta.glob("@content/*.json", { eager: true });',
      'import.meta.glob("@content/{stations,lexicon}.json")',
      'const m = await import("@content/" + name);',
      "const m = await import(`@content/${name}.json`);",
      'import x from "@content";',
      'import l from "@content/lexicon.json";',
      'import p from "../../content/phase1_pilot_down.json";',
      'import s from "../content/stations.json";',
      'import s from "@content/stations.json?raw";',
    ];
    for (const sample of leaks) {
      expect(contentViolations(sample), sample).not.toEqual([]);
    }
  });
});
