import { describe, expect, it } from "vitest";

// §A2 / §F22: the client may import only stations.json and cinematics.json from content/.
// Reads every source file as raw text through Vite, so dynamic imports and globs are covered.
const sources = import.meta.glob<string>("../src/**/*.{ts,tsx,js,jsx,mts,css}", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Any mention of the alias or a relative path into a `content/` folder.
const CONTENT_REF = /@content|(?:\.\.?\/)+content\//g;
// The only accepted alias form: an allowed file name followed by the closing quote. Wildcards,
// braces, template strings, concatenation, query suffixes and a bare alias all fail it.
const ALLOWED_ALIAS = /^@content\/(?:stations|cinematics)\.json["'`]/;
const QUOTES = new Set(["'", '"', "`"]);

/** Minimal posix normalize for "a/b/../c" → "a/c" (leading ".." kept). */
function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/**
 * Relative references are fine only when they are a closed string literal that resolves to one
 * of our own typed modules in src/content/ (e.g. "../content/stations"), never the repo's
 * content/ folder or a dynamic path.
 */
function relativeAllowed(file: string, text: string, index: number): boolean {
  const open = text[index - 1];
  if (open === undefined || !QUOTES.has(open)) return false;
  const close = text.indexOf(open, index);
  if (close < 0) return false;
  const spec = text.slice(index, close);
  if (open === "`" && spec.includes("${")) return false;
  const dir = file.split("/").slice(0, -1).join("/");
  const resolved = normalize(`${dir}/${spec}`);
  return /^\.\.\/src\/content\/[\w-]+$/.test(resolved);
}

/** Returns every disallowed content reference in `text` (with a little context). */
function contentViolations(file: string, text: string): string[] {
  const bad: string[] = [];
  for (const match of text.matchAll(CONTENT_REF)) {
    const rest = text.slice(match.index);
    const ok =
      match[0] === "@content" ? ALLOWED_ALIAS.test(rest) : relativeAllowed(file, text, match.index);
    if (!ok) bad.push(rest.slice(0, 40));
  }
  return bad;
}

const SAMPLE_FILE = "../src/ui/Sample.tsx";

describe("privacy: content imports", () => {
  it("scans the client sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
  });

  it("references content only as @content/stations.json or @content/cinematics.json", () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(contentViolations(file, text), file).toEqual([]);
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
    const ok = [
      'import a from "@content/stations.json";',
      "import b from '@content/cinematics.json';",
      'import { getStation } from "../content/stations";',
    ];
    for (const sample of ok) expect(contentViolations(SAMPLE_FILE, sample), sample).toEqual([]);
    expect(contentViolations("../src/content/x.ts", 'import { readInt } from "./read";')).toEqual(
      [],
    );
  });

  it("self-test: the checker catches globs, concatenation and other files", () => {
    const leaks = [
      'const all = import.meta.glob("@content/*.json", { eager: true });',
      'import.meta.glob("@content/{stations,lexicon}.json")',
      'const m = await import("@content/" + name);',
      "const m = await import(`@content/${name}.json`);",
      'import x from "@content";',
      'import l from "@content/lexicon.json";',
      'import s from "@content/stations.json?raw";',
      'import p from "../../../content/phase1_pilot_down.json";',
      'import s from "../../../content/stations.json";',
      'const m = await import("../content/" + name);',
      "const m = await import(`../content/${name}`);",
      'import.meta.glob("../../../content/*.json")',
    ];
    for (const sample of leaks) {
      expect(contentViolations(SAMPLE_FILE, sample), sample).not.toEqual([]);
    }
  });
});
