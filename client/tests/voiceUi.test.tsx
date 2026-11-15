// Voice rooms in the UI: Home passes `?voice=1` to POST /api/rooms; the partner-voice slider and
// the headphones hint show only in voice rooms.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "../src/i18n/strings";
import type { C2S } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { flyerPlayer, player, roomState, welcome } from "./fixtures/messages";

const created = vi.hoisted(() => [] as unknown[]);

vi.mock("../src/net/api", async (orig) => {
  const real = await orig<typeof import("../src/net/api")>();
  return {
    ...real,
    createRoom: (opts: unknown) => {
      created.push(opts);
      return Promise.resolve("ABCD");
    },
    getHealth: () => Promise.resolve(null),
  };
});

vi.mock("../src/net/socket", () => ({
  send: (_msg: C2S) => {},
  currentSocket: () => null,
}));

const { Home } = await import("../src/ui/Home");
const { Settings } = await import("../src/ui/Settings");
const { Lobby } = await import("../src/ui/Lobby");

function enterRoom(voice: boolean, lang: "en" | "hi" = "en") {
  const s = useStore.getState();
  s.receive(welcome({ mock_speech: false, voice }));
  s.receive({
    type: "joined",
    player_id: "p-tower",
    token: "t",
    role: "tower",
    lang,
    gender: "male",
    name: "Me",
  });
  s.receive(
    roomState({
      mock_speech: false,
      voice,
      players: [player({ lang }), flyerPlayer({ lang: lang === "en" ? "hi" : "en" })],
    }),
  );
}

beforeEach(() => {
  useStore.getState().reset();
  created.length = 0;
});
afterEach(cleanup);

describe("Home → POST /api/rooms", () => {
  async function startWith(search: string) {
    const router = createMemoryRouter(
      [
        { path: "/", element: <Home /> },
        { path: "/r/:code", element: <p data-testid="room" /> },
      ],
      { initialEntries: [`/${search}`] },
    );
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByText(translate(useStore.getState().uiLang, "home.start")));
    await waitFor(() => expect(screen.getByTestId("room")).toBeTruthy());
    return router.state.location;
  }

  it("passes voice:true together with demo, and keeps the params on the room URL", async () => {
    const loc = await startWith("?demo=1&voice=1&seed=42");
    expect(created).toEqual([{ demo: true, voice: true, seed: 42 }]);
    expect(loc.search).toBe("?demo=1&voice=1&seed=42");
  });

  it("omits voice without the param", async () => {
    await startWith("?mock=1");
    expect(created).toEqual([{ mock: true }]);
  });
});

describe("voice UI", () => {
  it("non-voice rooms: no partner slider, no headphones hint", () => {
    enterRoom(false);
    render(<Settings />);
    expect(screen.queryByTestId("partner-volume")).toBeNull();
    cleanup();
    render(<Lobby />);
    expect(screen.queryByTestId("headphones-hint")).toBeNull();
  });

  it("voice rooms: the slider writes settings.partnerVolume (default 0.9)", () => {
    enterRoom(true);
    expect(useStore.getState().settings.partnerVolume).toBe(0.9);
    render(<Settings />);
    const slider = screen.getByTestId("partner-volume");
    expect(slider.getAttribute("aria-label")).toBe(translate("en", "settings.partner_voice"));
    fireEvent.change(slider, { target: { value: "0.4" } });
    expect(useStore.getState().settings.partnerVolume).toBe(0.4);
    expect(JSON.parse(localStorage.getItem("wingin:settings") ?? "{}")).toMatchObject({
      partnerVolume: 0.4,
    });
  });

  it("voice rooms: the lobby shows the headphones hint in the viewer's language", () => {
    enterRoom(true, "hi");
    render(<Lobby />);
    expect(screen.getByTestId("headphones-hint").textContent).toBe(
      translate("hi", "lobby.headphones"),
    );
  });
});
