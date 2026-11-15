// The fake Part A server for e2e (never imported from src/). It answers every `/ws/{CODE}`
// socket and the REST endpoints of the browser context through Playwright routing, one
// FakeGame per room code. See client/INTEGRATION.md for what it does and doesn't model.
import type { BrowserContext } from "@playwright/test";
import { FakeGame, type FakeOptions } from "./game";

export { FakeGame, SCRIPT, type FakeOptions } from "./game";

export class FakeRooms {
  private rooms = new Map<string, FakeGame>();
  private readonly opts: FakeOptions;
  private readonly perRoom = new Map<string, FakeOptions>();

  constructor(opts: FakeOptions) {
    this.opts = opts;
  }

  /** Options for one room code (call before the first socket for it opens). */
  configure(code: string, opts: FakeOptions): void {
    this.perRoom.set(code, opts);
  }

  /** The room for a code (created on first use, like `/ws/TEST` in Dev Mode, §A4). */
  room(code: string): FakeGame {
    let g = this.rooms.get(code);
    if (!g) {
      g = new FakeGame(code, { ...this.opts, ...this.perRoom.get(code) });
      this.rooms.set(code, g);
    }
    return g;
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  dispose(): void {
    for (const g of this.rooms.values()) g.dispose();
    this.rooms.clear();
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export async function installFakeServer(
  context: BrowserContext,
  opts: FakeOptions = {},
): Promise<FakeRooms> {
  const rooms = new FakeRooms(opts);

  await context.routeWebSocket(/\/ws\/[A-Za-z]+$/, (ws) => {
    const code = new URL(ws.url()).pathname.split("/").pop() ?? "";
    rooms.room(code.toUpperCase()).attach(ws);
  });

  // §A4 REST. Only /api/* and /health: Vite's own module URLs (/src/net/api.ts) pass through.
  await context.route(
    (url) => url.pathname.startsWith("/api/") || url.pathname === "/health",
    async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if (url.pathname === "/health") {
        return route.fulfill({
          json: {
            ok: true,
            mock_speech: true,
            dev_mode: true,
            demo_mode: false,
            rooms: 0,
            version: "0.1.0",
          },
        });
      }
      if (method === "POST" && url.pathname === "/api/rooms") {
        let code = "";
        for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * 24)] ?? "A";
        rooms.room(code);
        return route.fulfill({ json: { code } });
      }
      const m = /^\/api\/rooms\/([A-Za-z]{4})$/.exec(url.pathname);
      if (method === "GET" && m?.[1]) {
        const code = m[1].toUpperCase();
        if (!rooms.has(code)) return route.fulfill({ status: 404, json: { exists: false } });
        return route.fulfill({ json: rooms.room(code).info() });
      }
      return route.fulfill({ status: 404, json: { detail: "not in the fake server" } });
    },
  );
  return rooms;
}
