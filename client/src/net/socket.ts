// The one WebSocket per tab (§A5, §F5.1): handshake, clock pings, join with the stored token,
// reconnect with backoff. A module-level singleton per room code, so React StrictMode's double
// effects and re-renders never open a second socket.
import { receivePartnerAudio } from "../audio/partnerVoice";
import { WS_BASE } from "../config";
import { useStore } from "../state/store";
import { onPong, seedFromWelcome } from "./clock";
import type { C2S, Gender, Lang, Role, S2C } from "./protocol";

export interface Socket {
  send(msg: C2S): void; // JSON text frame
  sendAudio(chunk: ArrayBuffer): void; // binary frame (only while holding the channel)
  close(): void;
}

export interface JoinParams {
  name: string;
  role: Role;
  lang: Lang;
  gender: Gender;
}

const BACKOFF_MS = [500, 1000, 2000, 4000];
const BACKOFF_MAX_MS = 5000;
const HANDSHAKE_PINGS = 5;
const RESYNC_PINGS = 3;
const PING_GAP_MS = 100;
const RESYNC_EVERY_MS = 30_000;

const S2C_TYPES = new Set<string>([
  "welcome",
  "pong",
  "joined",
  "room_state",
  "game_state",
  "flyer_view",
  "manual_card",
  "cinematic",
  "cinematic_skip",
  "skip_votes",
  "caption_partial",
  "utterance",
  "utterance_echo",
  "utterance_dropped",
  "history",
  "translation",
  "action_result",
  "object_state",
  "fx",
  "channel",
  "toast",
  "crash",
  "retry_votes",
  "deck",
  "deck_report",
  "error",
  "dev_state",
]);

/** Trust boundary: the server speaks Part A; we only check the frame is a known message type. */
function isS2C(value: unknown): value is S2C {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    S2C_TYPES.has(value.type)
  );
}

// --- token + player storage (sessionStorage, keyed by role: split-view iframes share it) ---

const tokenKey = (code: string, role: Role) => `wingin:token:${code}:${role}`;
const playerKey = (code: string, role: Role) => `wingin:player:${code}:${role}`;

function storageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // storage disabled: rejoin after refresh won't work, play still does
  }
}
function storageRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadToken(code: string, role: Role): string | null {
  return storageGet(tokenKey(code, role));
}

function parsePlayer(raw: string | null, role: Role): JoinParams | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const p: Record<string, unknown> = { ...v };
    const lang = p.lang === "en" || p.lang === "hi" ? p.lang : null;
    const gender = p.gender === "male" || p.gender === "female" ? p.gender : null;
    if (typeof p.name !== "string" || !lang || !gender) return null;
    return { name: p.name, role, lang, gender };
  } catch {
    return null;
  }
}

/**
 * A previous join of this tab for `code` (after a refresh): only when exactly one role has a
 * stored token, so the split-view iframes (which share sessionStorage) never grab each other's.
 */
export function storedJoin(code: string): JoinParams | null {
  const roles: Role[] = ["flyer", "tower"];
  const found = roles
    .filter((r) => loadToken(code, r) !== null)
    .map((r) => parsePlayer(storageGet(playerKey(code, r)), r))
    .filter((p): p is JoinParams => p !== null);
  return found.length === 1 ? (found[0] ?? null) : null;
}

class RoomSocket implements Socket {
  private ws: WebSocket | null = null;
  private intentional = false;
  private attempt = 0;
  private handshakeDone = false;
  private joinParams: JoinParams | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private resyncTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimers: ReturnType<typeof setTimeout>[] = [];
  private myRole: Role | null = null;
  private myToken: string | null = null;

  readonly code: string;

  constructor(code: string) {
    this.code = code;
  }

  open(): void {
    this.intentional = false;
    this.handshakeDone = false;
    const ws = new WebSocket(`${WS_BASE}/${encodeURIComponent(this.code)}`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    useStore.getState().setConn(this.attempt === 0 ? "connecting" : "reconnecting");
    ws.onmessage = (ev) => this.onMessage(ev);
    ws.onclose = () => this.onClose(ws);
    ws.onerror = () => {
      // onclose follows and handles the retry
    };
  }

  send(msg: C2S): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return; // §F5.1: drop intents while disconnected
    this.ws.send(JSON.stringify(msg));
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(chunk);
  }

  /** Remember the join and send it now, or as soon as the handshake has finished. */
  join(params: JoinParams): void {
    this.joinParams = params;
    if (this.handshakeDone) this.sendJoin();
  }

  close(): void {
    this.intentional = true;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    sockets.delete(this.code);
    if (current === this) current = null;
  }

  private sendJoin(): void {
    const p = this.joinParams;
    if (!p) return;
    const token = loadToken(this.code, p.role);
    useStore.getState().setJoiningRole(p.role);
    this.send({
      type: "join",
      name: p.name,
      role: p.role,
      lang: p.lang,
      gender: p.gender,
      ...(token ? { token } : {}),
    });
  }

  private ping(count: number, then?: () => void): void {
    for (let i = 0; i < count; i++) {
      this.pingTimers.push(
        setTimeout(() => {
          this.send({ type: "ping", client_ms: Date.now() });
          if (i === count - 1 && then) then();
        }, i * PING_GAP_MS),
      );
    }
  }

