// The `test` the flow specs use: in fake mode it installs the fake server on the browser context;
// in real mode (E2E_SERVER=real) it routes nothing and taps the real sockets instead.
import { test as base, expect } from "@playwright/test";
import { installFakeServer, type FakeRooms } from "../fakeServer/index";
import { REAL } from "../fakeServer/mode";
import { Wire } from "../fakeServer/wire";

export interface ServerHandle {
  mode: "fake" | "real";
  /** The fake rooms (null in real mode). */
  fake: FakeRooms | null;
  wire: Wire;
}

export const test = base.extend<{ server: ServerHandle }>({
  server: [
    async ({ context, page }, use) => {
      const fake = REAL ? null : await installFakeServer(context);
      const wire = new Wire(fake);
      wire.watch(page);
      context.on("page", (p) => wire.watch(p));
      await use({ mode: REAL ? "real" : "fake", fake, wire });
      fake?.dispose();
    },
    { auto: true },
  ],
});

export { expect, REAL };

/** A room code no other run uses (real servers keep rooms alive between specs). */
export function roomCode(prefix: string): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = prefix
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  while (code.length < 4) code += letters[Math.floor(Math.random() * letters.length)] ?? "A";
  return code;
}

/** After each flow: the client sent only §A7-shaped frames and nobody saw the partner's secrets. */
export function expectCleanWire(server: ServerHandle, code: string): void {
  expect(server.wire.badFrames, "client frames that break §A7").toEqual([]);
  if (server.fake && server.fake.has(code)) {
    const g = server.fake.room(code);
    expect(g.badFrames, "client frames that break §A7").toEqual([]);
    expect(g.violations, "fake server privacy guard").toEqual([]);
  }
  expect(server.wire.privacyViolations(code), "role privacy (§A9)").toEqual([]);
}
