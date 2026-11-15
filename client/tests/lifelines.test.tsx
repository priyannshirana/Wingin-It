import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSLATION_REVEAL_MS } from "../src/config";
import type { Lang, Role } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { Lifelines } from "../src/ui/Lifelines";
import { Subtitles } from "../src/ui/Subtitles";
import { isDecodable, PENDING_CAP_MS, requestLifeline } from "../src/ui/subtitles/lifeline";
import { flyerPlayer, gameState, player, roomState, utterance, welcome } from "./fixtures/messages";

const sent = vi.hoisted(() => [] as unknown[]);
vi.mock("../src/net/socket", () => ({ send: (msg: unknown) => sent.push(msg) }));

const receive = (...msgs: Parameters<ReturnType<typeof useStore.getState>["receive"]>[0][]) =>
  act(() => msgs.forEach((m) => useStore.getState().receive(m)));

/** Me as `role` in `lang`, phase 3 PLAYING with lifelines on. */
function phase3(role: Role, lang: Lang, left = 3) {
  const other: Lang = lang === "en" ? "hi" : "en";
  receive(
    welcome(),
    { type: "joined", player_id: `p-${role}`, token: "t", role, lang, gender: "male", name: "Me" },
    roomState({
      status: "PLAYING",
      players: [
        player({ lang: role === "tower" ? lang : other }),
        flyerPlayer({ lang: role === "flyer" ? lang : other }),
      ],
    }),
    gameState({
      phase: 3,
      signal_level: 3,
      lifelines_enabled: true,
      lifelines: { flyer: role === "flyer" ? left : 3, tower: role === "tower" ? left : 3 },
    }),
  );
}

const line = (id: string) =>
  screen.getAllByTestId("subtitle-line").find((l) => l.textContent?.includes(`#${id}`));

function partnerLines(n: number, from: Role = "tower", available = true) {
  for (let i = 0; i < n; i++) {
    receive(
      utterance({
        id: `u${i}`,
        speaker_role: from,
        level: 3,
        lifeline_available: available,
        segments: [{ text: `line #u${i}`, kind: "plain" }],
      }),
    );
  }
}

