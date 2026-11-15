import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeckMsg, DeckWord, Gender, Lang, Role } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { formatClock, graphemes, splitAtSlot } from "../src/ui/deck/format";
import gsap from "gsap";
import { WordDeck } from "../src/ui/WordDeck";
import { deck, flyerPlayer, player, roomState, welcome } from "./fixtures/messages";

const sent = vi.hoisted(() => [] as unknown[]);
vi.mock("../src/net/socket", () => ({ send: (msg: unknown) => sent.push(msg) }));

const DEVANAGARI = /[ऀ-ॿ]/;

const word = (over: Partial<DeckWord> & Pick<DeckWord, "concept" | "word" | "meaning">) => ({
  meaning_script: "latin" as const,
  understood: 0,
  spoken: 0,
  learned: false,
  clip_url: null,
  ...over,
});

/** An English Flyer's deck: Hindi words (Latin), English meanings. Deliberately unsorted. */
function enFlyerDeck(over: Partial<DeckMsg> = {}): DeckMsg {
  return deck({
    partner_name: "Asha",
    partner_lang: "hi",
    partner_gender: "female",
    learned_count: 3,
    words: [
      word({ concept: "GREEN", word: "hara", meaning: "green" }),
      word({
        concept: "RED",
        word: "laal",
        meaning: "red",
        understood: 3,
        spoken: 1,
        learned: true,
        clip_url: "/clips/c_00aa11bb.wav",
      }),
      word({ concept: "YES", word: "haan", meaning: "yes", clip_url: "/clips/c_22cc33dd.wav" }),
      word({ concept: "PRESS", word: "dabao", meaning: "press", understood: 2, learned: true }),
      word({ concept: "FIRE", word: "aag", meaning: "fire", spoken: 1, learned: true }),
    ],
    report: null,
    report_pending: true,
    stats: {
      phases: [
        {
          phase: 1,
          fuel_left_s: 92.4,
          wrong_actions: 1,
          lifelines_used: 0,
          attempts: 1,
          time_s: 70,
        },
        { phase: 2, fuel_left_s: 61, wrong_actions: 0, lifelines_used: 0, attempts: 2, time_s: 95 },
        {
          phase: 3,
          fuel_left_s: 38.6,
          wrong_actions: 2,
          lifelines_used: 2,
          attempts: 1,
          time_s: 140,
        },
      ],
      wrong_actions_total: 3,
      lifelines_used: { mine: 2, partner: 1 },
      total_time_s: 427,
      fuel_left_final_s: 38.6,
    },
    ...over,
  });
}

/** A Hindi Tower's deck: English words, Devanagari meanings. */
function hiTowerDeck(): DeckMsg {
  return deck({
    partner_name: "Sam",
    partner_lang: "en",
    partner_gender: "male",
    learned_count: 2,
    words: [
      word({
        concept: "RED",
        word: "red",
        meaning: "लाल",
        meaning_script: "deva",
        understood: 2,
        learned: true,
      }),
      word({
        concept: "PRESS",
        word: "press",
        meaning: "दबाओ",
        meaning_script: "deva",
        spoken: 1,
        learned: true,
      }),
      word({ concept: "BLUE", word: "blue", meaning: "नीला", meaning_script: "deva" }),
    ],
    report: "सैम और आशा ने 38 सेकंड ईंधन बचाकर विमान उतार लिया।",
    report_pending: false,
  });
}

function enter(role: Role, lang: Lang, gender: Gender, msg: DeckMsg, votes: Role[] = []) {
  const s = useStore.getState();
  s.reset();
  s.receive(welcome());
  s.receive({
    type: "joined",
    player_id: role === "tower" ? "p-tower" : "p-flyer",
    token: "t",
    role,
    lang,
    gender,
    name: "Me",
  });
  s.receive(
    roomState({
      status: "DECK",
      play_again_votes: votes,
      players: [
        player({ lang: role === "tower" ? lang : msg.partner_lang }),
        flyerPlayer({ lang: role === "flyer" ? lang : msg.partner_lang }),
      ],
    }),
  );
  s.receive(msg);
}

