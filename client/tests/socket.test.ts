import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, currentSocket, leaveRoom, loadToken, storedJoin } from "../src/net/socket";
import { useStore } from "../src/state/store";
import { FakeWebSocket } from "./fixtures/fakeWebSocket";
import { roomState, welcome } from "./fixtures/messages";

const joined = (role: "flyer" | "tower", token: string) =>
  ({
    type: "joined",
    player_id: "p1",
    token,
    role,
    lang: role === "flyer" ? "en" : "hi",
    gender: "female",
    name: "Asha",
  }) as const;

const latest = (): FakeWebSocket => {
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error("no socket opened");
  return ws;
};

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  FakeWebSocket.instances = [];
  sessionStorage.clear();
  useStore.getState().reset();
});

afterEach(() => {
  leaveRoom();
  vi.unstubAllGlobals();
});

describe("socket tokens (§A5, pitfall 2)", () => {
  it("joined with a new role (swap_roles) moves the token so a refresh finds exactly one", () => {
    connect("SWAP");
    latest().emit(joined("flyer", "t-flyer"));
    expect(loadToken("SWAP", "flyer")).toBe("t-flyer");
    latest().emit(joined("tower", "t-tower"));
    expect(loadToken("SWAP", "flyer")).toBeNull();
    expect(loadToken("SWAP", "tower")).toBe("t-tower");
    expect(storedJoin("SWAP")).toMatchObject({ role: "tower", name: "Asha" });
  });

  it("never deletes the partner's token in a shared split-view sessionStorage", () => {
    connect("SPLT");
    latest().emit(joined("flyer", "mine"));
    // The partner iframe already stored its own token under my old role.
    sessionStorage.setItem("wingin:token:SPLT:flyer", "partner");
    latest().emit(joined("tower", "mine-2"));
    expect(loadToken("SPLT", "flyer")).toBe("partner");
    expect(loadToken("SPLT", "tower")).toBe("mine-2");
  });

  it("room_state rekey is a fallback that never overwrites a stored token", () => {
    connect("FALL");
    latest().emit(joined("flyer", "mine"));
    sessionStorage.setItem("wingin:token:FALL:tower", "partner");
    latest().emit(
      roomState({
        code: "FALL",
        players: [
          {
            id: "p1",
            name: "Asha",
            role: "tower",
            lang: "en",
            gender: "female",
            ready: false,
            connected: true,
            is_bot: false,
          },
        ],
      }),
    );
    expect(loadToken("FALL", "tower")).toBe("partner");
    expect(loadToken("FALL", "flyer")).toBeNull();
  });
});

describe("room switching (no state leaks between rooms)", () => {
  it("entering another room closes the old socket and clears the store, incl. fatal", () => {
    connect("ZZZZ");
    const first = latest();
    first.emit(welcome({ room_code: "ZZZZ" }));
    first.emit({ type: "error", code: "room_not_found", message: "nope" });
    expect(useStore.getState().fatal).toBe("not_found");

    connect("KXPD");
    expect(first.readyState).toBe(FakeWebSocket.CLOSED);
    expect(useStore.getState().fatal).toBeNull();
    expect(useStore.getState().welcome).toBeNull();
    expect(currentSocket()?.code).toBe("KXPD");
    expect(latest()).not.toBe(first);
    expect(latest().url).toMatch(/\/ws\/KXPD$/);
  });

  it("a joined player in room A is forgotten when entering room B", () => {
    connect("AAAA");
    latest().emit(joined("flyer", "t"));
    expect(useStore.getState().me).not.toBeNull();
    connect("BBBB");
    expect(useStore.getState().me).toBeNull();
  });

  it("connect() to the same room is idempotent (StrictMode double effects)", () => {
    const a = connect("SAME");
    const b = connect("SAME");
    expect(a).toBe(b);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
