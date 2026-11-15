// A tiny single-tab stand-in for the game server (Playwright `routeWebSocket`), speaking Part A
// messages, so the audio UI can be driven and screenshotted without the backend (audio-ui.spec).
// The flow specs use the multi-player fake in ./index.ts instead.
import type { Page, WebSocketRoute } from "@playwright/test";
import type {
  C2S,
  GameState,
  Gender,
  Lang,
  PlayerPublic,
  Role,
  RoomState,
  S2C,
  Status,
} from "../../src/net/protocol";

export interface FakeServer {
  /** Every client → server text message, in order. */
  received: C2S[];
  /** Binary frames received (byte lengths). */
  binary: number[];
  send(msg: S2C): void;
  status(status: Status, game?: Partial<GameState>): void;
}

interface Opts {
  code?: string;
  me: { role: Role; lang: Lang; gender: Gender; name: string };
  partner: { lang: Lang; gender: Gender; name: string };
  mock?: boolean;
  /** Grant `ptt_start` with a channel message (default true). */
  grant?: boolean;
}

const now = () => Date.now();

export function gameState(over: Partial<GameState> = {}): GameState {
  return {
    type: "game_state",
    status: "PLAYING",
    paused_from: null,
    phase: 1,
    signal_level: 1,
    action_index: 0,
    completed: 2,
    total_actions: 7,
    action_id: "P1_A3",
    action_active: true,
    input_locked: false,
    fuel_s: 112.4,
    fuel_max_s: 150,
    fuel_draining: true,
    lifelines: { flyer: 3, tower: 3 },
    lifelines_enabled: false,
    attempt: 1,
    radar: {
      blip: "amber",
      icon: "mayday",
      storm: false,
      runway: false,
      glide_path: false,
      progress: 0.3,
      landed: false,
    },
    demo: false,
    server_ms: now(),
    ...over,
  };
}

export async function fakeServer(page: Page, opts: Opts): Promise<FakeServer> {
  const code = opts.code ?? "TEST";
  const mock = opts.mock ?? false;
  const partnerRole: Role = opts.me.role === "flyer" ? "tower" : "flyer";
  let socket: WebSocketRoute | null = null;
  let status: Status = "LOBBY";
  let joined = false;
  const server: FakeServer = {
    received: [],
    binary: [],
    send: (msg) => socket?.send(JSON.stringify(msg)),
    status: (s, game) => {
      status = s;
      server.send(roomState());
      if (s !== "LOBBY") server.send(gameState({ status: s, ...game }));
    },
  };

  const players = (): PlayerPublic[] => {
    const partner: PlayerPublic = {
      id: "p-partner",
      role: partnerRole,
      ready: true,
      connected: true,
      is_bot: false,
      ...opts.partner,
    };
    if (!joined) return [partner];
    return [{ id: "p-me", ready: false, connected: true, is_bot: false, ...opts.me }, partner];
  };
  const roomState = (): RoomState => ({
    type: "room_state",
    code,
    status,
    demo: false,
    mock_speech: mock,
    voice: false,
    players: players(),
    can_start: false,
    block_reason: joined ? "not_ready" : "missing_player",
    play_again_votes: [],
  });

  await page.routeWebSocket(/\/ws\//, (ws) => {
    socket = ws;
    ws.onMessage((raw) => {
      if (typeof raw !== "string") {
        server.binary.push(raw.byteLength);
        return;
      }
      const msg = JSON.parse(raw) as C2S;
      server.received.push(msg);
      switch (msg.type) {
        case "ping":
          server.send({ type: "pong", client_ms: msg.client_ms, server_ms: now() });
          break;
        case "join":
          joined = true;
          server.send({
            type: "joined",
            player_id: "p-me",
            token: "tok",
            role: msg.role,
            lang: msg.lang,
            gender: msg.gender,
            name: msg.name,
          });
          server.send(roomState());
          break;
        case "ptt_start":
          if (opts.grant ?? true) server.send({ type: "channel", busy_by: opts.me.role });
          break;
        case "ptt_end":
          server.send({ type: "channel", busy_by: null });
          break;
        default:
          break;
      }
    });
    server.send({
      type: "welcome",
      server_ms: now(),
      room_code: code,
      mock_speech: mock,
      voice: false,
      dev_mode: false,
      demo: false,
      gloss_threshold: 2,
      version: "0.1.0",
    });
    server.send(roomState());
  });
  return server;
}

/** The auto-join URL for this fake room (§F4 `auto=1`). */
export function roomUrl(opts: Opts): string {
  const q = new URLSearchParams({
    auto: "1",
    role: opts.me.role,
    lang: opts.me.lang,
    gender: opts.me.gender,
    name: opts.me.name,
  });
  return `/r/${opts.code ?? "TEST"}?${q.toString()}`;
}