class FakeAudio {
  static made: FakeAudio[] = [];
  readonly src: string;
  volume = 1;
  paused = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

beforeEach(() => {
  sent.length = 0;
  FakeAudio.made = [];
  vi.stubGlobal("Audio", FakeAudio);
  useStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const slots = () => screen.getAllByTestId("deck-slot");
const concepts = () =>
  slots().map((li) => li.querySelector("[data-concept]")?.getAttribute("data-concept"));

describe("word deck (§F17)", () => {
  it("puts learned words first, then the still-learning divider and the rest", () => {
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    render(<WordDeck />);
    expect(concepts()).toEqual(["RED", "PRESS", "FIRE", "GREEN", "YES"]);
    const divider = screen.getByTestId("deck-divider");
    expect(divider.textContent).toBe("Still learning");
    // The divider sits between the last learned card and the first still-learning one.
    const fire = slots()[2];
    const green = slots()[3];
    expect(fire && green).toBeTruthy();
    if (!fire || !green) return;
    expect(fire.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divider.compareDocumentPosition(green) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("greys still-learning cards and shows them without badges", () => {
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    render(<WordDeck />);
    for (const li of slots()) {
      const learned = li.getAttribute("data-learned") === "true";
      const wrapper = li.querySelector("[data-deal]");
      expect(wrapper?.className.includes("opacity-40")).toBe(!learned);
      const badges = within(li).queryAllByTestId("deck-badge");
      if (!learned) expect(badges).toHaveLength(0);
    }
    const red = slots()[0];
    expect(
      red &&
        within(red)
          .getAllByTestId("deck-badge")
          .map((b) => b.textContent),
    ).toEqual(["✓ Understood ×3", "★ You said it"]);
    const press = slots()[1];
    expect(
      press &&
        within(press)
          .getAllByTestId("deck-badge")
          .map((b) => b.textContent),
    ).toEqual(["✓ Understood ×2"]);
    const fire = slots()[2];
    expect(
      fire &&
        within(fire)
          .getAllByTestId("deck-badge")
          .map((b) => b.textContent),
    ).toEqual(["★ You said it"]);
  });

  it("shows ▶ only when the word has a clip and plays it from API_BASE + clip_url", () => {
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    render(<WordDeck />);
    const withPlay = slots()
      .filter((li) => within(li).queryByTestId("deck-play"))
      .map((li) => li.querySelector("[data-concept]")?.getAttribute("data-concept"));
    expect(withPlay).toEqual(["RED", "YES"]);

    const [redPlay, yesPlay] = screen.getAllByTestId("deck-play");
    if (!redPlay || !yesPlay) throw new Error("missing ▶");
    fireEvent.click(redPlay);
    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeAudio.made[0]?.src).toBe("/clips/c_00aa11bb.wav");
    expect(FakeAudio.made[0]?.paused).toBe(false);
    expect(redPlay.getAttribute("aria-pressed")).toBe("true");

    // Another clip stops the first; only one plays at a time.
    fireEvent.click(yesPlay);
    expect(FakeAudio.made[0]?.paused).toBe(true);
    expect(redPlay.getAttribute("aria-pressed")).toBe("false");
    expect(yesPlay.getAttribute("aria-pressed")).toBe("true");

    // When the clip ends, the playing state clears.
    act(() => FakeAudio.made[1]?.onended?.());
    expect(yesPlay.getAttribute("aria-pressed")).toBe("false");
  });

  it("hides ▶ everywhere in a mock deck (no clips)", () => {
    act(() => enter("tower", "hi", "male", hiTowerDeck()));
    render(<WordDeck />);
    expect(screen.queryAllByTestId("deck-play")).toHaveLength(0);
  });

  it("shows Devanagari meanings and Hindi chrome for a Hindi Tower, Latin words", () => {
    act(() => enter("tower", "hi", "male", hiTowerDeck()));
    render(<WordDeck />);
    const words = screen.getAllByTestId("deck-word").map((el) => el.textContent ?? "");
    expect(words).toEqual(["red", "press", "blue"]);
    for (const w of words) expect(w).not.toMatch(DEVANAGARI);
    const meanings = screen.getAllByTestId("deck-meaning");
    expect(meanings.map((m) => m.textContent)).toEqual(["लाल", "दबाओ", "नीला"]);
    for (const m of meanings) expect(m.getAttribute("lang")).toBe("hi");
    expect(screen.getByTestId("deck-header").textContent).toBe("आपके साथी ने आपको 2 शब्द सिखाए");
    expect(screen.getByTestId("deck-divider").textContent).toBe("अभी सीख रहे हैं");
    expect(screen.getByTestId("deck-play-again").textContent).toBe("फिर से खेलो");
    // The partner is the Flyer: the Flyer portrait, in the partner's gender.
    expect(document.querySelector("[data-portrait]")?.getAttribute("data-portrait")).toBe(
      "flyer-male",
    );
  });

  it("shows Latin meanings and English chrome for an English Flyer", () => {
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    const { container } = render(<WordDeck />);
    const meanings = screen.getAllByTestId("deck-meaning");
    expect(meanings.map((m) => m.textContent)).toEqual(["red", "press", "fire", "green", "yes"]);
    for (const m of meanings) expect(m.getAttribute("lang")).toBe("en");
    expect(container.textContent).not.toMatch(DEVANAGARI);
    expect(screen.getByTestId("deck-header").textContent).toBe("Your partner taught you 3 words");
    expect(screen.getByTestId("deck-count").textContent).toBe("3");
    expect(document.querySelector("[data-portrait]")?.getAttribute("data-portrait")).toBe(
      "tower-female",
    );
  });

  it("works for the reversed pairing too: a Hindi Flyer and an English Tower (§A2 rule 9)", () => {
    const hiWords = hiTowerDeck().words;
    act(() =>
      enter(
        "flyer",
        "hi",
        "male",
        deck({ ...hiTowerDeck(), partner_gender: "female", words: hiWords }),
      ),
    );
    render(<WordDeck />);
    expect(screen.getAllByTestId("deck-meaning")[0]?.textContent).toBe("लाल");
    expect(document.querySelector("[data-portrait]")?.getAttribute("data-portrait")).toBe(
      "tower-female",
    );
    cleanup();
    act(() => enter("tower", "en", "female", enFlyerDeck({ partner_gender: "male" })));
    const { container } = render(<WordDeck />);
    expect(container.textContent).not.toMatch(DEVANAGARI);
    expect(document.querySelector("[data-portrait]")?.getAttribute("data-portrait")).toBe(
      "flyer-male",
    );
  });

  it("types the loading line while the report is pending, then deck_report replaces it", () => {
    vi.useFakeTimers();
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    render(<WordDeck />);
    const loading = screen.getByTestId("deck-report-loading");
    const typed = () => loading.querySelector("[aria-hidden='true']")?.textContent ?? "";
    expect(typed()).toBe("");
    act(() => {
      vi.advanceTimersByTime(45 * 7);
    });
    expect(typed()).toBe("Writing");
    expect(screen.queryByTestId("deck-report")).toBeNull();

    const text = "Sam and Asha landed with 38s of fuel to spare. You learned 3 words.";
    act(() => useStore.getState().receive({ type: "deck_report", report: text }));
    expect(screen.queryByTestId("deck-report-loading")).toBeNull();
    expect(screen.getByTestId("deck-report").textContent).toBe(text);
  });

  it("renders a report that arrived with the deck right away", () => {
    act(() => enter("tower", "hi", "male", hiTowerDeck()));
    render(<WordDeck />);
    expect(screen.queryByTestId("deck-report-loading")).toBeNull();
    expect(screen.getByTestId("deck-report").textContent).toMatch(DEVANAGARI);
    expect(screen.getByTestId("deck-report").getAttribute("lang")).toBe("hi");
  });

  it("formats the stats row: fuel per phase, wrong actions, lifelines mine / partner, mm:ss", () => {
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    render(<WordDeck />);
    const stat = (id: string) => screen.getByTestId(`deck-stat-${id}`).textContent;
    expect(stat("fuel-1")).toBe("Fuel left, phase 192s");
    expect(stat("fuel-2")).toBe("Fuel left, phase 261s");
    expect(stat("fuel-3")).toBe("Fuel left, phase 339s");
    expect(stat("wrong")).toBe("Wrong actions3");
    expect(stat("lifelines")).toBe("Lifelines used2 / 1");
    expect(stat("time")).toBe("Total time07:07");
    expect(screen.getByTestId("deck-stats").querySelector("h2")?.textContent).toBe("Mission stats");
  });

  it("formats clocks as mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(59.6)).toBe("01:00");
    expect(formatClock(427)).toBe("07:07");
    expect(formatClock(3600)).toBe("60:00");
    expect(formatClock(-3)).toBe("00:00");
  });

  it("sends play_again, then shows the waiting line", () => {
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    render(<WordDeck />);
    expect(screen.getByTestId("deck-waiting").textContent).toBe("");
    fireEvent.click(screen.getByTestId("deck-play-again"));
    expect(sent).toEqual([{ type: "play_again" }]);
    expect(screen.getByTestId("deck-waiting").textContent).toBe("Waiting for your partner…");
    expect(screen.getByTestId("deck-play-again").getAttribute("aria-pressed")).toBe("true");
    // Pressing the same vote again doesn't resend it.
    fireEvent.click(screen.getByTestId("deck-play-again"));
    expect(sent).toHaveLength(1);
  });

  it("sends swap_roles, then shows the waiting line in the viewer's language", () => {
    act(() => enter("tower", "hi", "male", hiTowerDeck()));
    render(<WordDeck />);
    fireEvent.click(screen.getByTestId("deck-swap-roles"));
    expect(sent).toEqual([{ type: "swap_roles" }]);
    expect(screen.getByTestId("deck-waiting").textContent).toBe("साथी का इंतज़ार…");
    expect(screen.getByTestId("deck-swap-roles").getAttribute("aria-pressed")).toBe("true");
  });

  it("gives every card the identical class list, whatever the meaning or learned state", () => {
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    render(<WordDeck />);
    const cards = screen.getAllByTestId("deck-card");
    expect(cards).toHaveLength(5);
    expect(new Set(cards.map((c) => c.className)).size).toBe(1);
    const badges = screen.getAllByTestId("deck-badge");
    expect(new Set(badges.map((b) => b.className)).size).toBe(1);
    const words = screen.getAllByTestId("deck-word");
    expect(new Set(words.map((w) => w.className)).size).toBe(1);
    // No inline colors on cards either.
    for (const c of cards) expect(c.getAttribute("style")).toBeNull();
  });

  it("shows a near-empty deck with 0 learned words: no learned grid, only still-learning", () => {
    act(() =>
      enter(
        "flyer",
        "en",
        "female",
        enFlyerDeck({
          learned_count: 0,
          words: [word({ concept: "GREEN", word: "hara", meaning: "green" })],
        }),
      ),
    );
    render(<WordDeck />);
    expect(screen.getByTestId("deck-header").textContent).toBe("Your partner taught you 0 words");
    expect(screen.getByTestId("deck-divider")).toBeTruthy();
    expect(slots()).toHaveLength(1);
    expect(screen.queryAllByTestId("deck-badge")).toHaveLength(0);
  });
});

describe("word deck clips, motion and votes", () => {
  afterEach(() => {
    act(() => useStore.getState().setSettings({ volume: 0.5, muted: false }));
  });

  it("follows volume and mute changes on a playing clip", () => {
    act(() => {
      enter("flyer", "en", "female", enFlyerDeck());
      useStore.getState().setSettings({ volume: 0.8, muted: false });
    });
    render(<WordDeck />);
    const [redPlay] = screen.getAllByTestId("deck-play");
    if (!redPlay) throw new Error("missing ▶");
    fireEvent.click(redPlay);
    const audio = FakeAudio.made[0];
    expect(audio?.volume).toBe(0.8);
    act(() => useStore.getState().setSettings({ volume: 0.3 }));
    expect(audio?.volume).toBe(0.3);
    act(() => useStore.getState().setSettings({ muted: true }));
    expect(audio?.volume).toBe(0);
    act(() => useStore.getState().setSettings({ muted: false }));
    expect(audio?.volume).toBe(0.3);
  });

  it("stops the clip on unmount and never sets state afterwards", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    const { unmount } = render(<WordDeck />);
    const [redPlay] = screen.getAllByTestId("deck-play");
    if (!redPlay) throw new Error("missing ▶");
    fireEvent.click(redPlay);
    const audio = FakeAudio.made[0];
    expect(audio?.paused).toBe(false);
    unmount();
    expect(audio?.paused).toBe(true);
    // The handlers are detached, so a late `ended` can't reach the unmounted component.
    expect(audio?.onended).toBeNull();
    expect(audio?.onerror).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("deals the cards with a 250 ms back.out tween at a 40 ms stagger", () => {
    const from = vi.spyOn(gsap, "from");
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    render(<WordDeck />);
    expect(from).toHaveBeenCalled();
    const vars = from.mock.calls[0]?.[1];
    expect(vars).toMatchObject({ duration: 0.25, ease: "back.out(1.7)", stagger: 0.04 });
    from.mockRestore();
  });

  it("skips the deal under reduced motion: no tween, cards at their final opacity", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    const from = vi.spyOn(gsap, "from");
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    render(<WordDeck />);
    expect(from).not.toHaveBeenCalled();
    for (const el of document.querySelectorAll<HTMLElement>("[data-deal]")) {
      expect(el.style.opacity).toBe("");
      expect(el.style.visibility).toBe("");
      expect(el.style.transform).toBe("");
    }
    from.mockRestore();
  });

  it("switching from play_again to swap_roles sends both votes", () => {
    act(() => enter("flyer", "en", "female", enFlyerDeck()));
    render(<WordDeck />);
    fireEvent.click(screen.getByTestId("deck-play-again"));
    fireEvent.click(screen.getByTestId("deck-swap-roles"));
    expect(sent).toEqual([{ type: "play_again" }, { type: "swap_roles" }]);
    expect(screen.getByTestId("deck-play-again").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("deck-swap-roles").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("deck-waiting").textContent).toBe("Waiting for your partner…");
  });

  it("restores a pressed Play again and the waiting line from play_again_votes (rejoin)", () => {
    act(() => enter("tower", "hi", "male", hiTowerDeck(), ["tower"]));
    render(<WordDeck />);
    expect(screen.getByTestId("deck-play-again").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("deck-swap-roles").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("deck-waiting").textContent).toBe("साथी का इंतज़ार…");
    // Already counted by the server: pressing it again doesn't resend.
    fireEvent.click(screen.getByTestId("deck-play-again"));
    expect(sent).toEqual([]);
  });

  it("doesn't treat the partner's play_again vote as mine", () => {
    act(() => enter("tower", "hi", "male", hiTowerDeck(), ["flyer"]));
    render(<WordDeck />);
    expect(screen.getByTestId("deck-play-again").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("deck-waiting").textContent).toBe("");
  });
});

describe("deck helpers", () => {
  it("splits the header around {n}", () => {
    expect(splitAtSlot("Your partner taught you {n} words")).toEqual([
      "Your partner taught you ",
      " words",
    ]);
    expect(splitAtSlot("no slot")).toEqual(["no slot", ""]);
  });

  it("never splits a Devanagari syllable while typing", () => {
    expect(graphemes("लिखी")).toEqual(["लि", "खी"]);
  });
});
