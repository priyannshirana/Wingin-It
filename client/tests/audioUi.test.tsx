// PTTIndicator states (§F11), the lobby MicCheck (§F8.3), Settings (§F16.4) and SoundChip (§F20).
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "../src/i18n/strings";
import type { C2S, Gender, Lang, Role } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { flyerPlayer, player, roomState, welcome } from "./fixtures/messages";

const sent = vi.hoisted(() => [] as C2S[]);
const mic = vi.hoisted((): { level: number; init: number; result: "granted" | "denied" } => ({
  level: 0,
  init: 0,
  result: "granted",
}));

vi.mock("../src/net/socket", () => ({
  send: (msg: C2S) => sent.push(msg),
  currentSocket: () => ({ sendAudio: () => {} }),
}));

vi.mock("../src/audio/mic", async () => {
  const { useStore: store } = await import("../src/state/store");
  return {
    initMic: () => {
      mic.init++;
      store.getState().setMic({ permission: mic.result });
      return Promise.resolve();
    },
    micReady: () => true,
    preroll: () => [],
    onChunk: () => () => {},
    level: () => mic.level,
  };
});

const { PTTIndicator } = await import("../src/ui/PTTIndicator");
const { MicCheck } = await import("../src/ui/MicCheck");
const { Settings } = await import("../src/ui/Settings");
const { SoundChip } = await import("../src/ui/SoundChip");
const { Lobby } = await import("../src/ui/Lobby");
const { resetPttForTests } = await import("../src/audio/ptt");

function join(role: Role, lang: Lang, gender: Gender, partnerGender: Gender) {
  const s = useStore.getState();
  s.receive(welcome({ mock_speech: false }));
  s.receive({
    type: "joined",
    player_id: role === "flyer" ? "p-flyer" : "p-tower",
    token: "t",
    role,
    lang,
    gender,
    name: "Me",
  });
  const flyerGender = role === "flyer" ? gender : partnerGender;
  const towerGender = role === "tower" ? gender : partnerGender;
  const other: Lang = lang === "en" ? "hi" : "en";
  s.receive(
    roomState({
      mock_speech: false,
      status: "PLAYING",
      players: [
        player({ gender: towerGender, lang: role === "tower" ? lang : other }),
        flyerPlayer({ gender: flyerGender, lang: role === "flyer" ? lang : other }),
      ],
    }),
  );
  s.setConn("open");
}

beforeEach(() => {
  useStore.getState().reset();
  sent.length = 0;
  mic.level = 0;
  mic.init = 0;
  mic.result = "granted";
  resetPttForTests();
});

afterEach(() => {
  cleanup();
  resetPttForTests();
});

describe("PTTIndicator", () => {
  it("idle: hint + hold button; holding the button sends ptt_start / ptt_end", () => {
    join("flyer", "en", "female", "male");
    render(<PTTIndicator />);
    expect(screen.getByTestId("ptt").dataset.state).toBe("idle");
    expect(screen.getByText("Hold SPACE to talk")).toBeTruthy();
    const btn = screen.getByTestId("ptt-button");
    fireEvent.pointerDown(btn, { button: 0 });
    expect(screen.getByTestId("ptt").dataset.state).toBe("transmitting");
    fireEvent.pointerUp(btn);
    act(() => useStore.getState().receive({ type: "channel", busy_by: "flyer" }));
    expect(sent.map((m) => m.type)).toEqual(["ptt_start", "ptt_end"]);
  });

  it("transmitting: my own gendered string + the level meter", () => {
    join("flyer", "hi", "female", "male");
    render(<PTTIndicator />);
    fireEvent.pointerDown(screen.getByTestId("ptt-button"), { button: 0 });
    expect(screen.getByText(translate("hi", "ptt.transmitting", undefined, "female"))).toBeTruthy();
    expect(screen.getByTestId("level-meter")).toBeTruthy();
  });

  it.each<[Role, Lang, Gender, string]>([
    ["flyer", "hi", "female", "टावर बोल रही है"],
    ["flyer", "hi", "male", "टावर बोल रहा है"],
    ["tower", "hi", "female", "फ़्लायर बोल रही है"],
    ["tower", "en", "female", "Flyer is talking"],
    ["flyer", "en", "male", "Tower is talking"],
  ])("busy (%s viewer, %s): the partner's portrait + gendered string", (role, lang, pg, text) => {
    join(role, lang, "male", pg);
    render(<PTTIndicator />);
    act(() =>
      useStore
        .getState()
        .receive({ type: "channel", busy_by: role === "flyer" ? "tower" : "flyer" }),
    );
    const root = screen.getByTestId("ptt");
    expect(root.dataset.state).toBe("busy");
    expect(screen.getByText(text)).toBeTruthy();
    const partnerRole = role === "flyer" ? "tower" : "flyer";
    expect(root.querySelector(`[data-portrait="${partnerRole}-${pg}"]`)).toBeTruthy();
    expect(screen.queryByTestId("ptt-button")).toBeNull(); // nothing to click while busy
    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(sent).toEqual([]);
  });
});

