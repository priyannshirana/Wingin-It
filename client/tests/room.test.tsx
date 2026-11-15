import { act, cleanup, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leaveRoom } from "../src/net/socket";
import { useStore } from "../src/state/store";
import { Room } from "../src/ui/Room";
import { FakeWebSocket } from "./fixtures/fakeWebSocket";

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  FakeWebSocket.instances = [];
  useStore.getState().reset();
});

afterEach(() => {
  cleanup();
  leaveRoom();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <main data-screen="home" /> },
      { path: "/r/:code", Component: Room },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("Room route", () => {
  it("a stale not_found from a previous room does not bounce a valid room", async () => {
    useStore.getState().receive({ type: "error", code: "room_not_found", message: "old room" });
    const router = renderAt("/r/KXPD");
    await act(async () => {
      await Promise.resolve();
    });
    expect(router.state.location.pathname).toBe("/r/KXPD");
    expect(useStore.getState().fatal).toBeNull();
  });

  it("a not_found for this room goes home and clears fatal", async () => {
    const router = renderAt("/r/ZZZZ");
    await act(async () => {
      FakeWebSocket.instances.at(-1)?.emit({ type: "error", code: "room_not_found", message: "x" });
      await Promise.resolve();
    });
    expect(router.state.location.pathname).toBe("/");
    expect(useStore.getState().fatal).toBeNull();
  });
});
