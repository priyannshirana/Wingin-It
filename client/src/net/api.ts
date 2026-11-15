// REST calls (§A4, §F5.3).
import { API_BASE } from "../config";
import type { Role, Status } from "./protocol";

export interface CreateRoomOptions {
  demo?: boolean;
  seed?: number;
  mock?: boolean;
  voice?: boolean;
}

export interface RoomInfo {
  exists: boolean;
  status: Status | null;
  roles_taken: Role[];
  demo: boolean;
  voice: boolean;
}

const ROLES: readonly Role[] = ["flyer", "tower"];
const STATUSES: readonly Status[] = [
  "LOBBY",
  "PROLOGUE",
  "PHASE_INTRO",
  "PLAYING",
  "PHASE_OUTRO",
  "ENDING",
  "CRASH",
  "DECK",
  "PAUSED",
];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function createRoom(opts: CreateRoomOptions = {}): Promise<string> {
  const res = await fetch(`${API_BASE}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`POST /api/rooms → ${res.status}`);
  const body: unknown = await res.json();
  if (!isObject(body) || typeof body.code !== "string") throw new Error("bad /api/rooms reply");
  return body.code;
}

export async function getRoom(code: string): Promise<RoomInfo> {
  const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(code)}`);
  if (res.status === 404)
    return { exists: false, status: null, roles_taken: [], demo: false, voice: false };
  if (!res.ok) throw new Error(`GET /api/rooms/${code} → ${res.status}`);
  const body: unknown = await res.json();
  if (!isObject(body)) throw new Error("bad /api/rooms reply");
  const taken = Array.isArray(body.roles_taken) ? body.roles_taken : [];
  return {
    exists: body.exists === true,
    status: STATUSES.find((s) => s === body.status) ?? null,
    roles_taken: ROLES.filter((r) => taken.includes(r)),
    demo: body.demo === true,
    voice: body.voice === true,
  };
}

/** Room codes: 4 letters from ABCDEFGHJKLMNPQRSTUVWXYZ (§A4). Dev may use any 4 letters. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
}

export function randomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)] ?? "A";
  }
  return code;
}

export interface Health {
  ok: boolean;
  mock_speech: boolean;
  dev_mode: boolean;
  demo_mode: boolean;
}

/** GET /health (§A4): the home page uses it for the DEMO badge. Null when unreachable. */
export async function getHealth(): Promise<Health | null> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!isObject(body)) return null;
    return {
      ok: body.ok === true,
      mock_speech: body.mock_speech === true,
      dev_mode: body.dev_mode === true,
      demo_mode: body.demo_mode === true,
    };
  } catch {
    return null;
  }
}
