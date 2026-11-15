import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Lang, Role } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { FlyerHUD } from "../src/ui/FlyerHUD";
import { TowerScreen } from "../src/ui/TowerScreen";
import { cardP1A1 } from "./fixtures/cards";
import {
  flyerPlayer,
  flyerView,
  gameState,
  kw,
  plain,
  player,
  roomState,
  utterance,
  welcome,
} from "./fixtures/messages";

const DEVANAGARI = /[ऀ-ॿ]/;

// §A2 rule 9: the reversed pairing (Flyer Hindi, Tower English) must work exactly as well.
function join(role: Role, lang: Lang) {
  const s = useStore.getState();
  s.reset();
  s.receive(welcome());
  s.receive({
    type: "joined",
    player_id: role === "tower" ? "p-tower" : "p-flyer",
    token: "t",
    role,
    lang,
    gender: "female",
    name: "Me",
  });
  s.receive(
    roomState({
      status: "PLAYING",
      players: [
        player({ lang: role === "tower" ? lang : "hi", gender: "female" }),
        flyerPlayer({ lang: role === "flyer" ? lang : "en" }),
      ],
    }),
  );
  s.receive(gameState());
}

beforeEach(() => useStore.getState().reset());
afterEach(cleanup);

describe("reversed language pairing (§A2 rule 9)", () => {
  it("renders the Tower screen fully in English for an English Tower", () => {
    act(() => {
      join("tower", "en");
      useStore.getState().receive({ type: "manual_card", card: cardP1A1("en") });
      useStore.getState().receive(
        utterance({
          speaker_role: "flyer",
          lang: "hi",
          segments: [kw("laal", "RED", "red"), plain(" wali!")],
        }),
      );
    });
    const { container } = render(<TowerScreen />);
    expect(container.textContent).toContain("FUEL");
    expect(container.textContent).toContain("Step 1 / 7");
    expect(container.textContent).toContain("MAYDAY");
    expect(container.textContent).toContain("Pilot Down");
    expect(screen.getByTestId("subtitles").textContent).toContain("laal");
    expect(container.textContent).not.toMatch(DEVANAGARI);
  });

  it("renders the Flyer HUD in Hindi for a Hindi Flyer, subtitles still Latin", () => {
    act(() => {
      join("flyer", "hi");
      useStore
        .getState()
        .receive(flyerView({ quick_replies: [{ label: "Laal!", text: "Laal!" }] }));
      useStore.getState().receive(
        utterance({
          speaker_role: "tower",
          lang: "en",
          segments: [plain("Which light is on — "), kw("red", "RED", "laal"), plain("?")],
        }),
      );
    });
    render(<FlyerHUD />);
    const hud = screen.getByTestId("flyer-hud").textContent ?? "";
    expect(hud).toContain("ईंधन");
    expect(hud).toContain("पायलट बेहोश");
    expect(hud).toContain("सेकंड");
    // The segments stay Latin; the tag pill is the Hindi player's own chrome (टावर).
    const segments = Array.from(
      screen.getByTestId("subtitles").querySelectorAll("[data-kind]"),
      (el) => el.textContent ?? "",
    ).join("");
    expect(segments).toBe("Which light is on — red?");
    expect(segments).not.toMatch(DEVANAGARI);
    expect(screen.getByTestId("subtitles").textContent).toContain("टावर");
    expect(screen.getByRole("textbox").getAttribute("placeholder")).toBe(
      "जो बोलना है लिखो, Enter दबाओ",
    );
  });
});
