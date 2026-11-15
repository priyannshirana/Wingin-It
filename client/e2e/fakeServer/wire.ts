// What went over the wire, in both modes: in fake mode from the FakeGame's own logs, in real mode
// from Playwright's websocket events (routed sockets don't emit them, real ones do). Specs assert
// on what the client SENDS (parsed against §A7) and on role privacy of what it RECEIVES (§A9).
import type { Page } from "@playwright/test";
import type { C2S, Role } from "../../src/net/protocol";
import type { FakeRooms } from "./index";
import { parseC2S } from "./parseC2S";
import { frameViolations } from "./privacy";

export interface WireFrame {
  dir: "c2s" | "s2c";
  code: string;
  /** Which socket (one per tab and connection attempt). */
  conn: number;
  /** The tab's role at the time of the frame (from its `join` / `joined`), null before. */
  role: Role | null;
  type: string;
  data: unknown;
}

const asRole = (v: unknown): Role | null => (v === "flyer" || v === "tower" ? v : null);
const typeOf = (v: unknown): string =>
  typeof v === "object" && v !== null && typeof Reflect.get(v, "type") === "string"
    ? String(Reflect.get(v, "type"))
    : "?";

const field = (v: unknown, key: string): unknown =>
  typeof v === "object" && v !== null ? Reflect.get(v, key) : undefined;

function parse(raw: string | Buffer): unknown {
  if (typeof raw !== "string") return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v;
  } catch {
    return null;
  }
}

/** What the wire tap needs from a WebSocket (Playwright's `WebSocket` fits via `watch`). */
export interface TapSocket {
  url: string;
  onSent(cb: (f: { payload: string | Buffer }) => void): void;
  onReceived(cb: (f: { payload: string | Buffer }) => void): void;
}

export class Wire {
  private readonly tapped: WireFrame[] = [];
  /** Real-mode client frames that break §A7. */
  readonly badFrames: string[] = [];
  private readonly fake: FakeRooms | null;
  private sockets = 0;

  constructor(fake: FakeRooms | null) {
    this.fake = fake;
  }

  /**
   * Real mode: record every game socket of this page (its iframes included). Frames seen before
   * the socket's role is known (welcome, the spectator room_state, pongs) are patched with the
   * role as soon as `join` / `joined` tells it, so nothing stays unchecked.
   */
  watch(page: Page): void {
    if (this.fake) return;
    page.on("websocket", (ws) =>
      this.tapSocket({
        url: ws.url(),
        onSent: (cb) => void ws.on("framesent", cb),
        onReceived: (cb) => void ws.on("framereceived", cb),
      }),
    );
  }

  /** Tap one socket (the page hook above; the checker tests drive it with a scripted one). */
  tapSocket(ws: TapSocket): void {
    const path = new URL(ws.url).pathname;
    const m = /^\/ws\/([A-Za-z]+)$/.exec(path);
    if (!m?.[1]) return; // Vite's HMR socket
    const code = m[1].toUpperCase();
    const conn = ++this.sockets;
    let role: Role | null = null;
    const roleless: WireFrame[] = [];
    const learn = (r: Role | null): void => {
      if (!r) return;
      role = r;
      for (const f of roleless.splice(0)) f.role = r;
    };
    const push = (f: WireFrame): void => {
      if (f.role === null) roleless.push(f);
      this.tap(f);
    };
    ws.onSent((f) => {
      const data = parse(f.payload);
      if (data === null) {
        // Binary audio frames are fine; a text frame that isn't JSON is not (§A5).
        if (typeof f.payload === "string") this.badFrames.push(`not JSON: ${f.payload}`);
        return;
      }
      if (typeof f.payload === "string") {
        const checked = parseC2S(f.payload);
        if (typeof checked === "string") this.badFrames.push(`${checked}: ${f.payload}`);
        else if (checked.type === "join") learn(checked.role);
      }
      push({ dir: "c2s", code, conn, role, type: typeOf(data), data });
    });
    ws.onReceived((f) => {
      const data = parse(f.payload);
      const type = typeOf(data);
      if (type === "joined" && typeof data === "object" && data !== null) {
        const r = asRole(Reflect.get(data, "role"));
        if (r) role = r; // a swap re-keys the socket; later frames belong to the new role
        learn(r);
      }
      push({ dir: "s2c", code, conn, role, type, data });
    });
  }

  /** Record one frame (the sockets' taps call this; so do the checker tests). */
  tap(f: WireFrame): void {
    this.tapped.push(f);
  }

  frames(code: string): WireFrame[] {
    if (!this.fake) return this.tapped.filter((f) => f.code === code);
    if (!this.fake.has(code)) return [];
    const g = this.fake.room(code);
    const c2s = g.received.map((r) => ({ at: r.at, f: frame("c2s", code, r.conn, r.role, r.msg) }));
    const s2c = g.sent.map((r) => ({ at: r.at, f: frame("s2c", code, r.conn, r.role, r.msg) }));
    return [...c2s, ...s2c].sort((a, b) => a.at - b.at).map((x) => x.f);
  }

  /**
   * Client messages of one type, exactly as sent on the wire. A frame that fails the strict
   * §A7 validator (unknown field, bad value, over 8 KB…) is not returned and is listed in
   * `badFrames` (real mode) or the room's `badFrames` (fake), which `expectCleanWire` asserts.
   */
  sent<T extends C2S["type"]>(code: string, type: T, role?: Role): Extract<C2S, { type: T }>[] {
    const out: Extract<C2S, { type: T }>[] = [];
    for (const f of this.frames(code)) {
      if (f.dir !== "c2s" || f.type !== type || (role && f.role !== role)) continue;
      const m = parseC2S(JSON.stringify(f.data));
      if (typeof m !== "string" && isType(m, type)) out.push(m);
    }
    return out;
  }

  /** Server messages of one type that reached a role (shape not checked: the server owns it). */
  received(code: string, type: string, role: Role): unknown[] {
    return this.frames(code)
      .filter((f) => f.dir === "s2c" && f.type === type && f.role === role)
      .map((f) => f.data);
  }

  /**
   * §A2 rule 2 / §A9: what neither screen may ever receive. Empty = private. Checks every
   * server frame on both roles' sockets (and sockets that never joined).
   */
  privacyViolations(code: string): string[] {
    const frames = this.frames(code);
    const devOn = new Set<number>();
    for (const f of frames)
      if (f.dir === "s2c" && f.type === "welcome" && field(f.data, "dev_mode") === true)
        devOn.add(f.conn);
    const out: string[] = [];
    for (const f of frames)
      if (f.dir === "s2c") out.push(...frameViolations(f.role, f.type, f.data, devOn.has(f.conn)));
    return out;
  }
}

function frame(
  dir: WireFrame["dir"],
  code: string,
  conn: number,
  role: Role | null,
  msg: { type: string },
): WireFrame {
  return { dir, code, conn, role, type: msg.type, data: msg };
}

function isType<M extends { type: string }, T extends M["type"]>(
  m: M,
  type: T,
): m is Extract<M, { type: T }> {
  return m.type === type;
}
