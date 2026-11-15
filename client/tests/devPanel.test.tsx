import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../src/state/store";
import { DevPanel } from "../src/ui/DevPanel";
import { DEV_HOTKEYS, devHotkey, isPanelToggle, type KeyLike } from "../src/ui/hotkeys";
import { devState } from "./fixtures/devState";
import { cinematic, welcome } from "./fixtures/messages";

const sent = vi.hoisted(() => [] as unknown[]);
vi.mock("../src/net/socket", () => ({ send: (msg: unknown) => sent.push(msg) }));

const key = (code: string, over: Partial<KeyLike> = {}): KeyLike => ({
  code,
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  target: document.body,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  useStore.getState().reset();
  sent.length = 0;
});
afterEach(cleanup);

describe("hotkeys (§F18.4)", () => {
  it("maps N F 1 2 3 K to dev commands only while the panel is open", () => {
    expect(devHotkey(key("KeyN"), false)).toBeNull();
    expect(devHotkey(key("KeyN"), true)).toEqual({ cmd: "complete_action" });
    expect(devHotkey(key("KeyF"), true)).toEqual({ cmd: "fail_action" });
    expect(devHotkey(key("Digit2"), true)).toEqual({ cmd: "goto_phase", args: { phase: 2 } });
    expect(devHotkey(key("KeyK"), true)).toEqual({ cmd: "skip_cinematic" });
    expect(devHotkey(key("KeyX"), true)).toBeNull();
    expect(Object.keys(DEV_HOTKEYS).sort()).toEqual(
      ["Digit1", "Digit2", "Digit3", "KeyF", "KeyK", "KeyN"].sort(),
    );
  });

  it("ignores keys typed into inputs, textareas, selects and contenteditable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    // jsdom doesn't implement isContentEditable; emulate the browser.
    Object.defineProperty(editable, "isContentEditable", { value: true });
    for (const target of [input, textarea, select, editable]) {
      expect(devHotkey(key("KeyN", { target }), true)).toBeNull();
      expect(isPanelToggle(key("Backquote", { target }))).toBe(false);
    }
  });

  it("leaves K to the Overlays skip while a skippable cinematic plays (no double skip)", () => {
    expect(devHotkey(key("KeyK"), true, true)).toBeNull();
    expect(devHotkey(key("KeyK"), true, false)).toEqual({ cmd: "skip_cinematic" });
    expect(devHotkey(key("KeyN"), true, true)).toEqual({ cmd: "complete_action" });
  });

  it("sends K once from the dev panel during a skippable cinematic: Overlays owns it", () => {
    act(() => {
      useStore.getState().receive(cinematic({ id: "p1_intro" }));
      useStore.getState().setCinePlaying(true);
      useStore.getState().setSettings({ showDevPanel: true });
    });
    render(<DevPanel />);
    fireEvent.keyDown(window, { code: "KeyK", key: "k" });
    expect(sent).toEqual([]);
    act(() => useStore.getState().setCinePlaying(false));
    fireEvent.keyDown(window, { code: "KeyK", key: "k" });
    expect(sent).toEqual([{ type: "dev", cmd: "skip_cinematic" }]);
  });

  it("ignores auto-repeat and modifier shortcuts (Cmd+F, Ctrl+1)", () => {
    expect(devHotkey(key("KeyN", { repeat: true }), true)).toBeNull();
    expect(devHotkey(key("KeyF", { metaKey: true }), true)).toBeNull();
    expect(devHotkey(key("Digit1", { ctrlKey: true }), true)).toBeNull();
  });

  it("backtick toggles the panel; hotkeys then send dev commands", () => {
    render(<DevPanel />);
    expect(screen.queryByTestId("dev-panel")).toBeNull();
    fireEvent.keyDown(window, { code: "KeyN", key: "n" });
    expect(sent).toEqual([]);
    fireEvent.keyDown(window, { code: "Backquote", key: "`" });
    expect(screen.getByTestId("dev-panel")).toBeTruthy();
    fireEvent.keyDown(window, { code: "Digit3", key: "3" });
    expect(sent).toEqual([{ type: "dev", cmd: "goto_phase", args: { phase: 3 } }]);
    // Typing in the panel's own inputs never fires a hotkey.
    fireEvent.keyDown(screen.getByLabelText("seed"), { code: "KeyN", key: "n" });
    expect(sent).toHaveLength(1);
    fireEvent.keyDown(window, { code: "Backquote", key: "`" });
    expect(screen.queryByTestId("dev-panel")).toBeNull();
  });
});