  private onMessage(ev: MessageEvent): void {
    // Binary frames are the partner's live voice (voice rooms); they never reach the store.
    if (ev.data instanceof ArrayBuffer) {
      receivePartnerAudio(ev.data);
      return;
    }
    if (typeof ev.data !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(ev.data);
    } catch {
      console.warn("[wingin] non-JSON frame ignored");
      return;
    }
    if (!isS2C(parsed)) {
      console.warn("[wingin] unknown message ignored", parsed);
      return;
    }
    const msg = parsed;
    const store = useStore.getState();
    switch (msg.type) {
      case "welcome":
        seedFromWelcome(msg.server_ms);
        this.attempt = 0;
        store.setConn("open");
        store.receive(msg);
        // 5 pings 100 ms apart, then join (§A5); the join waits ~one RTT after the last ping.
        this.ping(HANDSHAKE_PINGS, () => {
          this.handshakeDone = true;
          this.sendJoin();
        });
        this.startResync();
        return;
      case "pong":
        onPong(msg);
        return;
      case "joined":
        // `joined` is the authoritative rekey (the server re-sends it after swap_roles, §B8.5):
        // drop the old role's keys so a refresh finds exactly one token.
        if (this.myRole && this.myRole !== msg.role) this.dropKeys(this.myRole);
        this.myRole = msg.role;
        this.myToken = msg.token;
        storageSet(tokenKey(this.code, msg.role), msg.token);
        storageSet(
          playerKey(this.code, msg.role),
          JSON.stringify({ name: msg.name, lang: msg.lang, gender: msg.gender }),
        );
        this.joinParams = {
          name: msg.name,
          role: msg.role,
          lang: msg.lang,
          gender: msg.gender,
        };
        store.receive(msg);
        return;
      case "room_state": {
        // Fallback re-key when my role changed without a new `joined` (update_player in LOBBY).
        const meId = store.me?.id;
        const mine = meId ? msg.players.find((p) => p.id === meId) : undefined;
        if (mine && this.myRole && mine.role !== this.myRole) this.rekey(this.myRole, mine.role);
        if (mine && this.joinParams) {
          this.joinParams = {
            name: mine.name,
            role: mine.role,
            lang: mine.lang,
            gender: mine.gender,
          };
          storageSet(
            playerKey(this.code, mine.role),
            JSON.stringify({ name: mine.name, lang: mine.lang, gender: mine.gender }),
          );
        }
        store.receive(msg);
        return;
      }
      default:
        store.receive(msg);
    }
  }

  /**
   * Remove a role's keys, but only while they still hold this tab's token: split-view iframes
   * share sessionStorage, and the partner may already have written its own token there.
   */
  private dropKeys(role: Role): void {
    if (loadToken(this.code, role) !== this.myToken) return;
    storageRemove(tokenKey(this.code, role));
    storageRemove(playerKey(this.code, role));
  }

  private rekey(from: Role, to: Role): void {
    // Never overwrite a token the partner tab already stored under the new role.
    if (this.myToken && loadToken(this.code, to) === null) {
      storageSet(tokenKey(this.code, to), this.myToken);
    }
    this.dropKeys(from);
    this.myRole = to;
  }

  private startResync(): void {
    if (this.resyncTimer) clearInterval(this.resyncTimer);
    this.resyncTimer = setInterval(() => this.ping(RESYNC_PINGS), RESYNC_EVERY_MS);
  }

  private clearTimers(): void {
    for (const t of this.pingTimers) clearTimeout(t);
    this.pingTimers = [];
    if (this.resyncTimer) clearInterval(this.resyncTimer);
    this.resyncTimer = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private onClose(ws: WebSocket): void {
    if (ws !== this.ws) return; // an old socket closing after a reconnect
    this.clearTimers();
    this.handshakeDone = false;
    if (this.intentional) return;
    // Room not found is final: don't hammer the server.
    if (useStore.getState().fatal === "not_found") return;
    useStore.getState().setConn("reconnecting");
    const delay = BACKOFF_MS[this.attempt] ?? BACKOFF_MAX_MS;
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }
}

const sockets = new Map<string, RoomSocket>();
let current: RoomSocket | null = null;

export type RoomConnection = Socket & { readonly code: string; join(params: JoinParams): void };

/**
 * One socket per room code per tab; calling it again returns the same socket. Entering a
 * different room closes the previous socket and clears the store, so nothing leaks across rooms.
 */
export function connect(code: string): RoomConnection {
  for (const [other, sock] of sockets) {
    if (other !== code) sock.close();
  }
  let s = sockets.get(code);
  if (!s) {
    // A new room starts from a clean store: nothing (incl. a stale `fatal`) carries over.
    useStore.getState().leaveRoom();
    s = new RoomSocket(code);
    sockets.set(code, s);
    s.open();
  }
  current = s;
  return s;
}

/** The socket of the room this tab is in (null before `connect`). */
export function currentSocket(): RoomConnection | null {
  return current;
}

/** Close the current room's socket and clear the store (going home). */
export function leaveRoom(): void {
  current?.close();
  useStore.getState().leaveRoom();
}

/** Send through the current socket (no-op before connecting). */
export function send(msg: C2S): void {
  current?.send(msg);
}
