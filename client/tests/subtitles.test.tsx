import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lang, Role, Segment } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { Subtitles } from "../src/ui/Subtitles";
import { SubtitleLine } from "../src/ui/subtitles/SubtitleLine";
import { GLOSS_CLASS, KEYWORD_CHIP_CLASS } from "../src/ui/subtitles/styles";
import {
  flyerPlayer,
  gameState,
  kw,
  plain,
  player,
  roomState,
  utterance,
  welcome,
} from "./fixtures/messages";

const DEVANAGARI = /[ऀ-ॿ]/;

const twice = (text: string, gloss: string | null): Segment => ({
  text,
  kind: "keyword",
  concepts: ["TWO", "TIMES"],
  gloss,
});

function join(role: Role, lang: Lang) {
  const s = useStore.getState();
  s.receive(welcome());
  s.receive({
    type: "joined",
    player_id: `p-${role}`,
    token: "t",
    role,
    lang,
    gender: "female",
    name: "Me",
  });
  const other: Lang = lang === "en" ? "hi" : "en";
  s.receive(
    roomState({
      status: "PLAYING",
      players: [
        player({ lang: role === "tower" ? lang : other, gender: "male" }),
        flyerPlayer({ lang: role === "flyer" ? lang : other, gender: "female" }),
      ],
    }),
  );
  s.receive(gameState());
}

beforeEach(() => useStore.getState().reset());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SubtitleLine (§F13)", () => {
  it("renders the segments in order, spaces preserved", () => {
    const { container } = render(
      <SubtitleLine
        segments={[kw("laal", "RED", "red"), plain(" button "), kw("dabao", "PRESS", null)]}
      />,
    );
    const parts = Array.from(container.querySelectorAll("[data-kind]"), (s) => s.textContent);
    expect(parts).toEqual(["laal", " button ", "dabao"]);
    expect(container.textContent).toBe("laal[red] button dabao");
  });

  it("renders every keyword chip with the same classes, whatever the concept", () => {
    render(
      <SubtitleLine
        segments={[
          kw("laal", "RED", "red"),
          plain(" "),
          kw("hara", "GREEN", "green"),
          plain(" "),
          kw("aag", "FIRE", null),
          plain(" "),
          kw("neeche", "DOWN", "down"),
          plain(" "),
          twice("do baar", "twice"),
          plain(" "),
          kw("button", undefined, null),
        ]}
      />,
    );
    const chips = screen.getAllByTestId("keyword-chip");
    expect(chips).toHaveLength(6);
    expect(new Set(chips.map((c) => c.className)).size).toBe(1);
    expect(chips[0]?.className).toBe(KEYWORD_CHIP_CLASS);
    // Nothing per-chip may differ: no inline style, no concept attribute to style by.
    for (const chip of chips) {
      expect(chip.getAttribute("style")).toBeNull();
      expect(chip.getAttributeNames().sort()).toEqual(["class", "data-kind", "data-testid"]);
    }
  });

  it("puts the gloss in [brackets] right after its chip, only when non-null", () => {
    render(
      <SubtitleLine
        segments={[kw("laal", "RED", "red"), plain(" "), kw("dabao", "PRESS", null)]}
      />,
    );
    const glosses = screen.getAllByTestId("gloss");
    expect(glosses.map((g) => g.textContent)).toEqual(["[red]"]);
    expect(glosses[0]?.className).toBe(GLOSS_CLASS);
    expect(glosses[0]?.previousElementSibling?.textContent).toBe("laal");
  });

  it("every gloss has the same classes whatever the concept, and sticks to its chip", () => {
    render(
      <SubtitleLine
        segments={[
          kw("laal", "RED", "red"),
          plain(" "),
          kw("aag", "FIRE", "fire"),
          plain(" "),
          kw("neeche", "DOWN", "down"),
          plain(" "),
          twice("do baar", "twice"),
        ]}
      />,
    );
    const glosses = screen.getAllByTestId("gloss");
    expect(glosses).toHaveLength(4);
    expect(new Set(glosses.map((g) => g.className))).toEqual(new Set([GLOSS_CLASS]));
    for (const g of glosses) {
      expect(g.getAttribute("style")).toBeNull();
      // Chip + gloss share one no-wrap parent, so the gloss never wraps away from its chip.
      const unit = g.parentElement;
      expect(unit?.className).toBe("whitespace-nowrap");
      expect(unit?.querySelector("[data-testid=keyword-chip]")).toBeTruthy();
    }
  });

  it("a two-concept 'twice' token is one chip with one gloss", () => {
    render(<SubtitleLine segments={[plain("teen "), twice("do baar", "twice")]} />);
    expect(screen.getAllByTestId("keyword-chip").map((c) => c.textContent)).toEqual(["do baar"]);
    expect(screen.getAllByTestId("gloss").map((g) => g.textContent)).toEqual(["[twice]"]);
  });

  it("never renders Devanagari from Latin segments (both pairings)", () => {
    // English listener: Hindi romanized chips + English glosses.
    const en = render(
      <SubtitleLine
        segments={[
          kw("teen", "THREE", "three"),
          plain(" number button "),
          kw("dabao", "PRESS", "press"),
        ]}
      />,
    );
    expect(en.container.textContent).not.toMatch(DEVANAGARI);
    en.unmount();
    // Hindi listener: English chips + romanized-Hindi glosses.
    const hi = render(
      <SubtitleLine
        segments={[
          plain("Press the "),
          kw("red", "RED", "laal"),
          plain(" one "),
          twice("twice", "do baar"),
        ]}
      />,
    );
    expect(hi.container.textContent).toBe("Press the red[laal] one twice[do baar]");
    expect(hi.container.textContent).not.toMatch(DEVANAGARI);
  });
});