describe("DevPanel (§F18.4)", () => {
  function open() {
    act(() => {
      useStore.getState().receive(welcome());
      useStore.getState().receive(devState());
      useStore.getState().setSettings({ showDevPanel: true });
    });
    render(<DevPanel />);
  }

  it("renders the live state from a dev_state fixture", () => {
    open();
    const live = screen.getByTestId("dev-live").textContent ?? "";
    for (const text of [
      "TEST",
      "PLAYING",
      "P1_A1",
      "42",
      "132.4 s",
      "MASTER_COLOR=BLUE",
      "FIRE_SIDE=left",
      "OH_BTN_3 ×1",
    ]) {
      expect(live).toContain(text);
    }
    const steps = screen.getByTestId("dev-live").querySelectorAll("[data-done]");
    expect(Array.from(steps, (s) => s.getAttribute("data-done"))).toEqual(["false", "true"]);
  });

  it("renders the exposure table: 20 concepts × H/G/U/S per player", () => {
    open();
    const rows = screen.getAllByTestId("exposure-row");
    expect(rows).toHaveLength(20);
    const blue = rows.find((r) => r.textContent?.startsWith("BLUE"));
    // flyer first, then tower: H G U S each.
    expect(Array.from(blue?.querySelectorAll("td") ?? [], (td) => td.textContent)).toEqual([
      "4",
      "3",
      "2",
      "1",
      "1",
      "1",
      "1",
      "4",
    ]);
    expect(screen.getByTestId("dev-exposure").textContent).toContain("Sam · flyer");
  });

  it("renders the last utterance and the latency sparkline", () => {
    open();
    const last = screen.getByTestId("dev-last-utterance").textContent ?? "";
    expect(last).toContain("teen number button do baar dabao");
    expect(last).toContain("1180 ms");
    expect(last).toContain("TWO+TIMES");
    expect(within(screen.getByTestId("dev-segments")).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByTestId("dev-latency").querySelectorAll("circle")).toHaveLength(5);
    expect(screen.getByTestId("dev-latency").textContent).toContain("1500 ms");
  });

  it("buttons send every dev command", () => {
    open();
    const click = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));
    click(/Complete action/);
    click(/Fail action/);
    click(/Phase 1/);
    click(/Skip cinematic/);
    click(/\+60 s fuel/);
    click(/Tower bot/);
    click(/Flyer bot/);
    fireEvent.change(screen.getByLabelText("seed"), { target: { value: "7" } });
    click(/Set seed/);
    fireEvent.change(screen.getByLabelText("vars"), { target: { value: "PRESS_COUNT" } });
    fireEvent.change(screen.getByLabelText("value"), { target: { value: "3" } });
    click(/^Force$/);
    expect(sent).toEqual([
      { type: "dev", cmd: "complete_action" },
      { type: "dev", cmd: "fail_action" },
      { type: "dev", cmd: "goto_phase", args: { phase: 1 } },
      { type: "dev", cmd: "skip_cinematic" },
      { type: "dev", cmd: "add_fuel", args: { seconds: 60 } },
      { type: "dev", cmd: "bots", args: { tower: false } },
      { type: "dev", cmd: "bots", args: { flyer: true } },
      { type: "dev", cmd: "set_seed", args: { seed: 7 } },
      { type: "dev", cmd: "force", args: { var: "PRESS_COUNT", value: "3" } },
    ]);
  });

  it("the send-Devanagari toggle sets the setting", () => {
    open();
    fireEvent.click(screen.getByLabelText("Send Devanagari quick-say"));
    expect(useStore.getState().settings.sendDevanagari).toBe(true);
  });

  it("without dev_state it says so instead of crashing", () => {
    act(() => useStore.getState().setSettings({ showDevPanel: true }));
    render(<DevPanel />);
    expect(screen.getByTestId("dev-panel").textContent).toContain("No dev_state yet");
  });
});
