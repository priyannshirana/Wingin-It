// Dev panel keys (§F18.4): backtick toggles the panel; while it is open, N F 1 2 3 K send dev
// commands. Keys typed into inputs, textareas, selects or contenteditable are never hotkeys.
// Matching uses `KeyboardEvent.code` (the physical key), so a Hindi keyboard layout works too.
import type { DevCmd } from "../net/protocol";
import { isTypingTarget } from "./isTypingTarget";

export interface DevCommand {
  cmd: DevCmd;
  args?: Record<string, unknown>;
}

/** The physical key that opens and closes the dev panel. */
export const PANEL_TOGGLE_CODE = "Backquote";

export const DEV_HOTKEYS: Readonly<Record<string, DevCommand>> = {
  KeyN: { cmd: "complete_action" },
  KeyF: { cmd: "fail_action" },
  Digit1: { cmd: "goto_phase", args: { phase: 1 } },
  Digit2: { cmd: "goto_phase", args: { phase: 2 } },
  Digit3: { cmd: "goto_phase", args: { phase: 3 } },
  KeyK: { cmd: "skip_cinematic" },
};

/** The parts of a KeyboardEvent the hotkeys look at (a real event satisfies it). */
export interface KeyLike {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

/** Keys that never count: typing in a field, auto-repeat, and browser/OS shortcuts. */
function ignored(e: KeyLike): boolean {
  return e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target);
}

export function isPanelToggle(e: KeyLike): boolean {
  return !ignored(e) && e.code === PANEL_TOGGLE_CODE;
}

/**
 * The dev command for this key, or null. Only while the panel is open. While a skippable
 * cinematic is on screen, Overlays already turns K into the (dev force) skip, so K is left to it
 * (`overlaySkips`) and the skip is never sent twice.
 */
export function devHotkey(e: KeyLike, panelOpen: boolean, overlaySkips = false): DevCommand | null {
  if (!panelOpen || ignored(e)) return null;
  if (e.code === "KeyK" && overlaySkips) return null;
  return DEV_HOTKEYS[e.code] ?? null;
}
