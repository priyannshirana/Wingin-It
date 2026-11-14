import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App";

afterEach(cleanup);

describe("app shell (M0)", () => {
  it("serves the home page at /", async () => {
    window.history.pushState({}, "", "/");
    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("WINGIN' IT!");
    expect(document.querySelector('[data-screen="home"]')).not.toBeNull();
  });
});
