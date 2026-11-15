/**
 * §F19 PresenterKeys: demo badge, N/P hotkeys, dev-panel yielding, typing guard.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../src/state/store";
import { PresenterKeys } from "../src/ui/PresenterKeys";
import { devHotkey, type KeyLike } from "../src/ui/hotkeys";
import { welcome, roomState } from "./fixtures/messages";

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
  useStore.getState().reset();
  sent.length = 0;
});
afterEach(cleanup);

describe("PresenterKeys (§F19)", () => {
  it("renders nothing and registers no hotkeys outside demo rooms", () => {
    act(() => useStore.getState().receive(welcome({ demo: false })));
    render(<PresenterKeys />);
    expect(screen.queryByTestId("demo-badge")).toBeNull();
    fireEvent.keyDown(window, { code: "KeyN", key: "n" });
    fireEvent.keyDown(window, { code: "KeyP", key: "p" });
    expect(sent).toHaveLength(0);
  });

  it("renders the DEMO badge when welcome.demo=true", () => {
    act(() => useStore.getState().receive(welcome({ demo: true })));
    render(<PresenterKeys />);
    expect(screen.getByTestId("demo-badge")).toBeTruthy();
  });

  it("renders the DEMO badge when room_state.demo=true (even without welcome.demo)", () => {
    act(() => {
      useStore.getState().receive(welcome({ demo: false }));
      useStore.getState().receive(roomState({ demo: true }));
    });
    render(<PresenterKeys />);
    expect(screen.getByTestId("demo-badge")).toBeTruthy();
  });

  it("N sends presenter next_action in a demo room", () => {
    act(() => useStore.getState().receive(welcome({ demo: true })));
    render(<PresenterKeys />);
    fireEvent.keyDown(window, { code: "KeyN", key: "n" });
    expect(sent).toEqual([{ type: "presenter", cmd: "next_action" }]);
  });

  it("P sends presenter next_phase in a demo room", () => {
    act(() => useStore.getState().receive(welcome({ demo: true })));
    render(<PresenterKeys />);
    fireEvent.keyDown(window, { code: "KeyP", key: "p" });
    expect(sent).toEqual([{ type: "presenter", cmd: "next_phase" }]);
  });

  it("ignores e.repeat", () => {
    act(() => useStore.getState().receive(welcome({ demo: true })));
    render(<PresenterKeys />);
    fireEvent.keyDown(window, { code: "KeyN", key: "n", repeat: true });
    expect(sent).toHaveLength(0);
  });

  it("ignores keys while the user is typing in an input", () => {
    act(() => useStore.getState().receive(welcome({ demo: true })));
    render(<PresenterKeys />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { code: "KeyN", key: "n" });
    fireEvent.keyDown(input, { code: "KeyP", key: "p" });
    expect(sent).toHaveLength(0);
    document.body.removeChild(input);
  });

  it("ignores keys while the user is typing in a textarea", () => {
    act(() => useStore.getState().receive(welcome({ demo: true })));
    render(<PresenterKeys />);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    fireEvent.keyDown(textarea, { code: "KeyN", key: "n" });
    expect(sent).toHaveLength(0);
    document.body.removeChild(textarea);
  });

  it("ignores keys while typing in contenteditable", () => {
    act(() => useStore.getState().receive(welcome({ demo: true })));
    render(<PresenterKeys />);
    const div = document.createElement("div");
    div.contentEditable = "true";
    Object.defineProperty(div, "isContentEditable", { value: true });
    document.body.appendChild(div);
    fireEvent.keyDown(div, { code: "KeyN", key: "n" });
    expect(sent).toHaveLength(0);
    document.body.removeChild(div);
  });

  it("ignores modifier combos (Ctrl+N, Meta+N, Alt+P)", () => {
    act(() => useStore.getState().receive(welcome({ demo: true })));
    render(<PresenterKeys />);
    fireEvent.keyDown(window, { code: "KeyN", key: "n", ctrlKey: true });
    fireEvent.keyDown(window, { code: "KeyN", key: "n", metaKey: true });
    fireEvent.keyDown(window, { code: "KeyP", key: "p", altKey: true });
    expect(sent).toHaveLength(0);
  });

  it("cleans up the listener on unmount (no sends after unmount)", () => {
    act(() => useStore.getState().receive(welcome({ demo: true })));
    const { unmount } = render(<PresenterKeys />);
    unmount();
    fireEvent.keyDown(window, { code: "KeyN", key: "n" });
    expect(sent).toHaveLength(0);
  });
});

describe("devHotkey N-key clash (§F19)", () => {
  it("devHotkey returns null for KeyN and KeyP when demo=true (presenter owns them)", () => {
    expect(devHotkey(key("KeyN"), true, false, true)).toBeNull();
    expect(devHotkey(key("KeyP"), true, false, true)).toBeNull();
  });

  it("devHotkey still fires KeyN and KeyF when demo=false", () => {
    expect(devHotkey(key("KeyN"), true, false, false)).toEqual({ cmd: "complete_action" });
    expect(devHotkey(key("KeyF"), true, false, true)).toEqual({ cmd: "fail_action" });
  });

  it("devHotkey returns null for KeyN when panel is closed, regardless of demo", () => {
    expect(devHotkey(key("KeyN"), false, false, false)).toBeNull();
    expect(devHotkey(key("KeyN"), false, false, true)).toBeNull();
  });
});
