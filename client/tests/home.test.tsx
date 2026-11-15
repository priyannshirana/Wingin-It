import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRoom = vi.fn(() => Promise.resolve("ABCD"));
vi.mock("../src/net/api", async (orig) => ({
  ...(await orig<typeof import("../src/net/api")>()),
  createRoom: (...a: Parameters<typeof createRoom>) => createRoom(...a),
  getHealth: () => Promise.resolve(null),
}));

import { Home } from "../src/ui/Home";

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/r/:code" element={<p>room</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Home game modes", () => {
  beforeEach(() => createRoom.mockClear());
  afterEach(cleanup);

  it("shows the how-to blurb in the How to play popup, not on the landing page", () => {
    renderHome();
    expect(screen.queryByText(/Hold Space to talk/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Hold Space to talk/)).toBeTruthy();
  });

  it("builds ?demo=1&voice=1 and creates the room with demo+voice", async () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Game modes" }));
    expect(screen.getByTestId("modes-url").textContent).not.toContain("?");
    fireEvent.click(screen.getByRole("checkbox", { name: /\?voice=1/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /\?demo=1/ }));
    expect(screen.getByTestId("modes-url").textContent).toMatch(/\?demo=1&voice=1$/);
    fireEvent.click(screen.getByRole("button", { name: "Create game with these" }));
    await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1));
    expect(createRoom).toHaveBeenCalledWith({ demo: true, voice: true });
    await screen.findByText("room");
  });

  it("demo+mock combo row creates a room with demo and mock", async () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Game modes" }));
    const row = screen.getByTestId("combo-demo_mock");
    expect(row.textContent).toContain("?demo=1&mock=1");
    fireEvent.click(within(row).getByRole("button", { name: "Try it" }));
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith({ demo: true, mock: true }));
  });

  it("voice and mock are mutually exclusive", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Game modes" }));
    const voice = () => screen.getByRole<HTMLInputElement>("checkbox", { name: /\?voice=1/ });
    const mock = () => screen.getByRole<HTMLInputElement>("checkbox", { name: /\?mock=1/ });
    fireEvent.click(mock());
    expect(voice().disabled).toBe(true);
    expect(voice().checked).toBe(false);
    expect(screen.getByText("Not available with typing mode")).toBeTruthy();
    fireEvent.click(mock());
    fireEvent.click(voice());
    expect(mock().disabled).toBe(true);
    expect(mock().checked).toBe(false);
    expect(screen.getByText("Not available with live voice")).toBeTruthy();
  });

  it("closes on Escape", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Game modes" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
