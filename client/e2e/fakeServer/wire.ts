// What went over the wire, in both modes: in fake mode from the FakeGame's own logs, in real mode
// from Playwright's websocket events (routed sockets don't emit them, real ones do). Specs assert
// on what the client SENDS (parsed against §A7) and on role privacy of what it RECEIVES (§A9).
import type { Page } from "@playwright/test";
import type { C2S, Role } from "../../src/net/protocol";
import type { FakeRooms } from "./index";
import { parseC2S } from "./parseC2S";

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

function parse(raw: string | Buffer): unknown {
  if (typeof raw !== "string") return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v;
  } catch {
    return null;
  }
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

  /** Real mode: record every game socket of this page (its iframes included). */
  watch(page: Page): void {
    if (this.fake) return;
    page.on("websocket", (ws) => {
      const path = new URL(ws.url()).pathname;
      const m = /^\/ws\/([A-Za-z]+)$/.exec(path);
      if (!m?.[1]) return; // Vite's HMR socket
      const code = m[1].toUpperCase();
      const conn = ++this.sockets;
      let role: Role | null = null;
      ws.on("framesent", (f) => {
        const data = parse(f.payload);
        if (data === null) return; // binary audio
        if (typeof f.payload === "string") {
          const checked = parseC2S(f.payload);
          if (typeof checked === "string") this.badFrames.push(`${checked}: ${f.payload}`);
          else if (checked.type === "join") role = checked.role;
        }
        this.tapped.push({ dir: "c2s", code, conn, role, type: typeOf(data), data });
      });
      ws.on("framereceived", (f) => {
        const data = parse(f.payload);
        const type = typeOf(data);
        if (type === "joined" && typeof data === "object" && data !== null)
          role = asRole(Reflect.get(data, "role")) ?? role;
        this.tapped.push({ dir: "s2c", code, conn, role, type, data });
      });
    });
  }

  frames(code: string): WireFrame[] {
    if (!this.fake) return this.tapped.filter((f) => f.code === code);
    if (!this.fake.has(code)) return [];
    const g = this.fake.room(code);
    const c2s = g.received.map((r) => ({ at: r.at, f: frame("c2s", code, r.conn, r.role, r.msg) }));
    const s2c = g.sent.map((r) => ({ at: r.at, f: frame("s2c", code, r.conn, r.role, r.msg) }));
    return [...c2s, ...s2c].sort((a, b) => a.at - b.at).map((x) => x.f);
  }

  /** Client messages of one type, typed and validated against §A7. */
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

  /** §A2 rule 2 / §A9: what neither screen may ever receive. Empty = private. */
  privacyViolations(code: string): string[] {
    const out: string[] = [];
    for (const f of this.frames(code)) {
      if (f.dir !== "s2c") continue;
      if (f.role === "tower" && (f.type === "flyer_view" || f.type === "object_state"))
        out.push(`tower received ${f.type}`);
      if (f.role === "flyer" && f.type === "manual_card") out.push("flyer received manual_card");
      if (f.role === "tower" && f.type === "cinematic") {
        const params: unknown =
          typeof f.data === "object" && f.data ? Reflect.get(f.data, "params") : null;
        for (const k of ["fire_side", "stopped_side", "damaged_side"])
          if (typeof params === "object" && params !== null && k in params)
            out.push(`tower cinematic carries ${k}`);
      }
      if (f.role === "tower" && f.type === "fx") {
        const effects: unknown =
          typeof f.data === "object" && f.data ? Reflect.get(f.data, "effects") : null;
        if (Array.isArray(effects))
          for (const e of effects)
            if (typeof e === "string" && !e.startsWith("tower:") && !e.startsWith("both:"))
              out.push(`tower received fx ${e}`);
      }
    }
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