describe("Subtitles stack (§F13)", () => {
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

  it("fades older lines (35% / 60% / 100%) and sizes the newest at fontSize", () => {
    act(() => {
      for (let i = 0; i < 3; i++)
        useStore.getState().receive(utterance({ id: `u${i}`, segments: [plain(`line ${i}`)] }));
    });
    render(<Subtitles stack={3} fontSize={26} />);
    const lines = screen.getAllByTestId("subtitle-line");
    expect(lines.map((l) => l.style.opacity)).toEqual(["0.35", "0.6", "1"]);
    expect(lines.map((l) => l.style.fontSize)).toEqual(["21px", "21px", "26px"]);
  });

  it("the Tower stack of 5 fades 35% / 50% / 65% / 80% / 100%", () => {
    act(() => {
      for (let i = 0; i < 6; i++)
        useStore.getState().receive(utterance({ id: `u${i}`, segments: [plain(`line ${i}`)] }));
    });
    render(<Subtitles stack={5} fontSize={20} />);
    const lines = screen.getAllByTestId("subtitle-line");
    expect(lines.map((l) => l.style.opacity)).toEqual(["0.35", "0.5", "0.65", "0.8", "1"]);
    expect(lines.map((l) => l.style.fontSize)).toEqual(["16px", "16px", "16px", "16px", "20px"]);
  });

  it("a line pushed out of the stack fades out, then is gone", () => {
    vi.useFakeTimers();
    act(() => {
      for (let i = 0; i < 3; i++)
        useStore.getState().receive(utterance({ id: `u${i}`, segments: [plain(`line ${i}`)] }));
    });
    render(<Subtitles stack={3} fontSize={26} />);
    act(() => useStore.getState().receive(utterance({ id: "u3", segments: [plain("line 3")] })));
    expect(screen.getByTestId("subtitle-leaving").textContent).toContain("line 0");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.queryByTestId("subtitle-leaving")).toBeNull();
  });

  it("phase 3 lines get the one-shot glitch; phase 1 lines don't", () => {
    act(() => {
      useStore.getState().receive(utterance({ id: "a", level: 1 }));
      useStore.getState().receive(utterance({ id: "b", level: 3 }));
    });
    render(<Subtitles stack={3} fontSize={26} />);
    const bars = screen.getAllByTestId("subtitle-line").map((l) => l.firstElementChild);
    // Phase 1: the plain slide-in. Phase 3: one class that runs slide-in + flicker together, so
    // neither animation overrides the other.
    expect(bars[0]?.className).toContain("animate-slide-up");
    expect(bars[0]?.className).not.toContain("wingin-sub-glitch");
    expect(bars[1]?.className).toContain("wingin-sub-glitch-in");
    expect(bars[1]?.className).not.toContain("animate-slide-up");
  });

  it("the tag and portrait follow the speaker; the tag is in the viewer's language", () => {
    act(() => {
      join("flyer", "hi");
      useStore.getState().receive(utterance({ speaker_role: "tower", lang: "en" }));
    });
    const { container } = render(<Subtitles stack={3} fontSize={26} />);
    expect(container.textContent).toContain("टावर");
    expect(container.querySelector("[data-portrait]")?.getAttribute("data-portrait")).toBe(
      "tower-male",
    );
  });

  it("glosses fade across the phases: all → some → none (server-driven)", () => {
    act(() => {
      useStore.getState().receive(
        utterance({
          id: "p1",
          level: 1,
          segments: [kw("laal", "RED", "red"), plain(" "), kw("dabao", "PRESS", "press")],
        }),
      );
      useStore.getState().receive(
        utterance({
          id: "p2",
          level: 2,
          segments: [kw("laal", "RED", null), plain(" "), kw("aag", "FIRE", "fire")],
        }),
      );
      useStore.getState().receive(
        utterance({
          id: "p3",
          level: 3,
          segments: [kw("laal", "RED", null), plain(" "), kw("dabao", "PRESS", null)],
        }),
      );
    });
    render(<Subtitles stack={3} fontSize={26} />);
    const glossCount = screen
      .getAllByTestId("subtitle-line")
      .map((l) => l.querySelectorAll("[data-testid=gloss]").length);
    expect(glossCount).toEqual([2, 1, 0]);
  });
});