beforeEach(() => {
  useStore.getState().reset();
  sent.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("decode eligibility (§F13)", () => {
  it("only the partner's last 3 lines with lifeline_available are decodable", () => {
    phase3("flyer", "en");
    partnerLines(5);
    const s = useStore.getState();
    expect(["u0", "u1", "u2", "u3", "u4"].map((id) => isDecodable(s, id))).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
    render(<Subtitles stack={5} fontSize={20} />);
    expect(screen.getAllByTestId("decode")).toHaveLength(3);
  });

  it("nothing is decodable during an in-phase cinematic or event (input_locked)", () => {
    phase3("flyer", "en");
    partnerLines(1);
    render(<Subtitles stack={3} fontSize={26} />);
    expect(screen.getByTestId("decode")).toBeTruthy();
    // e.g. lightning_strike / p3_runway_reveal: still PLAYING with lifelines on, but locked.
    receive(gameState({ phase: 3, lifelines_enabled: true, input_locked: true }));
    expect(isDecodable(useStore.getState(), "u0")).toBe(false);
    expect(screen.queryByTestId("decode")).toBeNull();
    act(() => requestLifeline("u0"));
    expect(sent).toEqual([]);
    receive(gameState({ phase: 3, lifelines_enabled: true, input_locked: false }));
    expect(screen.getByTestId("decode")).toBeTruthy();
  });

  it("nothing is decodable while lifelines are off or the server says unavailable", () => {
    phase3("flyer", "en");
    partnerLines(2, "tower", false);
    expect(isDecodable(useStore.getState(), "u1")).toBe(false);
    receive(utterance({ id: "ok", lifeline_available: true, level: 3 }));
    expect(isDecodable(useStore.getState(), "ok")).toBe(true);
    receive(gameState({ phase: 3, lifelines_enabled: false }));
    expect(isDecodable(useStore.getState(), "ok")).toBe(false);
  });

  it("works the same for a Hindi Tower decoding an English Flyer (§A2 rule 9)", () => {
    phase3("tower", "hi");
    partnerLines(1, "flyer");
    render(<Subtitles stack={5} fontSize={20} />);
    fireEvent.click(within(line("u0") ?? document.body).getByTestId("decode"));
    expect(sent).toEqual([{ type: "lifeline", utterance_id: "u0" }]);
    expect(screen.getByTestId("lifeline-decoding").textContent).toContain("अनुवाद हो रहा है…");
  });
});

describe("decode → reveal → collapse to 'show' (§F13)", () => {
  it("click sends one lifeline, spins, pins the reveal, and once unpinned offers a free 'show'", () => {
    vi.useFakeTimers();
    phase3("flyer", "en");
    partnerLines(1);
    render(<Subtitles stack={3} fontSize={26} />);
    fireEvent.click(screen.getByTestId("decode"));
    expect(sent).toEqual([{ type: "lifeline", utterance_id: "u0" }]);
    expect(screen.getByTestId("lifeline-decoding").textContent).toContain("Decoding…");
    // Pending: not decodable again (no double spend).
    expect(screen.queryByTestId("decode")).toBeNull();

    receive({
      type: "translation",
      utterance_id: "u0",
      text: "Which light is on?",
      lang: "en",
      lifelines_left: 2,
    });
    expect(screen.queryByTestId("lifeline-decoding")).toBeNull();
    expect(screen.getByTestId("translation").textContent).toBe("Which light is on?");
    expect(screen.getByTestId("translation").getAttribute("lang")).toBe("en");

    act(() => {
      vi.advanceTimersByTime(TRANSLATION_REVEAL_MS - 100);
    });
    expect(screen.getByTestId("translation")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Pinned: the translation outlives the 6 s reveal window until dismissed.
    expect(screen.getByTestId("translation")).toBeTruthy();
    fireEvent.click(screen.getByTestId("unpin"));
    act(() => {
      vi.advanceTimersByTime(10); // the expired reveal collapses at once
    });
    expect(screen.queryByTestId("translation")).toBeNull();
    const show = screen.getByTestId("lifeline-show");
    expect(show.textContent).toBe("show");

    fireEvent.click(show);
    expect(screen.getByTestId("translation").textContent).toBe("Which light is on?");
    expect(sent).toHaveLength(1); // re-opening is client-side only
    expect(screen.getByTestId("pin-marker")).toBeTruthy(); // re-opened = pinned again
  });

  it("a Hindi player's translation renders in Devanagari with lang=hi", () => {
    phase3("flyer", "hi");
    partnerLines(1);
    render(<Subtitles stack={3} fontSize={26} />);
    fireEvent.click(screen.getByTestId("decode"));
    receive({
      type: "translation",
      utterance_id: "u0",
      text: "कौन सी लाइट जल रही है?",
      lang: "hi",
      lifelines_left: 2,
    });
    const tr = screen.getByTestId("translation");
    expect(tr.textContent).toBe("कौन सी लाइट जल रही है?");
    expect(tr.getAttribute("lang")).toBe("hi");
  });

  it("with 0 lifelines left a click toasts no_lifelines and sends nothing", () => {
    phase3("flyer", "en", 0);
    partnerLines(1);
    render(<Subtitles stack={3} fontSize={26} />);
    fireEvent.click(screen.getByTestId("decode"));
    expect(sent).toEqual([]);
    expect(useStore.getState().toasts.map((t) => t.key)).toEqual(["toast.no_lifelines"]);
    expect(screen.queryByTestId("lifeline-decoding")).toBeNull();
  });

  it("translation_failed clears the spinner, toasts, and the line stays decodable", () => {
    phase3("flyer", "en");
    partnerLines(1);
    render(<Subtitles stack={3} fontSize={26} />);
    fireEvent.click(screen.getByTestId("decode"));
    receive({ type: "error", code: "translation_failed", message: "x" });
    expect(screen.queryByTestId("lifeline-decoding")).toBeNull();
    expect(useStore.getState().toasts.map((t) => t.key)).toContain("toast.translation_failed");
    expect(screen.getByTestId("decode")).toBeTruthy();
  });

  it("a double-click spends exactly one lifeline (also on a stale retry)", () => {
    vi.useFakeTimers();
    phase3("flyer", "en");
    partnerLines(1);
    render(<Subtitles stack={3} fontSize={26} />);
    const button = screen.getByTestId("decode");
    fireEvent.click(button);
    fireEvent.click(button);
    act(() => {
      requestLifeline("u0");
      requestLifeline("u0");
    });
    expect(sent).toEqual([{ type: "lifeline", utterance_id: "u0" }]);
    act(() => {
      vi.advanceTimersByTime(PENDING_CAP_MS + 10);
    });
    act(() => {
      requestLifeline("u0", true);
      requestLifeline("u0", true);
    });
    expect(sent).toHaveLength(2);
  });

  it("a translation arriving after the spinner gave up is still shown", () => {
    vi.useFakeTimers();
    phase3("flyer", "en");
    partnerLines(1);
    render(<Subtitles stack={3} fontSize={26} />);
    fireEvent.click(screen.getByTestId("decode"));
    act(() => {
      vi.advanceTimersByTime(PENDING_CAP_MS + 10);
    });
    expect(screen.queryByTestId("lifeline-decoding")).toBeNull();
    receive({
      type: "translation",
      utterance_id: "u0",
      text: "Late but here",
      lang: "en",
      lifelines_left: 2,
    });
    expect(screen.getByTestId("translation").textContent).toBe("Late but here");
    expect(screen.queryByTestId("decode")).toBeNull();
  });

  it("a decode that never gets an answer stops spinning and can be retried", () => {
    vi.useFakeTimers();
    phase3("flyer", "en");
    partnerLines(1);
    render(<Subtitles stack={3} fontSize={26} />);
    fireEvent.click(screen.getByTestId("decode"));
    act(() => {
      vi.advanceTimersByTime(PENDING_CAP_MS + 10);
    });
    expect(screen.queryByTestId("lifeline-decoding")).toBeNull();
    fireEvent.click(screen.getByTestId("decode"));
    expect(sent).toHaveLength(2);
    expect(screen.getByTestId("lifeline-decoding")).toBeTruthy();
  });

  it("rejoin history with a translation shows the collapsed 'show' link", () => {
    phase3("flyer", "en");
    receive({
      type: "history",
      utterances: [
        { ...utterance({ id: "h1", level: 3, lifeline_available: true }), translation: "Hi" },
      ],
    });
    render(<Subtitles stack={3} fontSize={26} />);
    expect(screen.getByTestId("lifeline-show")).toBeTruthy();
    expect(screen.queryByTestId("decode")).toBeNull();
  });
});

describe("Lifelines dots + hint (§F13)", () => {
  it("is hidden outside phase 3", () => {
    receive(gameState());
    render(<Lifelines />);
    expect(screen.queryByTestId("lifelines")).toBeNull();
  });

  it("shows 3 dots, filled = my remaining lifelines, and the hint in my language", () => {
    phase3("tower", "hi", 2);
    render(<Lifelines />);
    const dots = screen.getAllByTestId("lifeline-dot");
    expect(dots.map((d) => d.dataset.filled)).toEqual(["true", "true", "false"]);
    expect(screen.getByTestId("lifelines").textContent).toContain(
      "अनुवाद देखने के लिए सबटाइटल पर टैप करो",
    );
  });

  it("pops in on the p3_intro cue before lifelines are enabled", () => {
    receive(gameState({ phase: 3 }));
    act(() => useStore.getState().setCue("lifeline_dots_pop", true));
    render(<Lifelines />);
    expect(screen.getAllByTestId("lifeline-dot")[0]?.className).toContain("animate-pop");
  });
});

describe("pinned lifelined line (§F13)", () => {
  const decode = (id: string) => {
    receive({
      type: "translation",
      utterance_id: id,
      text: `tr-${id}`,
      lang: "en",
      lifelines_left: 2,
    });
  };

  it("keeps the lifelined line and its translation pinned while newer lines arrive", () => {
    phase3("tower", "hi");
    partnerLines(1, "flyer");
    render(<Subtitles stack={3} fontSize={20} />);
    decode("u0");
    for (const id of ["a", "b", "c", "d"]) {
      receive(
        utterance({ id, speaker_role: "flyer", segments: [{ text: `x #${id}`, kind: "plain" }] }),
      );
    }
    expect(screen.getByTestId("pin-marker").textContent).toContain("पिन किया");
    expect(screen.getByTestId("translation").textContent).toBe("tr-u0");
    expect(screen.getAllByTestId("subtitle-line")).toHaveLength(3);
    // another lifeline replaces it
    decode("d");
    expect(screen.getByTestId("translation").textContent).toBe("tr-d");
  });

  it("unpins on the x button and when the next step starts", () => {
    phase3("flyer", "en");
    partnerLines(2);
    render(<Subtitles stack={3} fontSize={26} />);
    decode("u0");
    fireEvent.click(screen.getByTestId("unpin"));
    expect(screen.queryByTestId("pin-marker")).toBeNull();
    decode("u1");
    expect(screen.getByTestId("pin-marker")).toBeTruthy();
    receive(gameState({ phase: 3, lifelines_enabled: true, action_id: "P3_A2", action_index: 1 }));
    expect(screen.queryByTestId("pin-marker")).toBeNull();
  });
});