describe("MicCheck", () => {
  it("asks first, then shows the 12-bar meter, then 'Mic works!' after 300 ms above 0.15", async () => {
    join("tower", "en", "male", "female");
    render(<MicCheck />);
    expect(screen.getByTestId("mic-check").dataset.state).toBe("ask");
    fireEvent.click(screen.getByTestId("mic-allow"));
    expect(mic.init).toBe(1);
    await waitFor(() => expect(screen.getByTestId("mic-check").dataset.state).toBe("listening"));
    expect(screen.getByText("Say something to test your mic")).toBeTruthy();
    expect(screen.getByTestId("level-meter").children).toHaveLength(12);
    mic.level = 0.5;
    await waitFor(() => expect(screen.getByTestId("mic-check").dataset.state).toBe("ok"), {
      timeout: 2000,
    });
    expect(screen.getByText(/Mic works!/)).toBeTruthy();
  });

  it("an already-granted mic starts on the page's first gesture, without a prompt", async () => {
    join("tower", "en", "male", "female");
    const query = vi.fn(() => Promise.resolve({ state: "granted" }));
    Object.defineProperty(navigator, "permissions", { value: { query }, configurable: true });
    try {
      render(<MicCheck />);
      await waitFor(() => expect(query).toHaveBeenCalled());
      await Promise.resolve();
      expect(mic.init).toBe(0); // no gesture yet: the AudioContext could not start
      fireEvent.pointerDown(document.body);
      expect(mic.init).toBe(1);
      await waitFor(() => expect(screen.getByTestId("mic-check").dataset.state).toBe("listening"));
    } finally {
      Reflect.deleteProperty(navigator, "permissions");
    }
  });

  it("a quiet mic never passes", async () => {
    join("tower", "en", "male", "female");
    useStore.getState().setMic({ permission: "granted" });
    mic.level = 0.1;
    render(<MicCheck />);
    await new Promise((r) => setTimeout(r, 450));
    expect(screen.getByTestId("mic-check").dataset.state).toBe("listening");
  });

  it("denied shows the fix-it text in the viewer's language", async () => {
    join("flyer", "hi", "female", "male");
    mic.result = "denied";
    render(<MicCheck />);
    fireEvent.click(screen.getByTestId("mic-allow"));
    await waitFor(() => expect(screen.getByTestId("mic-check").dataset.state).toBe("denied"));
    expect(screen.getByText(translate("hi", "lobby.mic_denied"))).toBeTruthy();
    expect(useStore.getState().mic.permission).toBe("denied");
  });
});

describe("Settings", () => {
  it("the slider and mute write store.settings", () => {
    render(<Settings />);
    fireEvent.change(screen.getByTestId("volume"), { target: { value: "0.25" } });
    expect(useStore.getState().settings.volume).toBe(0.25);
    fireEvent.click(screen.getByTestId("mute"));
    expect(useStore.getState().settings.muted).toBe(true);
    expect(screen.getByTestId("mute").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("volume").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByTestId("mute"));
    expect(useStore.getState().settings.muted).toBe(false);
  });

  it("labels come from strings in the viewer's language", () => {
    join("tower", "hi", "male", "female");
    render(<Settings />);
    expect(screen.getByLabelText(translate("hi", "settings.volume"))).toBeTruthy();
    expect(screen.getByLabelText(translate("hi", "settings.mute"))).toBeTruthy();
  });
});

describe("Lobby Ready vs the mic (§F8.3)", () => {
  function lobby(mock: boolean) {
    join("tower", "en", "male", "female");
    useStore.getState().receive(welcome({ mock_speech: mock }));
    useStore.getState().receive(
      roomState({
        mock_speech: mock,
        status: "LOBBY",
        players: [player({ id: "p-tower", lang: "en" }), flyerPlayer({ lang: "hi" })],
      }),
    );
  }
  const ready = () => screen.getByTestId("ready");

  it("a denied mic disables Ready in a real room", () => {
    lobby(false);
    act(() => useStore.getState().setMic({ permission: "denied" }));
    render(<Lobby />);
    expect(ready().hasAttribute("disabled")).toBe(true);
    fireEvent.click(ready());
    expect(sent.filter((m) => m.type === "ready")).toEqual([]);
  });

  it("Ready works with a granted (or not yet asked) mic", () => {
    lobby(false);
    render(<Lobby />);
    expect(ready().hasAttribute("disabled")).toBe(false);
    act(() => useStore.getState().setMic({ permission: "granted" }));
    expect(ready().hasAttribute("disabled")).toBe(false);
  });

  it("mock rooms never need the mic", () => {
    lobby(true);
    act(() => useStore.getState().setMic({ permission: "denied" }));
    render(<Lobby />);
    expect(ready().hasAttribute("disabled")).toBe(false);
  });

  it("an already-ready player can still un-ready with a denied mic", () => {
    lobby(false);
    useStore.getState().receive(
      roomState({
        mock_speech: false,
        status: "LOBBY",
        players: [player({ id: "p-tower", lang: "en", ready: true }), flyerPlayer({ lang: "hi" })],
      }),
    );
    act(() => useStore.getState().setMic({ permission: "denied" }));
    render(<Lobby />);
    expect(ready().hasAttribute("disabled")).toBe(false);
  });
});

describe("SoundChip", () => {
  it("renders nothing where Web Audio is missing (jsdom)", () => {
    const { container } = render(<SoundChip />);
    expect(container.innerHTML).toBe("");
  });
});
