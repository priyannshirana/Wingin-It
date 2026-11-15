import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../src/state/store";
import { SubtitleLine, Subtitles } from "../src/ui/Subtitles";
import { kw, plain, utterance } from "./fixtures/messages";

const DEVANAGARI = /[ऀ-ॿ]/;

beforeEach(() => useStore.getState().reset());
afterEach(cleanup);

describe("Subtitles (§F13, M1 plain rendering)", () => {
  it("renders the segments in order, spaces preserved", () => {
    const { container } = render(
      <SubtitleLine
        segments={[kw("laal", "RED", "red"), plain(" button "), kw("dabao", "PRESS", null)]}
      />,
    );
    const spans = Array.from(container.querySelectorAll("span"));
    expect(spans.map((s) => s.textContent)).toEqual(["laal", " button ", "dabao"]);
    expect(container.textContent).toBe("laal button dabao");
  });

  it("never renders Devanagari from Latin segments", () => {
    const { container } = render(
      <SubtitleLine
        segments={[plain("Teen number "), kw("button", undefined, null), plain(" dabao")]}
      />,
    );
    expect(container.textContent).not.toMatch(DEVANAGARI);
  });

  it("shows the last N lines of the stack, newest last", () => {
    act(() => {
      for (let i = 0; i < 6; i++)
        useStore.getState().receive(utterance({ id: `u${i}`, segments: [plain(`line ${i}`)] }));
    });
    render(<Subtitles stack={3} fontSize={26} />);
    const lines = screen.getAllByTestId("subtitle-line").map((l) => l.textContent ?? "");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("line 3");
    expect(lines[2]).toContain("line 5");
  });
});
