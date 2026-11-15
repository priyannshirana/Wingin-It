import { beforeEach, describe, expect, it, vi } from "vitest";
import { clockOffset, onPong, resetClock, serverNow } from "../src/net/clock";

beforeEach(() => resetClock());

describe("clock (§A5, §F5.2)", () => {
  it("keeps the offset from the lowest-RTT pong", () => {
    // rtt 100 → offset = 5000 + 50 - 1100 = 3950
    onPong({ type: "pong", client_ms: 1000, server_ms: 5000 }, 1100);
    expect(clockOffset()).toBe(3950);
    // rtt 20 → better: offset = 5100 + 10 - 1220 = 3890
    onPong({ type: "pong", client_ms: 1200, server_ms: 5100 }, 1220);
    expect(clockOffset()).toBe(3890);
    // rtt 300 → worse, ignored
    onPong({ type: "pong", client_ms: 1300, server_ms: 9999 }, 1600);
    expect(clockOffset()).toBe(3890);
  });

  it("serverNow = Date.now() + offset", () => {
    vi.spyOn(Date, "now").mockReturnValue(2000);
    onPong({ type: "pong", client_ms: 1990, server_ms: 10_000 }, 2000);
    expect(serverNow()).toBe(2000 + (10_000 + 5 - 2000));
    vi.restoreAllMocks();
  });
});
