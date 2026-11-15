# Wingin' it! — Frontend Spec (MVP)

Nov 14, 2026 · companion to `docs/BACKEND_SPEC.md` · derived from `Fade — Build Spec (MVP).md`

> **Home and characters:** the game opens on a **home page** (start or join a game) and each player picks a **male or female character** for their role before playing (§F8).
>
> **Name:** the game is **Wingin' it!** (logo: WINGIN' IT!). The original build spec uses the working title *Fade*; wherever it says Fade, read Wingin' it!. Code identifiers use the prefix `wingin` (e.g. `wingin:token:…`, `wingin_games`).

This is the complete brief for the **browser client** of *Wingin' it!*: the lobby, the Flyer's 3D toy cockpit and HUD, the Tower's 2D control-tower screen with the ring-bound manual, subtitles and lifelines, every cinematic, the microphone and push-to-talk, procedural sound, the word deck, and the dev, mock and demo tooling. Part A, the shared contract, appears word for word in the backend spec too. Part F is everything the client owns.

**The frontend is 3D-first and cinematic.** The Flyer plays inside a real-time 3D toy cockpit with scripted camera cinematics; the Tower's 2D screen plays synchronized cinematic beats. §F0 sets the art direction, the color script, the shot and motion rules and the visual acceptance set every 3D/cinematic task must meet.

**How to read it**

- **Part A** = the contract with the server. The client renders what the server sends and only sends intents. Never compute game outcomes on the client.
- **Part F** = client internals. File paths, component names and visual numbers are prescriptive starting points; tune visuals by eye, but keep ids, messages and timings exact.
- The client bundle may import **only** `content/stations.json` and `content/cinematics.json` from `content/` (privacy rule A2).
- When something is still ambiguous, pick the simplest option that keeps the game playable and leave a `// SPEC-ASSUMPTION:` comment.

## Contents

- Part A — Shared Contract (A1–A17)
- Part F — Frontend
  - F0 Design direction: 3D-first and cinematic (art pillars, color script, shot rules, motion language, hero beats, visual acceptance set)
  - F1 Principles
  - F2 Stack, packages and build config
  - F3 Client layout
  - F4 Routes and URL parameters
  - F5 Networking (`net/`)
  - F6 State store (`state/store.ts`)
  - F7 UI strings (`i18n/strings.ts`)
  - F8 Home page, character select and lobby
  - F9 The 3D cockpit (scene, stations, parts, environment, characters, world mapping)
  - F10 Camera rig, light rigs, and free look (F10.3, pending)
  - F11 Flyer HUD
  - F12 Tower screen (radar, the flight manual, the subtitle column)
  - F13 Subtitles, keyword chips and lifelines
  - F14 Cinematics (runner, sync, skip, every timeline for both screens)
  - F15 Action feedback
  - F16 Audio (microphone, worklet, push-to-talk, procedural SFX, mixing)
  - F17 Word deck
  - F18 Dev mode (split view, mock talking, quick-say, bots, dev panel, scene sandbox and cinematic scrubber)
  - F19 Demo mode (presenter)
  - F20 Overlays and edge cases
  - F21 Performance budget
  - F22 Testing
  - F23 Frontend milestones and done criteria
  - F24 Frontend acceptance checklist

# Part A — Shared Contract (identical in both specs)

> **This whole Part A is copied word for word into both `FRONTEND_SPEC.md` and `BACKEND_SPEC.md`.** It is the agreement between the client and the server. If you change anything here, change it in both files in the same commit. When this contract and the original build spec (`Fade — Build Spec (MVP).md`) disagree, **this contract wins**. Every place where it fills a gap in the build spec is marked **[ASSUMPTION]** and should also carry a `// SPEC-ASSUMPTION:` (TS) or `# SPEC-ASSUMPTION:` (Python) comment in code.

## A1. Product in one paragraph

**Wingin' it!** is a two-player co-op browser game built for a hackathon demo. A **Flyer** sits in a first-person 3D toy cockpit. A **Tower** has a 2D control-tower screen with a ring-bound flight manual and a radar, and never sees the cockpit. They talk out loud in the same room over a push-to-talk "radio". The server transcribes each transmission and shows the listener a subtitle **in Latin letters**, with keywords highlighted and, depending on the **signal level** (= phase number), glossed. Phase 1 glosses everything, Phase 2 glosses only new or not-yet-learned words, Phase 3 glosses nothing (3 lifelines per player reveal a full translation). Three phases: **Pilot Down** (Overhead panel, 7 actions, 150 s fuel), **Engine Fire** (Pedestal, 6 actions, 150 s), **Storm Landing** (Front panel, 8 actions, 180 s). The end screen is a **word deck** of partner-language words each player learned, played back in the partner's real recorded voice. Pitch line: *a translator designed to make itself unnecessary.*

**Presentation is 3D-first and cinematic.** The Flyer's whole experience is a real-time 3D toy world with scripted camera cinematics between and inside phases; the Tower's 2D screen plays synchronized 2D cinematic beats on the same server clock. The server's job is to cue them exactly (`cinematic`, `fx`, `World`); the client's job is to make every cued frame look great (Frontend §F0).

## A2. Non-negotiable invariants

These hold everywhere. Tests on both sides check them.

1. **The server is the single source of truth.** Clients send intents (`interact`, `say_text`, `lifeline`, …) and render what the server sends. Clients never decide success, fuel, glosses or state transitions.
2. **Role privacy.**
   - The Tower client never receives: `flyer_view`, `object_state`, rolled variable values, lamp colors, fire side, or any cinematic `params` that reveal them. (The only exceptions are things the Tower learned legitimately after the fact: `action_result.row_index` on success, `action_result.used` on failure.)
   - The Flyer client never receives `manual_card`, branch lines, rule tables, or `quick_say` lines.
   - **The client bundle must not import** `content/lexicon.json` or any `content/phase*.json`. It may import only `content/stations.json` and `content/cinematics.json` (both non-secret).
   - `dev_state` breaks privacy on purpose and is **only** sent when the server runs with `DEV_MODE=1`.
3. **Subtitles are always Latin script.** Hindi speech is shown romanized (*teen number button dabao*). Devanagari never appears inside a subtitle segment. Glosses are Latin too. Each player's **own material** (UI chrome, manual, title cards, word-deck meanings, lifeline translations into Hindi) is in their own script.
4. **One keyword style.** Every keyword chip looks identical. Never color a chip by meaning (no red *laal*).
5. **The manual never scripts sentences.** It shows the panel drawing, what to find out, and a rule table. Example lines exist only for Mock Mode quick-say, bots and the validator, and are only sent when `quick_say` is enabled (Mock/Dev).
6. **Only the current station's controls are clickable**, and only while an action is active and no cinematic or event is running.
7. **During any cinematic, all input except push-to-talk is disabled.**
8. **Fun, never scary.** Crashes end in a cartoon "POOF" cloud.
9. **Languages are interchangeable between roles.** Each player picks English or Hindi in the lobby, independently of their role. The only rule is that the two players pick **different** languages. Both pairings are first-class and must work everywhere (content, manual, subtitles, glosses, lifelines, quick-say, bots, deck, report, UI strings, tests): **(Flyer English, Tower Hindi)** and **(Flyer Hindi, Tower English)**. "Default English / default Hindi" in older text only means the demo's usual setup, never a code path. Nothing may branch on role to pick a language; always use the player's `lang`.
10. **Characters.** Each player picks a **gender (male / female)** for their role's character on joining. The Flyer's character is the passenger in the right-hand seat (a 3D toy model in the cockpit and a 2D portrait); the Tower's character is the air-traffic controller (a 2D portrait with a headset). Gender is public (it's in `room_state`), stays with the player across play again / swap roles, and also drives **Hindi grammatical gender** in UI strings that refer to that player (`बोल रहा है` / `बोल रही है`). The unconscious captain (the NPC pilot in the left seat) is not player-selectable.

## A3. Ports, URLs and environment

| Thing | Local dev | Deployed |
| --- | --- | --- |
| Server (FastAPI/uvicorn) | `http://localhost:8000` | ALB `https://api.<domain>` (or Caddy on EC2) |
| Client (Vite) | `http://localhost:5173` | Amplify `https://<domain>` |
| WebSocket | `ws://localhost:5173/ws/{CODE}` (proxied by Vite to :8000) | `wss://api.<domain>/ws/{CODE}` |
| Clips | `/clips/{clip_id}.wav` (proxied) | `https://api.<domain>/clips/{clip_id}.wav` |
| REST | `/api/...` (proxied) | `https://api.<domain>/api/...` |

- Client env: `VITE_WS_URL` (base, without the code, e.g. `wss://api.example.com/ws`; empty = same origin `/ws`), `VITE_API_URL` (e.g. `https://api.example.com`; empty = same origin), `VITE_DEV_MODE` (`1`/`0`).
- Server env: see Backend spec §B3. The ones the client cares about are reported to it in the `welcome` message (`mock_speech`, `dev_mode`, `demo`, `gloss_threshold`).
- Vite dev server proxies `/api`, `/ws` (with `ws: true`) and `/clips` to `http://localhost:8000` (or `http://server:8000` inside docker compose).

## A4. HTTP endpoints

| Method + path | Request | Response | Notes |
| --- | --- | --- | --- |
| `GET /health` | — | `{"ok": true, "mock_speech": bool, "dev_mode": bool, "demo_mode": bool, "rooms": int, "version": "0.1.0"}` | ALB health check. 200 when content validated. |
| `POST /api/rooms` | `{"demo"?: bool, "seed"?: int, "mock"?: bool, "voice"?: bool}` | `{"code": "KXPD"}` | Creates a room. `demo` and `mock` are always honored per room (the client sends them from `?demo=1` / `?mock=1`); `DEMO_MODE=1` still makes every room a demo room. `voice` (default `false`) is always honored per room and makes it a voice room (§A5.1). `seed` honored only in Dev Mode. |
| `GET /api/rooms/{code}` | — | `{"exists": bool, "status": Status, "roles_taken": Role[], "demo": bool, "voice": bool}` | Used by the join form before opening the socket. 404 → `{"exists": false}`. |
| `GET /clips/{clip_id}.wav` | — | `audio/wav` (16 kHz mono PCM16) | 404 if unknown. `Cache-Control: private, max-age=3600`. |
| `WS /ws/{code}` | — | — | One socket per player tab. Origin checked against `ALLOWED_ORIGINS`. |

Room codes: 4 uppercase letters from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I, no O, no digits). In Dev Mode a code may also be any 4 letters the client asks for (e.g. `TEST`): connecting to `/ws/TEST` creates it if it doesn't exist **[ASSUMPTION]** (needed by `/dev/split`).

## A5. WebSocket basics

- **Text frames** are JSON objects with a `type` field and the payload fields flat beside it: `{"type": "interact", "object_id": "OH_BTN_1", "verb": "press"}`.
- **Binary frames** client → server are raw mic audio: mono, Int16 little-endian PCM, 16 kHz, normally 3,200 bytes (100 ms). Accepted only between a granted `ptt_start` and `ptt_end`. Max 6,400 bytes per frame. Server → client binary frames exist only in voice rooms (§A5.1).
- Max text frame 8 KB. `say_text.text` max 300 characters. `join.name` 1–16 characters, trimmed.

**Connection handshake**

```
client opens WS /ws/KXPD
server -> welcome      {server_ms, room_code, mock_speech, dev_mode, demo, voice, gloss_threshold, version}
server -> room_state   (spectator view, so the join form can disable taken roles)
client -> ping x5      {client_ms}            (100 ms apart)
server -> pong x5      {client_ms, server_ms}
client -> join         {name, role, lang, gender, token?}
server -> joined       {player_id, token, role, lang, gender, name}
server -> room_state   (to everyone in the room)
... if the game is already running (rejoin):
server -> game_state, flyer_view | manual_card, history, cinematic (if one is running), channel, deck (if in DECK)
```

**Clock sync.** For each pong: `rtt = now - client_ms`, `offset = server_ms + rtt/2 - now`. Keep the offset from the sample with the smallest RTT. `serverNow() = Date.now() + offset`. Re-run 3 pings every 30 s and keep the best.

**Reconnect and tokens.** `joined.token` is an opaque string. The client stores it in `sessionStorage` under `wingin:token:{CODE}:{role}` (keyed by role, because same-origin iframes in `/dev/split` share `sessionStorage`). On reconnect it sends `join` with the token; the server re-binds the same player slot. A `join` without a valid token for a role that is held by another player (connected, or disconnected less than 60 s ago) gets `error role_taken`. In Dev Mode a token-less join for a disconnected role takes it over **[ASSUMPTION]**.

Client reconnect backoff: 0.5 s, 1 s, 2 s, 4 s, then every 5 s, forever, with a "Reconnecting…" overlay.

### A5.1 Partner audio (voice rooms)

A room created with `{"voice": true}` is a voice room (`welcome.voice`, `room_state.voice`). In a voice room the server forwards every binary audio frame it **accepts** from the current channel holder (exactly the frames it feeds to transcription, including the pre-roll the client sends right after `ptt_start`) to the **partner** as a server → client binary frame with identical bytes: mono, Int16 little-endian PCM, 16 kHz, normally 3,200 bytes. Rules:

- Only to the other joined player, never back to the speaker, never to spectators or bots.
- Only while the speaker holds the channel; relaying stops at `channel{busy_by: null}`.
- Never in mock rooms (they have no audio), never in normal rooms.
- Best effort: the server drops relayed frames if the partner's connection is backed up, so the client must tolerate gaps. Subtitles (`utterance`) still arrive as usual.
- Every binary frame a client receives is partner audio; text frames are unchanged.

## A6. Enums and ids

```ts
type Role = "flyer" | "tower";
type Lang = "en" | "hi";
type Status =
  | "LOBBY" | "PROLOGUE" | "PHASE_INTRO" | "PLAYING" | "PHASE_OUTRO"
  | "ENDING" | "CRASH" | "DECK" | "PAUSED";
type PhaseNo = 1 | 2 | 3;
type SignalLevel = 1 | 2 | 3;               // == phase number while playing
type StationId = "overhead" | "pedestal" | "front";
type Verb = "press" | "toggle" | "pull" | "move_down" | "move_up";
type LampColor = "red" | "green" | "blue" | "yellow";
type Side = "left" | "right";
type Gender = "male" | "female";          // the player's character for their role (avatar + Hindi grammar)

type ConceptId =
  | "RED" | "GREEN" | "BLUE" | "ONE" | "TWO" | "THREE" | "FOUR"
  | "PRESS" | "PULL" | "ON" | "OFF" | "YES" | "NO" | "WHICH" | "TIMES"   // phase 1 (15)
  | "FIRE" | "LEFT" | "RIGHT" | "YELLOW" | "DOWN";                       // phase 2 (5)

type PartType =
  | "PushButton" | "ToggleSwitch" | "PullHandle" | "UpDownLever"
  | "NotchLever" | "Lamp" | "FuelGauge" | "Screen";

type LightRig = "night_alarm" | "night_calm" | "fire" | "storm" | "dawn";
type Weather = "clouds_night" | "rain" | "storm" | "rain_light" | "clear_dawn";
```

**Object states (tagged union; pydantic uses a discriminated union on `kind`)**

```ts
type ObjectState =
  | { kind: "button" }                                        // PushButton: no persistent state
  | { kind: "toggle"; value: "on" | "off" }                   // ToggleSwitch (bat up = on)
  | { kind: "handle"; value: "in" | "out" }                   // PullHandle
  | { kind: "lever";  value: "up" | "down" }                  // UpDownLever
  | { kind: "notch";  value: 0 | 1 | 2 }                      // NotchLever
  | { kind: "lamp";   color: LampColor | null; blinking: boolean; attention: boolean }
  | { kind: "gauge" }                                         // FuelGauge reads game_state.fuel_s
  | { kind: "screen"; on: boolean };                          // decorative screens (AP screen)
```

`attention` stays in the protocol (the server still sets it on the lamp the Tower is asking about), but **the client never renders it: no ring, glow or any other marker.** The Flyer has to work out which lamp is meant from what the Tower says (product decision, Nov 14 2026). `blinking` = 1 Hz blink. A lamp with `color: null` is dark grey with no emissive.

**Verb ↔ part type**

| Part type | Verbs the client may send | Notes |
| --- | --- | --- |
| PushButton | `press` | |
| ToggleSwitch | `toggle` | Server computes the new state. |
| PullHandle | `pull` | One-shot; stays `out`. |
| UpDownLever | `move_down` when `up`, `move_up` when `down` | |
| NotchLever | `move_down` (click), `move_up` (shift-click) | |
| Lamp, FuelGauge, Screen | — | Never interactive. |

## A7. Client → server messages

```ts
type C2S =
  | { type: "ping"; client_ms: number }
  | { type: "join"; name: string; role: Role; lang: Lang; gender: Gender; token?: string }
  | { type: "update_player"; name?: string; role?: Role; lang?: Lang; gender?: Gender }   // LOBBY only [ASSUMPTION]
  | { type: "ready"; ready?: boolean }                                   // default true
  | { type: "ptt_start" }
  | { type: "ptt_end" }
  | { type: "say_text"; text: string; lang?: Lang }                      // Mock/Dev/Demo only; lang defaults to the player's
  | { type: "interact"; object_id: string; verb: Verb }                  // flyer only
  | { type: "lifeline"; utterance_id: string }                           // phase 3 only
  | { type: "skip_cinematic" }
  | { type: "retry" }                                                    // CRASH only
  | { type: "play_again" }                                               // DECK only [ASSUMPTION]
  | { type: "swap_roles" }                                               // DECK only [ASSUMPTION]
  | { type: "presenter"; cmd: "next_action" | "next_phase" }             // demo rooms only
  | { type: "dev"; cmd: DevCmd; args?: Record<string, unknown> };        // DEV_MODE only

type DevCmd =
  | "complete_action"            // succeed the current action as if done right
  | "fail_action"                // count one wrong action (buzzer, -10 s)
  | "goto_phase"                 // args {phase: 1|2|3}: jump to PHASE_INTRO(n)
  | "set_seed"                   // args {seed: number}: LOBBY = next game; in game = restart current phase
  | "add_fuel"                   // args {seconds: number} (default 60)
  | "bots"                       // args {flyer?: boolean, tower?: boolean}
  | "force"                      // args {var: string, value: string}: next roll of var returns value
  | "skip_cinematic";            // force-skip without the partner's vote
```

Binary audio frames are the only other client → server traffic.

## A8. Server → client messages

```ts
type S2C =
  | Welcome | Pong | Joined | RoomState | GameState | FlyerView | ManualCardMsg
  | CinematicMsg | CinematicSkip | SkipVotes | CaptionPartial | UtteranceMsg | UtteranceEcho
  | UtteranceDropped | History | TranslationMsg | ActionResult | ObjectStateMsg | Fx
  | ChannelMsg | Toast | Crash | RetryVotes | DeckMsg | DeckReport | ErrorMsg | DevState;

interface Welcome { type: "welcome"; server_ms: number; room_code: string; mock_speech: boolean;
  dev_mode: boolean; demo: boolean; voice: boolean; gloss_threshold: number; version: string }
interface Pong { type: "pong"; client_ms: number; server_ms: number }
interface Joined { type: "joined"; player_id: string; token: string; role: Role; lang: Lang; gender: Gender; name: string }

interface PlayerPublic { id: string; name: string; role: Role; lang: Lang; gender: Gender; ready: boolean;
  connected: boolean; is_bot: boolean }
interface RoomState { type: "room_state"; code: string; status: Status; demo: boolean;
  mock_speech: boolean; voice: boolean; players: PlayerPublic[]; can_start: boolean;
  block_reason: null | "missing_player" | "same_language" | "not_ready";
  play_again_votes: Role[] }

interface Radar {
  blip: "green" | "amber" | "red";
  icon: null | "mayday" | "fire" | "smoke";
  storm: boolean;            // storm clouds drawn on the radar (phase 2 outro onward)
  runway: boolean;           // runway icon visible (phase 3)
  glide_path: boolean;       // glide-path line (phase 3)
  progress: number;          // 0..1, plane blip position along the route (= completed actions / total, per phase)
  landed: boolean;
}
interface GameState { type: "game_state";
  status: Status; paused_from: Status | null;
  phase: 0 | PhaseNo;                  // 0 before phase 1 starts
  signal_level: 0 | SignalLevel;
  action_index: number;                // 0-based; -1 when no action
  completed: number;                   // actions done in this phase
  total_actions: number;
  action_id: string | null;            // e.g. "P1_A1" (not secret)
  action_active: boolean;              // false during the 1.5 s gap, cinematics and events
  input_locked: boolean;               // true while any cinematic/event runs
  fuel_s: number;                      // one decimal
  fuel_max_s: number;
  fuel_draining: boolean;
  lifelines: { flyer: number; tower: number };
  lifelines_enabled: boolean;          // phase 3 PLAYING only
  attempt: number;                     // 1 + retries of this phase
  radar: Radar;
  demo: boolean;
  server_ms: number }

interface FlyerView { type: "flyer_view";
  station: StationId | null;           // current station (null outside phases)
  interactive: string[];               // ids clickable right now
  objects: Record<string, ObjectState>;// every object on all three stations
  world: World;                        // see A11
  quick_replies: QuickLine[] | null }  // Mock/Dev only

interface ManualCardMsg { type: "manual_card"; card: ManualCard | null }   // null = manual closed (cover page)
interface ManualCard {
  action_id: string; index: number; total: number; phase: PhaseNo; station: StationId; lang: Lang;
  phase_name: string;                  // "पायलट बेहोश"
  title: string;                       // short module title, e.g. "ऑटोपायलट लाइट"
  find_out: FindOut | null;            // null for say-only and branch_on actions
  known_from: { index: number; text: string } | null;   // branch_on: "यह आपने कदम 1 में पता किया"
  rows: RuleRow[];                     // same order as content branches; one row for say-only
  hint: string;                        // handwritten hint under the drawing
  sticky: string;                      // yellow sticky note
  own_words_note: string;              // "अपने शब्दों में पूछो" (observe) / "अपने शब्दों में बोलो" (say-only)
  progress: ("done" | "current" | "upcoming")[];
  last_wrong: { label: Segment[]; count: number } | null;
  stamp: null | "emergency";           // phase 2 pages
  smudges: boolean;                    // phase 3 pages
  highlight: { circled: string[]; question: string[] };   // object ids on the drawing
  quick_say: QuickSay | null }         // Mock/Dev only
interface FindOut { station_label: string; part_label: Segment[]; property_label: string;
  values: { value: string; label: Segment[]; swatch: Swatch }[] }
interface RuleRow { when: { value: string; label: Segment[]; swatch: Swatch } | null;
  do: Segment[]; controls: ControlDrawing[]; order: "single" | "ordered" | "unordered" }
interface ControlDrawing { object_id: string; type: PartType; label: string | null;
  color: string; target: ObjectState; count: number }
type Swatch = { kind: "color"; color: LampColor } | { kind: "side"; side: Side }
            | { kind: "yesno"; value: "yes" | "no" };
interface QuickLine { label: string; text: string; alt_text?: string }  // text = roman/en, alt_text = Devanagari
interface QuickSay { ask: QuickLine | null; say: QuickLine | null; branches: { value: string; line: QuickLine }[] }

interface CinematicMsg { type: "cinematic"; id: CinematicId; start_at_ms: number; duration_ms: number;
  params: Record<string, string | number | boolean> }   // params are role-filtered (A10)
interface CinematicSkip { type: "cinematic_skip"; id: CinematicId }
interface SkipVotes { type: "skip_votes"; id: CinematicId; roles: Role[] }

interface Segment { text: string; kind: "plain" | "keyword";
  concept?: ConceptId; concepts?: ConceptId[];          // concepts only when one token = 2 concepts ("twice")
  gloss?: string | null }
interface CaptionPartial { type: "caption_partial"; text: string }       // speaker only, Latin
interface UtteranceMsg { type: "utterance"; id: string; speaker_role: Role; speaker_name: string;
  lang: Lang; segments: Segment[]; level: SignalLevel | 0; lifeline_available: boolean;
  created_at_ms: number }
interface UtteranceEcho { type: "utterance_echo"; id: string; transcript_display: string }
interface UtteranceDropped { type: "utterance_dropped"; reason: "too_short" | "no_speech" | "transcribe_failed" }
interface History { type: "history"; utterances: (UtteranceMsg & { translation?: string })[] } // last 5 from partner
interface TranslationMsg { type: "translation"; utterance_id: string; text: string; lang: Lang; lifelines_left: number }

interface ActionResult { type: "action_result"; action_id: string; success: boolean;
  reason: null | "wrong_object" | "wrong_count" | "wrong_direction" | "wrong_order" | "dev";
  fuel_delta: number;                  // 0 on success, -10 on wrong
  completed_steps: number; total_steps: number;
  row_index?: number;                  // tower only, success only
  used?: { object_id: string; label: Segment[]; verb: Verb; count: number } }  // tower only, failure only
interface ObjectStateMsg { type: "object_state"; object_id: string; state: ObjectState; bounce: boolean }
interface Fx { type: "fx"; effects: string[] }   // role-filtered one-shots, grammar in A12
interface ChannelMsg { type: "channel"; busy_by: Role | null }
interface Toast { type: "toast"; kind: "crossover" | "info" | "warning" | "error"; key: ToastKey;
  params: Record<string, string | number>; text?: string }   // text = English fallback for logs
type ToastKey = "toast.crossover"      // params {word}: "CROSSOVER! +5s"
  | "toast.partner_left" | "toast.partner_back" | "toast.partner_gone"
  | "toast.didnt_catch"  | "toast.channel_busy" | "toast.translation_failed"
  | "toast.no_lifelines" | "toast.info";      // toast.info params {text}
interface Crash { type: "crash"; phase: PhaseNo }
interface RetryVotes { type: "retry_votes"; roles: Role[] }

interface DeckMsg { type: "deck"; partner_name: string; partner_lang: Lang; partner_gender: Gender; learned_count: number;
  words: DeckWord[]; report: string | null; report_pending: boolean; stats: Stats }
interface DeckWord { concept: ConceptId; word: string;      // partner-language word, Latin (romanized if Hindi)
  meaning: string; meaning_script: "latin" | "deva";        // meaning in the player's own language/script
  understood: number; spoken: number; learned: boolean; clip_url: string | null }
interface Stats { phases: { phase: PhaseNo; fuel_left_s: number; wrong_actions: number;
    lifelines_used: number; attempts: number; time_s: number }[];
  wrong_actions_total: number; lifelines_used: { mine: number; partner: number };
  total_time_s: number; fuel_left_final_s: number }
interface DeckReport { type: "deck_report"; report: string }
interface ErrorMsg { type: "error"; code: ErrorCode; message: string }
interface DevState { type: "dev_state"; /* see A13 */ }
```

## A9. Who receives what

| Message | Flyer | Tower | When |
| --- | --- | --- | --- |
| `welcome`, `pong`, `joined`, `error` | own | own | handshake / on demand |
| `room_state` | ✓ | ✓ | any lobby/roster change |
| `game_state` | ✓ | ✓ | every change + every 1 s while fuel drains |
| `flyer_view` | ✓ | ✗ | phase start, action activation, cinematic end, rejoin, any world change |
| `object_state` | ✓ | ✗ | every confirmed or bounced control change, lamp change |
| `manual_card` | ✗ | ✓ | action activation, after a wrong action (with `last_wrong`), `null` outside PLAYING, rejoin |
| `cinematic` / `cinematic_skip` / `skip_votes` | ✓ (full params) | ✓ (params filtered) | |
| `caption_partial`, `utterance_echo`, `utterance_dropped` | speaker | speaker | |
| `utterance` | listener | listener | |
| `history` | ✓ | ✓ | rejoin |
| `translation` | the player who spent the lifeline | same | |
| `action_result` | ✓ (no `row_index`/`used`) | ✓ | every judged action outcome |
| `fx` | `sfx:`, `fx:`, `both:` effects | `tower:`, `both:` effects | |
| `channel` | ✓ | ✓ | |
| `toast` | one or both | one or both | |
| `crash`, `retry_votes` | ✓ | ✓ | |
| `deck`, `deck_report` | own deck | own deck | entering DECK |
| `dev_state` | ✓ | ✓ | DEV_MODE only, on every change (throttled 4/s) |
| binary partner audio | listener | listener | voice rooms only, while the partner holds the channel (§A5.1) |

## A10. Cinematics

Single source: `content/cinematics.json` (both sides read it; durations must match the GSAP timelines). Kinds: `state` = drives a state transition; `in_phase` = runs inside PLAYING between actions (fuel paused); `event` = runs at the start of an action (fuel paused, action inactive until it ends).

| id | kind | duration ms | demo ms | skippable | Plays in | Flyer params | Tower params |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `prologue` | state | 28000 | 12000 | yes | PROLOGUE | — | — |
| `p1_intro` | state | 1200 (3200 on retry) | 1200 | yes | PHASE_INTRO(1) | `retry` | `retry` |
| `p1_seat` | in_phase | 3000 | 3000 | yes | after P1_A3 | — | — |
| `p1_outro` | state | 6000 | 6000 | yes | PHASE_OUTRO(1) | — | — |
| `p2_intro` | state | 9000 | 9000 | yes | PHASE_INTRO(2) | `fire_side`, `retry` | `retry` |
| `p2_extinguish` | in_phase | 3000 | 3000 | yes | after P2_B3 | `fire_side` | — |
| `p2_outro` | state | 8000 | 8000 | yes | PHASE_OUTRO(2) | `stopped_side` | — |
| `p3_intro` | state | 7000 | 7000 | yes | PHASE_INTRO(3) | `damaged_side`, `retry` | `retry` |
| `lightning_strike` | event | 1500 | 1500 | yes | start of P3_C5 | — | — |
| `p3_runway_reveal` | in_phase | 4000 | 4000 | yes | after P3_C4 | — | — |
| `p3_touchdown` | in_phase | 6000 | 6000 | yes | after P3_C7 | — | — |
| `landing` | state | 7000 | 7000 | yes | PHASE_OUTRO(3) | `damaged_side` | — |
| `ending` | state | 6000 | 4000 | yes | ENDING | `fuel_left_s`, `total_time_s` | same |
| `crash` | state | 5000 | 5000 | no | CRASH | — | — |

- `fire_side`, `stopped_side`, `damaged_side` are `"left"` / `"right"` and are **never** sent to the Tower.
- **Prologue change (Nov 14 2026, built):** the prologue is a 28 s movie-style opening (12 s in demo): takeoff, a "1.5 hours later" black card, the pilot dozing off, a "take control" card, black, then a zoom into the Flyer's eyes (Frontend §F14.2, §F14.4, §F12.7). `content/cinematics.json` carries the new durations (28000 / 12000); the server reads them from there and needs no other change.
- The server sends `cinematic` with `start_at_ms = server_now + 300`. A client that receives it late seeks the timeline forward by `serverNow() - start_at_ms`.
- **Skip:** each player sends `skip_cinematic`; the server broadcasts `skip_votes`; when both roles have voted (bots vote instantly) the server broadcasts `cinematic_skip {id}` and advances immediately. Clients call `timeline.progress(1)` so every end state is applied. `crash` is not skippable (it waits for Retry instead).
- After a `state` cinematic ends the server enters the next state. After an `in_phase` or `event` cinematic ends the server sends the post-cinematic `flyer_view` (world end state) and activates the next action (or, for `event`, makes the current action active).
- `crash` has no automatic end: after 5 s the Retry button becomes available; the state stays `CRASH` until both players press Retry.

`content/cinematics.json` (exact content):

```json
{
  "lead_ms": 300,
  "cinematics": {
    "prologue":         {"kind": "state",    "duration_ms": 28000, "demo_duration_ms": 12000, "skippable": true},
    "p1_intro":         {"kind": "state",    "duration_ms": 1200,  "retry_duration_ms": 3200, "skippable": true},
    "p1_seat":          {"kind": "in_phase", "duration_ms": 3000,  "skippable": true},
    "p1_outro":         {"kind": "state",    "duration_ms": 6000,  "skippable": true},
    "p2_intro":         {"kind": "state",    "duration_ms": 9000,  "skippable": true},
    "p2_extinguish":    {"kind": "in_phase", "duration_ms": 3000,  "skippable": true},
    "p2_outro":         {"kind": "state",    "duration_ms": 8000,  "skippable": true},
    "p3_intro":         {"kind": "state",    "duration_ms": 7000,  "skippable": true},
    "lightning_strike": {"kind": "event",    "duration_ms": 1500,  "skippable": true},
    "p3_runway_reveal": {"kind": "in_phase", "duration_ms": 4000,  "skippable": true},
    "p3_touchdown":     {"kind": "in_phase", "duration_ms": 6000,  "skippable": true},
    "landing":          {"kind": "state",    "duration_ms": 7000,  "skippable": true},
    "ending":           {"kind": "state",    "duration_ms": 6000,  "demo_duration_ms": 4000, "skippable": true},
    "crash":            {"kind": "state",    "duration_ms": 5000,  "skippable": false}
  }
}
```

`type CinematicId` = the keys above.

## A11. The `World` object (Flyer's persistent scene state)

The server owns `World` and sends it inside every `flyer_view`. It is the **resting** state of the scene. Cinematic timelines animate from the previous world to the next; when the post-cinematic `flyer_view` arrives its values already match, so nothing jumps. On rejoin the client renders straight from `World`.

```ts
interface World {
  light_rig: LightRig;
  alarm: boolean;                 // alarm_master loop + red pulse
  warning_beep: boolean;          // warning_beep loop (P1_A4)
  pilot: { slumped: boolean; seat_back: boolean; awake: boolean };
  ap_screen: boolean;             // OH autopilot screen booted
  fire: { side: Side | null; level: "none" | "full" | "half" | "smoke" | "wisp" | "flicker" };
  propeller_stopped: Side | null;
  fire_bell: boolean;
  fuel_hiss: boolean;
  engine_hum: "normal" | "one_engine" | "steady" | "off";
  weather: Weather;
  fog: number;                    // FogExp2 density
  turbulence: number;             // resting camera shake 0 or 0.15
  static_level: 0 | 0.02 | 0.04;  // radio static gain (also used by the Tower via signal level)
  landing_lights: boolean;
  runway: "hidden" | "far" | "rolling" | "stopped";
  overhead_all_green: boolean;    // set by p1_outro
}
```

**Phase start worlds** (the server sets these when PLAYING(n) starts, and on retry/goto_phase):

| Field | LOBBY (before prologue) | Phase 1 start | Phase 2 start | Phase 3 start | After `landing` |
| --- | --- | --- | --- | --- | --- |
| light_rig | night_calm | night_alarm | fire | storm | dawn |
| alarm | false | true | false | false | false |
| warning_beep | false | false | false | false | false |
| pilot | awake, upright, seat in | slumped, seat in | slumped, seat back | slumped, seat back | awake, seat back |
| ap_screen | false | false | true | true | true |
| fire | none | none | {FIRE_SIDE, full} | {damaged side, wisp} | {damaged side, wisp} |
| propeller_stopped | null | null | null | damaged side | damaged side |
| fire_bell / fuel_hiss | false | false | true / true | false | false |
| engine_hum | normal | normal | normal | one_engine | off |
| weather | clouds_night | clouds_night | clouds_night | storm | clear_dawn |
| fog | 0.004 | 0.004 | 0.006 | 0.035 | 0.004 |
| turbulence | 0 | 0 | 0 | 0.15 | 0 |
| static_level | 0 | 0 | 0.02 | 0.04 | 0 |
| landing_lights | false | false | false | false | true |
| runway | hidden | hidden | hidden | hidden | stopped |
| overhead_all_green | false | false | true | true | true |

"Damaged side" = the `FIRE_SIDE` rolled in the last Phase 2 attempt (in demo or `goto_phase 3` without a Phase 2, roll it at Phase 3 start, or use the forced value).

**Station object resets.** When PLAYING(n) starts (first time or retry), every object on station n is reset to its `default` from `stations.json`, then phase variables are applied (e.g. the fire-side lamp). Objects on earlier stations keep their final states; the overhead lamps are all `green` steady after `p1_outro`.

## A12. Effect grammar (content `on_start` / `on_success` and the `fx` message)

Content files list effects as strings. The server executes server-side ones and forwards one-shots to clients in `fx` (role-filtered).

| Pattern | Executed by | Meaning |
| --- | --- | --- |
| `world:<key>=<value>` | server | Mutates `World` (`fire_level` is shorthand for `fire.level`, `seat_back`, `pilot_awake` for `pilot.*`). Booleans `true/false`, numbers as decimals, `null`. Sent as a new `flyer_view`. |
| `lamp:<OBJ>=<color\|off>` | server | Sets a lamp steady (`blinking false`, `attention false`). Sent as `object_state`. |
| `roll:<VAR>` | server | Rolls a phase variable now. |
| `show:<VAR>` | server | Applies the rolled option's `lamps` (steady). |
| `cin:<id>` / `event:<id>` | server | Starts an in-phase cinematic / event. When present in `on_success`, the `world:` and `lamp:` effects of the same list are applied at the cinematic's **end** (the timeline animates them). |
| `sfx:<name>` | flyer | Play a one-shot sound (`clunk`, `chime_soft`, `motor_whirr`, …). |
| `sfx_stop:<loop>` | flyer | Stop a loop now (`alarm_master`, `fire_bell`, `warning_beep`, `fuel_hiss`). Loops normally follow `World`; this just makes the stop immediate. |
| `fx:shake:<amount>:<seconds>` | flyer | `shakeFor(amount, seconds)`. |
| `fx:yaw:<left\|right>` | flyer | Camera roll 4° toward that side, ease back over 1.5 s. |
| `fx:pitch_dip` | flyer | Camera pitchOffset −3°, ease back over 2 s. |
| `fx:lamp_flicker:<OBJ>` | flyer | Flicker that lamp's emissive for 0.6 s. |
| `fx:flicker_stop` | flyer | Stop any panel flicker. |
| `fx:burst:<snuff\|foam>` | flyer | White puff on the burning wing. |
| `both:static_dip` | both | Radio static drops to 0 for 1.2 s, then returns. |
| `both:signal_flash` | both | Signal icon flashes full bars for 1.2 s. |
| `tower:<name>` | tower | Tower-only one-shot (reserved; none used in MVP content). |

Template tokens inside effects and object ids: `{FIRE_SIDE.lower}` → `left`/`right`, `{FIRE_SIDE.LR}` → `L`/`R`, `{DAMAGED_SIDE.lower}` likewise.

## A13. `dev_state` (Dev Mode only)

```ts
interface DevState { type: "dev_state";
  room: string; status: Status; phase: number; action_id: string | null; seed: number;
  vars: Record<string, string>;                // rolled values incl. phase vars
  forced: Record<string, string>;
  expected: { object: string; verb: Verb; value?: string; count?: number; done: boolean }[];
  unordered: boolean;
  pending: { object: string; count: number } | null;
  fuel_s: number;
  bots: { flyer: boolean; tower: boolean };
  exposure: Record<string /*player_id*/, { name: string; role: Role;
    concepts: Record<ConceptId, { heard: number; glossed: number; understood: number; spoken: number }> }>;
  last_utterance: null | { id: string; speaker_role: Role; transcript: string;
    matches: { start: number; end: number; concepts: ConceptId[]; side: "speaker" | "listener" }[];
    segments: Segment[]; latency_ms: number | null };
  latencies_ms: number[] }                      // last 20 release→subtitle latencies
```

## A14. Timing constants (both sides import the same numbers)

| Name | Value | Used for |
| --- | --- | --- |
| `PRESS_DEBOUNCE_MS` | 1200 | Press / notch counting window |
| `NEXT_ACTION_DELAY_MS` | 1500 | Gap after a success before the next action |
| `CINEMATIC_LEAD_MS` | 300 | `start_at_ms` lead |
| `FUEL_BROADCAST_MS` | 1000 | `game_state` heartbeat while draining |
| `WRONG_PENALTY_S` | 10 | Fuel lost per wrong action |
| `CROSSOVER_BONUS_S` | 5 | Fuel per crossover (once per concept per player) |
| `LOW_FUEL_S` | 20 | Low-fuel warnings |
| `RECONNECT_GRACE_S` | 60 | PAUSED timeout |
| `MIN_UTTERANCE_MS` | 300 | Shorter = discarded |
| `MAX_UTTERANCE_MS` | 12000 | Auto `ptt_end` |
| `PREROLL_MS` | 200 | Mic pre-roll |
| `FRAME_MS` | 100 | Audio frame (1,600 samples, 3,200 bytes) |
| `TRANSCRIBE_FINAL_TIMEOUT_MS` | 4000 | Wait for final transcript |
| `LIFELINE_WAIT_MS` | 3000 | Wait for a pending translation |
| `TRANSLATION_REVEAL_MS` | 6000 | Revealed translation stays open |
| `ECHO_MS` | 3000 | "You: …" echo |
| `BOT_DELAY_MS` | 2000 | Bot reaction delay |
| `GLOSS_THRESHOLD` | 2 (env) | Phase 2 gloss rule |
| `SUBTITLES_FLYER` / `SUBTITLES_TOWER` | 3 / 5 | Visible subtitle stack size |
| `LIFELINE_WINDOW` | 3 | Lifelines may target the partner's last 3 utterances |
| Fuel per phase | 150 / 150 / 180 s (demo 300) | |

## A15. Error codes

`bad_message`, `room_not_found`, `room_full`, `role_taken`, `not_joined`, `not_allowed_now` (wrong state for this intent), `not_your_role`, `channel_busy`, `mock_only` (`say_text` when not allowed), `lifeline_not_available` (not phase 3 / not partner's / outside the last 3), `no_lifelines`, `translation_failed` (lifeline not spent), `transcribe_failed`, `dev_disabled`, `demo_only`, `rate_limited`, `internal`.

Clients map each code to a localized toast (Frontend §F7). The server's `message` is English and for logs only.

## A16. Key sequences

**Game start**

```
both: join {name, role, lang, gender}, ready → server: room_state(can_start) → status PROLOGUE
server → both: game_state{status:PROLOGUE}, cinematic{prologue}
(28 s, demo 12 s, or double skip) → PHASE_INTRO(1): game_state, cinematic{p1_intro}, manual_card{null}
(1.2 s) → PLAYING(1): world = phase-1 start; flyer_view; game_state{fuel 150, draining}
→ activate P1_A1 (see below)
```

**Activating an action**

```
server: roll observe var (seeded) → set observed lamp {color, blinking:true, attention:true}
→ flyer: object_state(lamp), flyer_view{interactive:[current station ids]}, quick_replies
→ tower: manual_card{card}
→ both: game_state{action_index, action_id, action_active:true}
(if on_start has event:X → cinematic X first; action_active stays false until it ends; then lamp state)
```

**Talking (real mode)**

```
speaker: ptt_start → server: channel{busy_by:role} to both (or error channel_busy to speaker)
speaker: binary frames … → server → Transcribe; caption_partial → speaker
speaker: ptt_end → server waits final (≤4 s) → builds Utterance
→ listener: utterance{segments}   → speaker: utterance_echo
→ both: channel{busy_by:null}
background: Translate → stored on the utterance
```

**Talking (mock)**: `say_text{text}` → same from "builds Utterance" on, no channel lock.

**A correct action (press ×2)**

```
flyer: interact OH_BTN_BLUE press → server: object_state{button, bounce:false}; pending count 1
flyer: interact OH_BTN_BLUE press (within 1.2 s) → count 2
(1.2 s idle) → count == 2 → step done → last step →
→ both: action_result{success:true}  (tower gets row_index)
→ flyer: fx{…on_success one-shots}, object_state for lamp off, flyer_view{interactive:[]}
→ tower: (renders green check stamp on row_index)
(1.5 s, or after the in-phase cinematic) → activate next action, or PHASE_OUTRO when it was the last
```

**A wrong action**

```
flyer: interact OH_SW_3 toggle (expected OH_SW_1 → off)
→ flyer: object_state{OH_SW_3, unchanged state, bounce:true}
→ both: action_result{success:false, reason:"wrong_object", fuel_delta:-10}
        tower also gets used{label:"तीन नंबर स्विच", verb:"toggle", count:1}
→ tower: manual_card{card with last_wrong}
→ both: game_state{fuel_s −10}
```

**Crash / retry**

```
fuel hits 0 → status CRASH → both: crash{phase}, cinematic{crash}
both: retry → retry_votes → when both: PHASE_INTRO(n) (cinematic pN_intro with retry:true)
→ PLAYING(n) from action 1, full fuel, new rolls, lifelines reset to 3, exposure kept
```

**Lifeline (phase 3)**

```
listener: lifeline{utterance_id}
→ translation ready → decrement → that player: translation{text, lifelines_left}; both: game_state
→ pending → wait ≤3 s → same; Translate failed → error translation_failed (not decremented)
```

**Disconnect / rejoin**

```
socket closes mid-game → status PAUSED (paused_from = previous), fuel frozen, timers frozen
→ other player: room_state, game_state{PAUSED}, toast partner_left
same player joins with token within 60 s → previous state resumes
   (if a cinematic was running, it is completed instantly: end state applied, state advances)
60 s pass → game abandoned → room back to LOBBY, the absent slot freed, toast partner_gone
```

**End**

```
P3_C8 success → PHASE_OUTRO(3): cinematic{landing} → ENDING: cinematic{ending} (deck + Bedrock computed now)
→ DECK: each player: deck{report_pending:true|false}; deck_report later if Bedrock was slow
play_again ×2 → new seed, same roles → PROLOGUE        swap_roles ×2 → LOBBY with roles swapped, languages kept, not ready
```

## A17. Demo mode route (shared)

A room is a demo room when the server runs with `DEMO_MODE=1` or the room was created with `{"demo": true}`. Content lives in `content/demo.json` (exact content):

```json
{
  "fuel_s": 300,
  "route": {
    "1": ["P1_A1", "P1_A3", "P1_A7"],
    "2": ["P2_B1", "P2_B3"],
    "3": ["P3_C4", "P3_C5", "P3_C7", "P3_C8"]
  },
  "auto_phases": [2],
  "force": {
    "MASTER_COLOR": "RED",
    "FIRE_SIDE": "RIGHT",
    "STILL_BURNING": "YES",
    "WARN_COLOR": "RED"
  },
  "phase3_preset": {
    "objects": {
      "FP_LEVER_4": {"kind": "lever", "value": "down"},
      "FP_GEAR_LAMP_1": {"kind": "lamp", "color": "green", "blinking": false, "attention": false},
      "FP_GEAR_LAMP_2": {"kind": "lamp", "color": "green", "blinking": false, "attention": false},
      "FP_GEAR_LAMP_3": {"kind": "lamp", "color": "green", "blinking": false, "attention": false},
      "FP_FLAP_L": {"kind": "notch", "value": 2},
      "FP_FLAP_R": {"kind": "notch", "value": 1}
    }
  },
  "presenter_keys": {"N": "next_action", "P": "next_phase"}
}
```

- `prologue` and `ending` use their `demo_duration_ms`.
- `auto_phases: [2]` = Phase 2 is auto-played: the server turns both bots on for that phase only (their `say_text` lines show up as subtitles on both screens) and back off at `p2_outro`.
- `phase3_preset` makes the skipped C1–C3 look done (gear down, three green lamps, flaps set).
- Presenter keys work in demo rooms without the dev panel: `N` = complete the current action, `P` = jump to the current phase's outro.
- Coverage rules (validator) apply to the full game only.

### Demo run-of-show (3 minutes, both specs build toward this)

Setup: two laptops back to back on stage, real speech (`MOCK_SPEECH=0`), room created with `?demo=1`. Flyer = English speaker, Tower = Hindi speaker. Forced values make the run identical every time.

| Clock | Screen | Who says / does what |
| --- | --- | --- |
| 0:00 | Prologue (12 s): toy plane at night, pilot slumps, MAYDAY on the Tower radar, title "PHASE 1 — PILOT DOWN / SIGNAL STRONG" | Presenter: "The pilot passed out. One of them sees the cockpit, the other has the manual. They don't share a language." |
| 0:14 | P1_A1, master lamp blinking **red** | Tower: "Kaun si light jal rahi hai — laal ya neeli?" → Flyer sees *Kaun si [which] light jal rahi hai — laal [red] ya neeli [blue]?* → Flyer: "Red! The red one!" → Tower sees *Red [laal]! The red [laal] one!* → Tower: "Ek number button dabao — teen nahi!" → Flyer presses button 1. Alarm stops, cabin turns amber. |
| 0:36 | P1_A3 | Tower: "Teen number lever kheencho — chaar nahi!" → Flyer pulls handle 3 → `p1_seat`: pilot slides back snoring. |
| 0:48 | P1_A7 | Tower: "Chaar number switch band karo, phir ek number lever kheencho." → Flyer does both → `p1_outro`, "AUTOPILOT ENGAGED". |
| 1:01 | `p2_intro`: right engine explodes, "PHASE 2 — ENGINE FIRE / SIGNAL WEAK" | Presenter: "Now the signal weakens. Watch the brackets disappear for words they already know." Bots play B1 and B3 on screen. With the Phase 1 lines above, the Flyer sees *Daayan [right] laal [red] lever kheencho baayan [left] nahi!*: the new Phase 2 words keep their brackets, while *kheencho* and *nahi* (already glossed twice in Phase 1) have lost theirs. Exact output depends on what was actually said in Phase 1. |
| 1:31 | `p2_extinguish`, `p2_outro` into the storm | |
| 1:41 | `p3_intro`: "PHASE 3 — STORM LANDING / SIGNAL LOST", three lifeline dots | Presenter: "No translation at all now." |
| 1:51 | P3_C4 | Tower: "Peela switch chalu karo." → Flyer: "Yellow switch… on!" → runway reveal. |
| 2:06 | P3_C5, lightning, warning lamp **red** | Tower: "Kaun si light jal rahi hai — neeli ya laal?" → Flyer: "Laal!" (CROSSOVER! +5s toast) → Tower: "Teen number button dabao — ek nahi!" → Flyer taps the subtitle once to show the lifeline, then presses 3. |
| 2:26 | P3_C7 | Tower: "Ek number aur do number lever neeche karo." → touchdown, sparks. |
| 2:41 | P3_C8 | Tower: "Laal lever kheencho! Phir engine band karo!" → `landing` at dawn, pilot wakes, "?" |
| 2:51 | `ending` → word deck | Flyer's deck: "Your partner taught you N words", ▶ plays the Tower's real voice saying *laal*. |

**Demo safety nets:** if AWS speech fails on stage, create the room with `{"demo": true, "mock": true}` and use the type box; presenter key `N` completes a stuck action; `P` jumps to the next phase. Rehearse with the exact forced values above.

---

# Part F — Frontend

## F0. Design direction: 3D-first and cinematic

**Wingin' it! is a 3D, cinematic game first.** The Flyer's entire experience is a real-time 3D toy world: a first-person cockpit, a living sky outside the windows, and scripted camera cinematics between phases and inside them (the seat slide, the extinguisher, the runway reveal, the touchdown). The Tower's screen is 2D, but it is staged the same way: stamps, page turns, screen shakes and title cards land on the same server-clock beats as the Flyer's cinematics. Everything in Part F serves that. When a choice trades fidelity against simplicity, keep the game playable first (build spec rule 7), then spend the effort on what the camera sees.

**Quality bar:** every frame the camera lands on should look like a still from a toy commercial: chunky, saturated, softly glowing, readable. On stage, the audience watches the Flyer's screen.

### F0.1 Art direction pillars

1. **Toy, not sim.** Thick rounded primitives (drei `RoundedBox`, capsules, spheres), bevels everywhere, a thin dark outline on controls, matte plastic (roughness 0.55, metalness 0). No realistic textures, no greebles. Original design: don't copy any existing game's art or characters.
2. **Light tells the story.** Each phase has one color script (§F0.2). Lamps and fire are the brightest things in frame and they bloom; everything else stays below the bloom threshold.
3. **Depth in every shot.** Foreground (the cockpit frame or yoke edge), midground (the panel or wing), background (sky, clouds, runway). Never a flat, dead-on shot of a wall.
4. **Motivated motion.** The camera moves only for a reason (a sound, an event, a question). It arrives and **holds 0.6–1.0 s** before moving again. Comedy comes from springy object motion, not from camera chaos.
5. **Readable at a glance.** The current station fills most of the frame, lit lamps are clearly lit and dark ones clearly dark, and the subtitles never cover the controls. Nothing in the cockpit marks which control the Tower is asking about; the players have to figure that out by talking.

### F0.2 Color script per phase

| Moment | Mood | Key light | Accent / glow | Sky | Fog |
| --- | --- | --- | --- | --- | --- |
| Prologue → P1 until A1 | tense, but toy | warm cabin #FFD8A8 (0.6) | red alarm pulse #FF3B3B, 1.2 Hz | navy #0B1026 → #2A3A6A, moon #F2F4FF | 0.004, #1a2140 |
| P1 after A1 | relief, night calm | moonlight #9FB4FF (0.6) | amber #FFB347 (0.8) | same, stars bright | 0.004 |
| P2 | emergency | `night_calm` base | fire orange #FF7A1A rim through the fire-side window, smoke grey, slow red pulse 0.5 Hz | clouds darken toward the outro | 0.006 |
| P3 | storm, low visibility | dark-blue hemisphere (0.3) | lightning #DFE8FF spikes to 6, warm landing cones #FFE7B0 after C4 | #0A0F1A → #1E2633 | 0.035 → 0.012 after C4 |
| Landing / ending | triumph, sunrise | low sun #FFB36B (1.2) | runway lights #FFF4D6 fading | peach #FFB36B → pale blue #A8D8FF | 0.004 |

Palette for objects: §8.1 of the build spec (repeated in `stations.json`). Tower desk and manual colors: §F12.

### F0.3 Shot composition rules

- **Station shots** (`OVERHEAD`, `PEDESTAL`, `FRONT`): the station fills 60–75% of the frame at a slight three-quarter angle, never square-on. The rows the current phase uses sit in the upper 70% of the frame, above the subtitle stack. Digit labels must render at ≥ 18 px on screen at 1440 × 900.
- **Window shots** (`LEFT_WINDOW` / `RIGHT_WINDOW`): the wing runs as a diagonal through the lower third; the burning nacelle sits near a rule-of-thirds point; the window frame is visible as foreground.
- **Interior wides** (`WIDE_INTERIOR`, `PILOT`): both seats or the pilot's face readable; the pilot's mustache and the "Zzz" silhouette against the windshield.
- **Exterior shots** (`EXT_*`): the plane on a thirds line, flying *into* open frame space; the chase cam slightly low; clouds passing in the foreground for parallax.
- **No clipping:** the camera never intersects geometry (near plane 0.03). Check every shot in the scene sandbox (§F18.5).
- **Roll:** ≤ 8° except the crash spiral.

### F0.4 Motion language

| Thing | Easing / timing |
| --- | --- |
| Camera moves | `moveTo` with `power2.inOut`; whips 0.5 s `power3.inOut`; then hold ≥ 0.6 s |
| Shake | noise-based (§F10.1), 0.03 m × amount; never stacked above 1.0 |
| Controls | buttons 80/120 ms; switches `back.out(2)`; handles `power2.out`; bounces `elastic.out(1, 0.4)` |
| Comedy beats | the seat slide `elastic.out(1, 0.5)`, the "Zzz" float, the pilot's "?" pop `back.out` |
| Lamps | when a lamp lights: scale 1.15 → 1 over 150 ms (squash), emissive ramps 80 ms |
| Title cards | slide in 0.4 s `power3.out`, hold ≥ 1.2 s, fade 0.4 s |
| 2D UI | 150–250 ms, `power2.out`; stamps slam `power4.in` 180 ms |

### F0.5 Hero beats

Each cinematic has one hero beat. Hit it at the spec time with the **flash + sound + shake triple** (whichever of the three apply), then hold at least 1 s so it reads:

| Cinematic | Hero beat |
| --- | --- |
| `prologue` | 3.5 s lift-off; 15.5 s the pilot slumps onto the yoke (roll dip, alarm at 16); 21.5–25 the dolly-in into the Flyer's eyes |
| `p1_seat` | the seat slides back with the elastic bounce |
| `p1_outro` | the overhead lamps going green in sequence, then the clouds parting to the moon |
| `p2_intro` | 0.8 s, the engine explodes: white flash 60 ms + `boom` + fireball + shake 1.0 |
| `p2_extinguish` | the foam burst swallowing the flames |
| `p2_outro` | the plane sinking into black storm clouds with distant lightning |
| `p3_intro` | 2.0 s, the lightning double flash with thunder 0.8 s later |
| `p3_runway_reveal` | the fog thinning and the runway edge lights appearing far ahead |
| `p3_touchdown` | 2.0 s, the wheels hit: bump + screech + sparks + shake |
| `landing` | the cut to `EXT_FRONT_LOW` at sunrise |
| `ending` | "YOU LANDED!" over the dawn orbit |
| `crash` | the cartoon POOF |

### F0.6 Visual acceptance set

Before M3 counts as done (§F23), capture and review these frames at 1440 × 900 (via `e2e/visual.spec.ts` or the Playwright MCP browser, §F18.5):

1. Each station shot in its own phase lighting: `OVERHEAD`/`night_alarm` with the master lamp blinking red, `PEDESTAL`/`fire`, `FRONT`/`storm` with rain.
2. `RIGHT_WINDOW` and `LEFT_WINDOW` with the wing fire at `full`, `half` and `wisp`.
3. `EXT_SIDE`, `EXT_CHASE`, `EXT_FRONT_LOW` (with the dawn sky for the last one).
4. The hero beat of every cinematic in §F0.5, plus the end frame of every cinematic.
5. The Tower screen in each phase: the manual open, the MAYDAY / LANDED stamps, the phase 2 EMERGENCY stamp, a wrong-action "Flyer used" slip.
6. Both language pairings: the Tower screen in English (manual, callouts, rule table) and the Flyer HUD in Hindi (title cards, quick replies, toasts).
7. The home page, and character select with each of the four characters (Flyer male/female, Tower male/female) previewed; `WIDE_INTERIOR` in the prologue and the landing with each Flyer character.

Check each frame against: the §F0.2 color script, the §F0.3 composition rules, no clipping, glowing lamps clearly lit or clearly dark, labels readable, subtitles not covering controls, no console errors, and ≥ 45 fps in the sandbox on the dev machine.

## F1. Principles

1. **Render the server.** Every visual state comes from a server message: `game_state`, `flyer_view`, `object_state`, `manual_card`, `cinematic`, `utterance`, and so on. The only client-side "prediction" is the optimistic control motion (§F9.6), which springs back unless the server confirms it.
2. **One bundle, two roles.** `/r/:code` renders the Lobby, then the `FlyerScreen` or the `TowerScreen` by role, then the `WordDeck`. The Tower never mounts the **cockpit** canvas. It may mount only content-free exterior canvases: the Lobby/home background and the **tower window** (§F12.7), which contain no cockpit, controls or Flyer data.
3. **Language of the viewer.** All chrome text comes from `strings.ts` in the viewer's `lang`. All Devanagari renders in the DOM (troika `Text` in 3D can't shape Devanagari), and 3D labels are only digits and arrows.
4. **Latin subtitles, one chip style.** Subtitles render the server's segments exactly. Never style a chip by its concept.
5. **Toy, not scary.** Saturated colors, rounded shapes, bouncy eases, a cartoon "POOF".
6. **3D and cinematic first.** The camera and the light do the storytelling (§F0). Every 3D or cinematic change is checked visually, never just type-checked.
7. **Mock first.** With `welcome.mock_speech = true` the push-to-talk becomes a text box, and quick-say buttons and quick replies appear. The whole game is finishable in `/dev/split` with no microphone.

## F2. Stack, packages and build config

| Concern | Package | Notes |
| --- | --- | --- |
| Build | `vite` ^6, `typescript` ^5.6, `@vitejs/plugin-react` | `npm create vite@latest client -- --template react-ts` |
| UI | `react` ^19, `react-dom` ^19, `react-router` ^7 | R3F v9 needs React 19 |
| 3D | `three` (latest r17x), `@react-three/fiber` ^9, `@react-three/drei` ^10, `@react-three/postprocessing` ^3, `postprocessing` ^6 | Use the latest mutually compatible stable versions |
| State | `zustand` ^5 | one store |
| Animation | `gsap` ^3.12 | cinematics, UI tweens |
| CSS | `tailwindcss` ^4 + `@tailwindcss/vite` | Tower, HUD, lobby, deck |
| Fonts | `@fontsource/baloo-2` (latin + devanagari, 400/600/800), `@fontsource/kalam` (latin + devanagari, 400/700) | self-hosted, so the game works offline |
| 3D font | `public/fonts/Baloo2-Bold.ttf` | for drei `Text` (digits, arrows, "Zzz", "?") |
| QR | `qrcode.react` ^4 | lobby |
| Tests | `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test` | |

**`vite.config.ts`**

```ts
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: { alias: { "@content": process.env.CONTENT_DIR ?? path.resolve(__dirname, "../content") } },
  server: {
    fs: { allow: [".."] },
    proxy: {
      "/api":   { target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000", changeOrigin: true },
      "/clips": { target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000", changeOrigin: true },
      "/ws":    { target: (process.env.VITE_PROXY_TARGET ?? "http://localhost:8000").replace("http", "ws"), ws: true },
    },
  },
});
```

In docker compose the content folder is mounted at `/content`, so set `CONTENT_DIR=/content` there.

**`package.json` scripts:** `dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck` (`tsc -b --noEmit`), `test` (`vitest run`), `e2e` (`playwright test`), `lint`.

**Env:** `VITE_WS_URL`, `VITE_API_URL`, `VITE_DEV_MODE` (§A3). `config.ts` exports `WS_BASE = VITE_WS_URL || (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws"` and `API_BASE = VITE_API_URL || ""`.

**Browser target:** desktop Chrome (latest two versions) for the Flyer. The Tower should work on a laptop in Chrome, Edge, Firefox or Safari; a tablet is a bonus. WebGL2 and AudioWorklet are required (§F20).

## F3. Client layout

```
client/
  index.html                       # <div id="root">, theme-color, preload Baloo 2
  public/fonts/Baloo2-Bold.ttf
  src/
    main.tsx                       # fonts import, router, <App/>
    App.tsx                        # routes: "/", "/r/:code", "/dev/split"
    config.ts                      # WS_BASE, API_BASE, DEV
    content/stations.ts            # typed import of @content/stations.json + grid helpers
    content/cinematics.ts          # typed import of @content/cinematics.json
    net/protocol.ts                # TS types: a verbatim copy of §A6–A8
    net/socket.ts                  # connect/reconnect, handshake, send helpers, binary
    net/clock.ts                   # offset estimate, serverNow()
    net/api.ts                     # POST /api/rooms, GET /api/rooms/:code
    state/store.ts                 # zustand store + message reducer
    state/selectors.ts
    i18n/strings.ts                # every UI string, en + hi
    i18n/useT.ts                   # t(key, params) for the viewer's language
    audio/mic.ts                   # getUserMedia, worklet graph, pre-roll, level meter
    audio/pcm-worklet.js           # 48k Float32 -> 16k Int16 LE, 100 ms chunks
    audio/ptt.ts                   # push-to-talk controller (Space + button)
    audio/sfx.ts                   # procedural sound engine, buses, recipes
    audio/useWorldAudio.ts         # maps World / game_state to loops
    scene/CockpitCanvas.tsx        # <Canvas>, camera, lights, postprocessing, scene graph
    scene/Cockpit.tsx              # shell, seats, yokes, windows, glare shield, wings
    scene/StationGroup.tsx         # maps stations.json grid -> 3D positions on a panel face
    scene/stations/Overhead.tsx
    scene/stations/Pedestal.tsx
    scene/stations/FrontPanel.tsx
    scene/parts/PushButton.tsx
    scene/parts/ToggleSwitch.tsx
    scene/parts/PullHandle.tsx
    scene/parts/UpDownLever.tsx
    scene/parts/NotchLever.tsx
    scene/parts/Lamp.tsx
    scene/parts/FuelGauge.tsx
    scene/parts/Screen.tsx
    scene/parts/useInteractive.ts  # hover, cursor, click -> interact, optimistic motion, bounce
    scene/env/Sky.tsx              # gradient dome, stars, moon, sunrise
    scene/env/Clouds.tsx           # instanced toy cloud puffs, scrolling
    scene/env/Weather.tsx          # rain, windshield droplets, lightning light, fog
    scene/env/WingFire.tsx         # fire + smoke particles, foam/snuff bursts
    scene/env/Runway.tsx
    scene/env/ExteriorPlane.tsx
    scene/env/Wings.tsx            # cockpit-visible wings + nacelles + propellers
    scene/characters/Pilot.tsx
    scene/characters/FlyerAvatar.tsx  # the Flyer's character in the right seat (male / female)
    scene/characters/FirstPersonHands.tsx
    scene/LightRig.tsx             # the 5 rigs, tweened
    scene/Effects.tsx              # Bloom + Vignette
    scene/sceneRefs.ts             # refs registry used by cinematics
    cinematics/cameraRig.ts        # shots, rig state, helpers
    cinematics/runner.ts           # useCinematicRunner: sync, seek, skip
    cinematics/timelines.ts        # Flyer timelines, one per cinematic id
    cinematics/towerTimelines.ts   # Tower 2D timelines
    ui/Home.tsx                    # the home page (start / join / how to play)
    ui/HowToPlay.tsx
    ui/CharacterSelect.tsx         # role + gender + name + language, with a live avatar preview
    ui/avatars/FlyerPortrait.tsx   # 2D SVG portrait, male / female
    ui/avatars/TowerPortrait.tsx   # 2D SVG portrait with headset, male / female
    ui/avatars/AvatarPreview.tsx   # lobby preview (3D turntable for the Flyer, animated portrait for the Tower)
    ui/Lobby.tsx
    ui/MicCheck.tsx
    ui/FlyerScreen.tsx             # canvas + HUD
    ui/FlyerHUD.tsx
    ui/TowerScreen.tsx
    ui/Radar.tsx
    ui/ManualCard.tsx              # the two-page spread
    ui/manual/PanelDrawing.tsx     # SVG ink drawing from stations.json
    ui/manual/ControlDrawing.tsx   # small ink control in its target state
    ui/manual/FindOut.tsx
    ui/manual/RuleTable.tsx
    ui/manual/ManualCover.tsx
    ui/Checklist.tsx               # progress dots + phase tabs (the manual's checklist)
    ui/Subtitles.tsx               # stack + SubtitleLine + KeywordChip
    ui/PTTIndicator.tsx
    ui/MockTalkBox.tsx
    ui/QuickReplies.tsx
    ui/Lifelines.tsx
    ui/TitleCard.tsx
    ui/Toasts.tsx
    ui/Overlays.tsx                # flash, red vignette pulse, paused, reconnecting, crash/retry, skip
    ui/WordDeck.tsx
    ui/Settings.tsx                # volume + mute
    ui/DevPanel.tsx
    ui/DevSplit.tsx
    ui/DevScene.tsx                # /dev/scene: the Flyer scene from a fixture World, no server
    ui/DevCinematic.tsx            # /dev/cinematic: scrub any Flyer/Tower timeline
    ui/PresenterKeys.tsx
    ui/hotkeys.ts
    dev/fixtures.ts                # fixture Worlds, object states and cinematic params
    dev/debugHooks.ts              # window.__wingin (dev only), used by Playwright
  tests/ (vitest) and e2e/ (playwright)
```

## F4. Routes and URL parameters

| Route | Screen |
| --- | --- |
| `/` | **Home page**: WINGIN' IT! logo over a looping `EXT_CHASE` shot of the toy plane; **Start a game**, **Join a game**, **How to play** (§F8.1). |
| `/r/:code` | The room. Status `LOBBY` → Lobby; game statuses → Flyer or Tower screen; `DECK` → Word deck. |
| `/dev/split` | Dev only (`VITE_DEV_MODE=1`): two iframes, Tower left, Flyer right. |
| `/dev/scene` | Dev only: the Flyer 3D scene rendered from a fixture `World`, no server (§F18.5). |
| `/dev/cinematic` | Dev only: any Flyer or Tower timeline, paused at a time or playing, with a scrubber (§F18.5). |

Query parameters on `/r/:code` (all optional):

| Param | Effect |
| --- | --- |
| `role=flyer\|tower`, `lang=en\|hi`, `gender=male\|female`, `name=…` | Prefill character select. |
| `auto=1` | Join and ready automatically (needs role, lang, name). Used by split view. |
| `seed=42` | Passed to `POST /api/rooms` (Dev) and to `dev set_seed` on join. |
| `demo=1` | Create the room as a demo room. |
| `mock=1` | Create the room with mock speech (Dev/Demo servers only). |
| `bots=tower\|flyer\|both` | Dev: send `dev bots` after joining. |
| `orbit=1` | Dev: OrbitControls for looking around the cockpit (never in production builds). |

`/dev/split?room=TEST&seed=42&demo=0&bots=` renders:

- left: `/r/TEST?role=tower&lang=hi&gender=male&name=Tower&auto=1&seed=42`
- right: `/r/TEST?role=flyer&lang=en&gender=female&name=Flyer&auto=1`

(`auto=1` without `gender` defaults to `male` for the Tower and `female` for the Flyer. The toolbar has a gender toggle per side.)

Each iframe has `allow="microphone; autoplay"`. A thin toolbar above them shows the room code, seed, a "new room" button (random code), language-swap and bots toggles.

## F5. Networking (`net/`)

### F5.1 `socket.ts`

```ts
export function connect(code: string): Socket            // one per tab
interface Socket {
  send(msg: C2S): void;                                   // JSON text frame
  sendAudio(chunk: ArrayBuffer): void;                    // binary frame (only while holding the channel)
  close(): void;
}
```

- On open: wait for `welcome` (→ store), then run 5 pings 100 ms apart (`clock.ts` keeps the best-RTT offset, §A5), then send `join` (from the form, or from `auto=1` params) with the token from `sessionStorage["wingin:token:{CODE}:{role}"]` if present.
- On `joined`: store `player_id`, `role`, `lang`, and save the token under the role it returns (re-key on swap).
- On close: if not intentional, show the "Reconnecting…" overlay and retry with backoff 0.5, 1, 2, 4, then 5 s forever. On reopen, redo the handshake with the token (the server sends the rejoin snapshot).
- Every 30 s: 3 more pings, keep the best offset.
- All incoming messages go to `store.getState().receive(msg)`. Unknown types are logged and ignored.
- `send()` while disconnected: drop intents (interact, lifeline, skip …) and show nothing; the UI is disabled anyway via the reconnect overlay.

### F5.2 `clock.ts`

```ts
let offset = 0, bestRtt = Infinity;
export function onPong(p: Pong) { const now = Date.now(); const rtt = now - p.client_ms;
  if (rtt < bestRtt) { bestRtt = rtt; offset = p.server_ms + rtt / 2 - now; } }
export const serverNow = () => Date.now() + offset;
```

### F5.3 `api.ts`

- `createRoom({demo, seed, mock})` → `POST {API_BASE}/api/rooms` → `{code}` → navigate to `/r/{code}` (and copy the share link).
- `getRoom(code)` → for the join form (exists, roles taken). A 404 shows "Room not found".

## F6. State store (`state/store.ts`)

One zustand store. `receive(msg)` is a pure-ish reducer per message type plus side effects (sfx, toasts) dispatched through small subscriber hooks, so the reducer stays testable.

```ts
interface Store {
  // connection
  conn: "connecting" | "open" | "reconnecting";
  welcome: Welcome | null;            // mock_speech, dev_mode, demo, gloss_threshold
  me: { id: string; role: Role; lang: Lang; name: string } | null;
  room: RoomState | null;
  // game
  game: GameState | null;
  flyer: { station: StationId | null; interactive: Set<string>; objects: Record<string, ObjectState>;
           world: World | null; quickReplies: QuickLine[] | null } ;
  card: ManualCard | null;
  lastResult: (ActionResult & { at: number }) | null;   // drives feedback pulses
  successStamp: { action_id: string; row_index: number } | null;
  cinematic: (CinematicMsg & { skipped: boolean }) | null;
  skipVotes: Role[]; retryVotes: Role[]; crashed: boolean;
  channel: Role | null;
  // talk
  partial: string | null;             // my live caption
  echo: { text: string; at: number } | null;
  subtitles: SubtitleItem[];          // partner utterances, newest last, keep 10
  // phase 3
  translations: Record<string, { text: string; openedAt: number; pending: boolean }>;
  // end
  deck: DeckMsg | null;
  // misc
  toasts: ToastItem[];
  fx: { id: number; effects: string[] }[];   // queue consumed by the scene / Tower
  dev: DevState | null;
  settings: { volume: number; muted: boolean; sendDevanagari: boolean; showDevPanel: boolean };
  mic: { permission: "unknown" | "granted" | "denied"; level: number; transmitting: boolean };
  receive(msg: S2C): void;
}
interface SubtitleItem { id: string; segments: Segment[]; speaker_role: Role; speaker_name: string;
  level: number; lifeline_available: boolean; at: number }
```

Reducer notes:

- `flyer_view` replaces `flyer` wholesale. `object_state` updates one object. If `bounce` is true, it also triggers that part's spring-back (`bounceTick[object_id]++`).
- `manual_card` sets `card` (null shows the cover). When `card.action_id` changes, trigger the page-turn.
- `action_result`: set `lastResult` (feedback, §F15). On success with `row_index`, set `successStamp`.
- `utterance` appends to `subtitles` (keep the last 10). `translation` sets `translations[id]` with `openedAt = now`. `history` replaces `subtitles` on rejoin.
- `caption_partial` sets `partial`; `utterance_echo` sets `echo` and clears `partial`; `utterance_dropped` clears `partial` and toasts.
- `cinematic` sets `cinematic` and clears `skipVotes`; `cinematic_skip` sets `skipped`; `skip_votes` sets `skipVotes`.
- `crash` → `crashed = true`; a `game_state` with status ≠ CRASH → `crashed = false`, `retryVotes = []`.
- `error` → toast through the code map (§F7.3).
- `settings` persist in `localStorage["wingin:settings"]`.

## F7. UI strings (`i18n/strings.ts`)

Every UI string lives here with `en` and `hi`. A unit test fails if any key is missing a language. `t(key, params, gender?)` interpolates `{name}` placeholders. **Hindi is gendered:** a value may be `{m, f}` instead of a string, and `t` picks it by the gender of the person the string is about (yourself for `ptt.transmitting`, the speaker for `ptt.busy_*`, your partner for `toast.partner_*`). The gendered keys are marked *(m / f)* below; English never varies. Numbers stay as ASCII digits in both languages.

### F7.1 Chrome strings

| Key | en | hi |
| --- | --- | --- |
| `app.tagline` | A translator designed to make itself unnecessary. | एक अनुवादक, जो खुद को गैरज़रूरी बनाने के लिए बना है। |
| `landing.create` | Create room | रूम बनाओ |
| `landing.join` | Join with code | कोड से जुड़ो |
| `landing.code_placeholder` | ABCD | ABCD |
| `landing.not_found` | Room not found | रूम नहीं मिला |
| `home.start` | Start a game | खेल शुरू करो |
| `home.join` | Join a game | खेल से जुड़ो |
| `home.how` | How to play | कैसे खेलें |
| `home.how_1` | One of you flies. One of you has the manual. | एक उड़ाएगा, एक के पास मैनुअल है। |
| `home.how_2` | Talk over the radio in your own language. | रेडियो पर अपनी भाषा में बात करो। |
| `home.how_3` | The translator fades. Learn each other's words and land the plane! | अनुवाद धीरे-धीरे गायब होगा। एक-दूसरे के शब्द सीखो और विमान उतारो! |
| `home.back` | Back | वापस |
| `char.title` | Choose your character | अपना किरदार चुनो |
| `char.gender` | Character | किरदार |
| `char.male` | Male | पुरुष |
| `char.female` | Female | महिला |
| `char.flyer_caption` | The passenger who has to fly the plane | वह यात्री जिसे विमान उड़ाना है |
| `char.tower_caption` *(m / f, the selected character)* | The air-traffic controller with the manual | m: मैनुअल वाला एयर-ट्रैफ़िक कंट्रोलर · f: मैनुअल वाली एयर-ट्रैफ़िक कंट्रोलर |
| `char.pick_all` | Pick a role, a character and a language | भूमिका, किरदार और भाषा चुनो |
| `lobby.room_code` | Room code | रूम कोड |
| `lobby.share` | Share this link | यह लिंक भेजो |
| `lobby.copy` | Copy | कॉपी करो |
| `lobby.copied` | Copied! | कॉपी हो गया! |
| `lobby.name` | Your name | आपका नाम |
| `lobby.role` | Your role | आपकी भूमिका |
| `lobby.flyer` | Flyer | फ़्लायर |
| `lobby.flyer_desc` | You're in the cockpit | आप कॉकपिट में हैं |
| `lobby.tower` | Tower | टावर |
| `lobby.tower_desc` | You have the manual | आपके पास मैनुअल है |
| `lobby.taken` | Taken | पहले से लिया गया |
| `lobby.language` | Your language | आपकी भाषा |
| `lobby.lang_en` | English | English |
| `lobby.lang_hi` | हिन्दी | हिन्दी |
| `lobby.join` | Join | जुड़ो |
| `lobby.ready` | Ready | तैयार |
| `lobby.unready` | Not ready | तैयार नहीं |
| `lobby.waiting_partner` | Waiting for your partner… | साथी का इंतज़ार… |
| `lobby.block_missing` | Waiting for the other role to join | दूसरी भूमिका के जुड़ने का इंतज़ार |
| `lobby.block_same_language` | You both picked the same language. Pick different languages to start. | दोनों ने एक ही भाषा चुनी है। शुरू करने के लिए अलग-अलग भाषा चुनो। |
| `lobby.block_not_ready` | Waiting for both players to press Ready | दोनों खिलाड़ियों के तैयार होने का इंतज़ार |
| `lobby.tip` | Sit back to back. No peeking at each other's screens. | पीठ से पीठ लगाकर बैठो। एक-दूसरे की स्क्रीन मत देखना। |
| `lobby.mic_allow` | Allow microphone | माइक्रोफ़ोन चालू करने दो |
| `lobby.mic_test` | Say something to test your mic | माइक जाँचने के लिए कुछ बोलो |
| `lobby.mic_denied` | Microphone blocked. Allow it in the address bar, then reload. | माइक्रोफ़ोन बंद है। एड्रेस बार में अनुमति दो, फिर पेज रीलोड करो। |
| `lobby.mic_ok` | Mic works! | माइक चल रहा है! |
| `lobby.mock_note` | Typing mode: no microphone needed. | टाइपिंग मोड: माइक्रोफ़ोन की ज़रूरत नहीं। |
| `lobby.demo_badge` | DEMO | डेमो |
| `phase.1` | Pilot Down | पायलट बेहोश |
| `phase.2` | Engine Fire | इंजन में आग |
| `phase.3` | Storm Landing | तूफ़ान में लैंडिंग |
| `title.phase` | PHASE {n} — {name} | चरण {n} — {name} |
| `signal.label` | SIGNAL | सिग्नल |
| `signal.1` | STRONG | तेज़ |
| `signal.2` | WEAK | कमज़ोर |
| `signal.3` | LOST | गायब |
| `title.signal` | SIGNAL: {level} | सिग्नल: {level} |
| `hud.fuel` | FUEL | ईंधन |
| `hud.seconds` | {n}s | {n} सेकंड |
| `ptt.idle` | Hold SPACE to talk | बोलने के लिए SPACE दबाकर रखो |
| `ptt.transmitting` *(m / f, self)* | Transmitting… | m: बोल रहे हो… · f: बोल रही हो… |
| `ptt.busy_flyer` *(m / f, Flyer)* | Flyer is talking | m: फ़्लायर बोल रहा है · f: फ़्लायर बोल रही है |
| `ptt.busy_tower` *(m / f, Tower)* | Tower is talking | m: टावर बोल रहा है · f: टावर बोल रही है |
| `ptt.button` | Hold to talk | दबाकर बोलो |
| `mock.placeholder` | Type what you'd say, press Enter | जो बोलना है लिखो, Enter दबाओ |
| `mock.send` | Send | भेजो |
| `sub.tag_flyer` | FLYER | फ़्लायर |
| `sub.tag_tower` | TOWER | टावर |
| `sub.you` | You: | आप: |
| `lifeline.hint` | Tap a subtitle to decode it | अनुवाद देखने के लिए सबटाइटल पर टैप करो |
| `lifeline.show` | show | दिखाओ |
| `lifeline.decoding` | Decoding… | अनुवाद हो रहा है… |
| `cin.skip` | Skip | छोड़ो |
| `cin.time_skip` | 1.5 hours later | 1.5 घंटे बाद |
| `cin.take_control_flyer` | The pilot is out cold. You have to fly the plane! | पायलट बेहोश है। अब विमान तुम्हें उड़ाना है! |
| `cin.take_control_tower` | The pilot is out cold. Guide the passenger down! | पायलट बेहोश है। यात्री को सही-सलामत उतरवाओ! |
| `cin.skip_waiting` | Waiting for your partner to skip | साथी के छोड़ने का इंतज़ार |
| `crash.title` | OUT OF FUEL | ईंधन ख़त्म |
| `crash.retry` | Retry | फिर से कोशिश करो |
| `crash.waiting` | Waiting for your partner… | साथी का इंतज़ार… |
| `end.landed` | YOU LANDED! | लैंडिंग सफल! |
| `end.fuel_left` | Fuel left: {n}s | बचा ईंधन: {n} सेकंड |
| `end.total_time` | Total time: {t} | कुल समय: {t} |
| `tower.flyer_used` | Flyer used: {control} | फ़्लायर ने छुआ: {control} |
| `tower.autopilot` | AUTOPILOT ENGAGED | ऑटोपायलट चालू |
| `tower.mayday` | MAYDAY | MAYDAY |
| `tower.engine_fire` | ENGINE FIRE | इंजन में आग |
| `tower.landed` | LANDED | लैंड हो गया |
| `manual.cover_title` | FLIGHT MANUAL | उड़ान मैनुअल |
| `manual.step` | Step {i} / {n} | कदम {i} / {n} |
| `manual.find_out` | Find out | पता करो |
| `manual.rule` | Rule | नियम |
| `manual.col_if` | If it is | अगर यह है |
| `manual.col_do` | Have the Flyer do | फ़्लायर से करवाओ |
| `manual.col_control` | Control | कंट्रोल |
| `manual.do_only` | Have them do | करवाओ |
| `manual.last_try` | Last try: | पिछली बार: |
| `manual.then_grid` | then follow the grid | फिर तालिका देखो |
| `manual.instruction_do` | Have the Flyer do this: | फ़्लायर से यह करवाओ: |
| `manual.emergency` | EMERGENCY | आपातकाल |
| `manual.order_then` | in this order | इसी क्रम में |
| `manual.order_any` | any order | कोई भी क्रम |
| `deck.header` | Your partner taught you {n} words | आपके साथी ने आपको {n} शब्द सिखाए |
| `deck.still_learning` | Still learning | अभी सीख रहे हैं |
| `deck.understood` | ✓ Understood ×{n} | ✓ समझा ×{n} |
| `deck.said_it` | ★ You said it | ★ आपने बोला |
| `deck.report_loading` | Writing your mission report… | आपकी मिशन रिपोर्ट लिखी जा रही है… |
| `deck.stats` | Mission stats | मिशन के आँकड़े |
| `deck.stat_fuel` | Fuel left, phase {n} | बचा ईंधन, चरण {n} |
| `deck.stat_wrong` | Wrong actions | गलत कदम |
| `deck.stat_lifelines` | Lifelines used | इस्तेमाल हुई लाइफ़लाइन |
| `deck.stat_time` | Total time | कुल समय |
| `deck.play_again` | Play again | फिर से खेलो |
| `deck.swap_roles` | Swap roles | भूमिका बदलो |
| `deck.waiting_vote` | Waiting for your partner… | साथी का इंतज़ार… |
| `settings.volume` | Volume | आवाज़ |
| `settings.mute` | Mute | आवाज़ बंद |
| `overlay.paused` | Your partner disconnected. Waiting up to 60 s… | साथी का कनेक्शन टूट गया। 60 सेकंड तक इंतज़ार… |
| `overlay.reconnecting` | Reconnecting… | दोबारा जुड़ रहे हैं… |
| `overlay.enable_sound` | Click to enable sound | आवाज़ के लिए क्लिक करो |
| `overlay.unsupported` | This browser can't run Wingin' it! Please use the latest Chrome. | यह ब्राउज़र Wingin' it! नहीं चला सकता। कृपया नया Chrome इस्तेमाल करो। |

### F7.2 Toast strings (keys from `ToastKey`, §A8)

| Key | en | hi |
| --- | --- | --- |
| `toast.crossover` | CROSSOVER! +5s | क्रॉसओवर! +5 सेकंड |
| `toast.partner_left` | Partner disconnected. Waiting… | साथी का कनेक्शन टूट गया। इंतज़ार… |
| `toast.partner_back` *(m / f, partner)* | Partner is back! | m: साथी वापस आ गया! · f: साथी वापस आ गई! |
| `toast.partner_gone` *(m / f, partner)* | Partner left the game. | m: साथी खेल छोड़ गया। · f: साथी खेल छोड़ गई। |
| `toast.didnt_catch` | Didn't catch that, try again | समझ नहीं आया, फिर से बोलो |
| `toast.channel_busy` | Wait — your partner is talking | रुको — साथी बोल रहा है |
| `toast.translation_failed` | Couldn't decode that one. Lifeline not used. | इसका अनुवाद नहीं हो पाया। लाइफ़लाइन बची है। |
| `toast.no_lifelines` | No lifelines left | कोई लाइफ़लाइन नहीं बची |
| `toast.info` | {text} | {text} |

### F7.3 Error code → toast

`channel_busy` → `toast.channel_busy`; `no_lifelines` → `toast.no_lifelines`; `translation_failed` → `toast.translation_failed`; `transcribe_failed` → `toast.didnt_catch`; `room_not_found` → `landing.not_found` (navigate to `/`); `role_taken` → mark the role card taken; `lifeline_not_available` → silent (UI shouldn't allow it); `rate_limited`, `not_allowed_now`, `bad_message`, `internal` → console only (and a `toast.info` in Dev Mode).

## F8. Home page, character select and lobby (`ui/Home.tsx`, `ui/CharacterSelect.tsx`, `ui/Lobby.tsx`, `ui/MicCheck.tsx`)

The flow is **Home → (Start or Join) → Character select → Lobby (wait, mic check, Ready) → game**.

### F8.1 Home page (`/`)

The first thing anyone sees, and the opening shot of the stage demo, so it must look like a game's title screen, not a web form.

- **Background:** a full-screen attract-loop canvas (a separate small `<Canvas>`, not the cockpit scene): the `ExteriorPlane` flying at night over scrolling toy clouds and the moon, camera on the `EXT_CHASE` offset with a slow 0.3 Hz bob and an occasional 4° banking turn every ~8 s. Same color script as phase 1 calm (§F0.2).
- **Title:** the WINGIN' IT! logo (Baloo 2 800, 120 px, cream #F2E8D5 with a teal #2EC4B6 extruded drop shadow, a gentle 2 s float) and the tagline `app.tagline` under it.
- **Menu** (big chunky toy buttons, center-bottom, keyboard navigable with ↑/↓/Enter):
  1. **Start a game** (`home.start`, primary, teal) → `createRoom({demo, seed, mock} from the URL)` → `/r/CODE`, which opens character select.
  2. **Join a game** (`home.join`) → a 4-letter code input slides in (auto-uppercase, letters only, paste-friendly) → `getRoom` → `/r/CODE`; unknown code → `landing.not_found`.
  3. **How to play** (`home.how`) → `HowToPlay.tsx`, a 3-card overlay (`home.how_1..3`) with small illustrations: the two characters back to back, a radio, fading brackets.
- **Corner controls:** EN / हिन्दी UI-language switch (default from the browser: `hi*` → hi, else en), volume/mute (`Settings`), and the DEMO badge on demo servers.
- **Motion:** the menu buttons pop in with a 60 ms stagger (`back.out`); hovering a button lifts it 3 px with a soft click sound once audio is unlocked. Clicking anything on the home page unlocks the `AudioContext`.

### F8.2 Character select (`/r/:code` before `joined`)

Shown when the player opens a room link and hasn't joined yet. One screen, three choices and a name, with a live preview:

- **Role** — two large role cards side by side: **Flyer** (`lobby.flyer`, `lobby.flyer_desc`, cockpit icon) and **Tower** (`lobby.tower`, `lobby.tower_desc`, manual icon). A role already held by someone is disabled with `lobby.taken` (from `room_state` / `GET /api/rooms/:code`).
- **Character (gender)** — on the selected role card, a two-option toggle `char.male` / `char.female`, each a small portrait thumbnail. Required: **Join** stays disabled until it's picked (`char.pick_all`). Never pre-selected for real players (split view and `?gender=` may prefill).
- **Language** — the English / हिन्दी toggle (`lobby.language`). **Independent of role:** a Hindi Flyer and an English Tower is just as valid as the reverse (§A2 rule 9). No default is derived from the role.
- **Name** — 1–16 characters (`lobby.name`).
- **Live preview** (`AvatarPreview.tsx`), large, on the left half of the screen:
  - Flyer: the 3D `FlyerAvatar` (§F9.8) on a slow turntable in a small canvas, under the night-calm rig, waving once when the gender changes.
  - Tower: the animated 2D `TowerPortrait` (headset, a blink every 3–5 s, mic boom bob), swapping with a quick card-flip when the gender changes.
  - Caption under it: `char.flyer_caption` / `char.tower_caption`.
- **Join** sends `join {name, role, lang, gender, token?}`. Afterwards, changing role, gender or language sends `update_player`.

### F8.3 Room lobby (`/r/:code`, status LOBBY, after `joined`)

- Top: the room code large (Baloo 2 800, 72 px, letter-spaced), the share link `{origin}/r/CODE` with Copy, and a QR code (`qrcode.react`, 160 px).
- The two players shown as **character cards** side by side: portrait (`FlyerPortrait` / `TowerPortrait` in their chosen gender), name, role, language, ready check, connected dot. An empty slot shows a dashed silhouette with `lobby.waiting_partner`.
- My **Ready** toggle, an "edit character" button (back to §F8.2 fields inline), and the block message from `room_state.block_reason` (`lobby.block_*`). Changing role, gender or language sends `update_player`.
- Setup tip card: "Sit back to back. No peeking at each other's screens."
- **Mic check (real mode only, before Ready):** "Allow microphone" → `mic.init()` (§F16.1); then a live level meter (12 bars), "Say something to test your mic", turning into "Mic works!" once the level passes 0.15 for 300 ms. If denied → `lobby.mic_denied`, and Ready is disabled. In mock mode show `lobby.mock_note` instead.
- The first click anywhere in the lobby unlocks the `AudioContext` (§F16.3).
- When the game starts (status leaves LOBBY) the room route swaps to the Flyer or Tower screen.

## F9. The 3D cockpit (`scene/`)

### F9.1 Canvas (`CockpitCanvas.tsx`)

```tsx
<Canvas dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 55, near: 0.03, far: 3000, position: [0.5, 1.3, 0.35] }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; }}>
  <CameraRigDriver/>           {/* applies cameraRig every frame, §F10.1 */}
  <LightRig/>                  {/* §F10.2 */}
  <fogExp2 attach="fog" args={["#1a2140", world.fog]}/>
  <Sky/> <Clouds/> <Weather/>
  <Cockpit/>                   {/* shell, seats, yokes, windows, wings, pilot */}
  <Overhead/> <Pedestal/> <FrontPanel/>
  <Runway/> <ExteriorPlane/>
  <Effects/>                   {/* Bloom + Vignette */}
</Canvas>
```

- No shadows (performance); fake contact shading with darker colors under objects.
- Materials: `MeshStandardMaterial`, roughness 0.55, metalness 0, unless noted. Controls get drei `<Outlines thickness={0.004} color="#1b1d24"/>`.
- Lamps use emissive at intensity 2.5 with `toneMapped={false}` so Bloom picks them up.
- Units: meters, +Y up, the Flyer faces −Z, origin = cockpit floor center.

### F9.2 Cockpit shell (`Cockpit.tsx`)

| Element | Build |
| --- | --- |
| Floor | RoundedBox 2.4 × 0.06 × 2.2 at y 0.03, #3D4352 |
| Shell | Cream #F2E8D5 rounded walls: left and right walls (RoundedBox 0.08 × 1.9 × 2.2 at x ±1.22), roof (2.4 × 0.08 × 1.6 at **y 2.3**, z −0.3, with a slate housing and brow down to the overhead panel; the overhead face's far edge reaches y ≈ 2.16, so a lower roof would bury row 0), rear bulkhead (z 1.1) **with a doorway** so the `WIDE_INTERIOR` camera at z 1.4 can see in. Window openings are left as gaps between wall pieces. |
| Windshield | Two panes, x −1.1…0 and 0…1.1, y 1.2–1.9, z −1.15, tilted 20° back: `meshStandardMaterial transparent opacity={0.12} color="#cfe8ff" roughness={0.05}`, thick cream frame bars (RoundedBox 0.06) around and between them |
| Side windows | x ±1.2, y 1.2–1.7, z −0.6…0.4, the same glass material, rounded cream frames |
| Glare shield | Slate #2B2F3A rounded hood above the front panel (x −1.05…1.05, y 1.17, z −1.0…−0.85) |
| Seats | Pilot (x −0.5, z 0.3) and Flyer (x +0.5, z 0.3): cream frame, cushion RoundedBox #E07A5F (seat 0.5 × 0.12 × 0.5 at y 0.5, back 0.5 × 0.7 × 0.12) |
| Yokes | One per seat at z −0.55: column cylinder r 0.025 from the floor to y 0.85, grip = a half torus (radius 0.12, tube 0.018, arc π) in #2B2F3A with cream end caps. Decorative, not clickable. |
| Panels | Each station's slate panel body (#2B2F3A, edge #3D4352) is drawn by `StationGroup` |

### F9.3 Station placement (`StationGroup.tsx`)

Each station is a group whose local XY plane is the panel face (+Z = face normal). The group is positioned at the face center and oriented with `group.lookAt(faceTarget)`; the slate body is a RoundedBox (`size.x + 0.06`, `size.y + 0.06`, depth 0.04) behind the face.

| Station | Face center | Face size (w × h) | faceTarget (the face normal points here) | Grid | Cell pitch |
| --- | --- | --- | --- | --- | --- |
| overhead | (0, 1.95, −0.25) | 1.2 × 0.6 | (0.3, 0.9, 0.7) (35° down toward the Flyer) | 7 × 4 | 0.171 × 0.15 |
| pedestal | (0, 0.78, −0.45) | 0.5 × 0.7 | (0.3, 1.9, 0.2) (sloped top facing up and back) | 4 × 4 | 0.125 × 0.175 |
| front | (0, 0.975, −0.95) | 2.0 × 0.35 | (0.3, 1.25, 0.8) (tilted 15° toward the Flyer) | 8 × 3 | 0.25 × 0.117 |

Cell → local position (row 0 is the far/top edge):

```ts
x = (col + span / 2 - cols / 2) * pitchX
y = (rows / 2 - row - rowspan / 2) * pitchY
z = 0   // parts extrude toward +Z
```

**Never place controls by hand.** `Overhead.tsx`, `Pedestal.tsx` and `FrontPanel.tsx` are thin wrappers: `<StationGroup station="overhead"/>` maps each `stations.json` control to its part component with `{id, label, color, size, style, state, interactive, blinking}` from the store.

### F9.4 Parts (`scene/parts/`)

All dimensions in meters. Colors come from the `stations.json` palette. Labels are drei `<Text font="/fonts/Baloo2-Bold.ttf">` with digits or arrows only: #111111 on light caps, #F5F5F5 on dark panels, size 0.028.

| Part | Geometry | States → pose | Motion |
| --- | --- | --- | --- |
| PushButton | Bezel RoundedBox 0.075 × 0.075 × 0.012 (#3D4352); cap RoundedBox 0.06 × 0.06 × 0.025, radius 0.008, colored (white = #D9D9E0). Big: bezel cylinder r 0.055, cap cylinder r 0.045 × 0.03. Label on the cap face. | — | Cap sinks 0.012 in 80 ms, returns in 120 ms (`power2.out`) |
| ToggleSwitch | Plate RoundedBox 0.05 × 0.07 × 0.008 (#D9D9E0); bat = cylinder r 0.006 × 0.045 + sphere tip r 0.009 (#8B8D98), pivot at the plate center; status lamp sphere r 0.007 above the plate (green emissive when on); label below. **mushroom**: stem cylinder + sphere cap r 0.025 in the switch color, emissive 2.0 when on. **guarded** (big): a 1.4× bat plus a red translucent hinged cover (opacity 0.5) propped open 70°. | `on` = bat +25° (up); `off` = −25° | Flip 50° in 120 ms (`back.out(2)`) |
| PullHandle | Stem cylinder r 0.008 × 0.05 along +Z; T-bar capsule r 0.012 × 0.07; colored (grey #8B8D98 / red). Big: scale 1.5. | `in` = z 0; `out` = z +0.06 | Slide 0.06 in 250 ms (`power2.out`), stays out |
| UpDownLever | Slot RoundedBox 0.03 × 0.09 × 0.01 (#1B1E26); shaft cylinder r 0.006 × 0.07 pivoting at the slot center; ball knob r 0.016 (#D9D9E0); label beside the slot | `up` = +12.5°, `down` = −12.5° (about local X) | Rotate 25° in 300 ms (`power3.inOut`) |
| NotchLever | Like UpDownLever with 3 tick marks (boxes 0.012 × 0.002) beside the slot | notch 0 = +15°, 1 = 0°, 2 = −15° | Each move 15° in 150 ms + `click` sfx |
| Lamp | Half-sphere dome r 0.03 (big 0.06) on a torus bezel (#3D4352) | `color null` = #3A3D46, no emissive; lit = color + emissive 2.5; `blinking` = 1 Hz (on 0.5 s / off 0.5 s, phase from `serverNow()`); `attention` = **ignored, nothing is drawn** (§A6) | Color changes cross-fade 150 ms |
| FuelGauge | Dial cylinder r 0.05 (cream face), red zone = ring geometry over the first 20%, needle box 0.004 × 0.04 | Needle angle = −120° + 240° × `fuel_s / fuel_max_s` | Needle eases (damp 4/s); pulses red when fuel < 20 s |
| Screen | RoundedBox 0.12 × 0.08 × 0.01; when on: emissive teal #2EC4B6 (1.2) with a small plane icon (3 flat boxes) | `on` / off | Boot: flicker 3× over 400 ms, then steady |

### F9.5 Interaction (`useInteractive.ts`)

- A part is **interactive** iff its id is in `flyer.interactive` (the server's list) **and** `game.input_locked` is false. Everything else renders but ignores pointer events (and shows no hover).
- Hover (interactive only): material emissive lift +0.25 (lamps excluded), `document.body.style.cursor = "pointer"` (drei `useCursor`).
- Click: `onPointerDown` (left button), `e.stopPropagation()`, then the verb:
  - PushButton → `press`; ToggleSwitch → `toggle`; PullHandle → `pull` (only while `in`).
  - UpDownLever → `move_down` when `up`, `move_up` when `down`.
  - NotchLever → `move_down`; shift-click → `move_up`.
- Send `{type: "interact", object_id, verb}`. Play `click` (buttons, switches) or `clunk` (handles, levers) locally at once.
- Debounce identical clicks faster than 80 ms (hardware double-fires). The server counts presses, so the client never counts.

### F9.6 Optimistic motion and bounce

- **PushButton:** always play the sink-and-return locally; the server never needs to confirm it.
- **Toggle / handle / lever / notch:** animate at once toward the predicted pose. Then:
  - `object_state` with `bounce: false` and the predicted state → keep it.
  - `object_state` with `bounce: true` → spring back to the server state (`elastic.out(1, 0.4)`, 350 ms).
  - Nothing within 800 ms → spring back to the store state.
- The store's server state is the truth; the visual is `predicted ?? server`.

### F9.7 Environment (`scene/env/`)

| Component | Build | Driven by |
| --- | --- | --- |
| `Sky` | Inverted sphere r 1500 with a vertical-gradient shader. Night #0B1026 → #2A3A6A; storm #0A0F1A → #1E2633; dawn #FFB36B → #A8D8FF. drei `<Stars count={2000} radius={900}/>` (hidden in storm/dawn). Moon: emissive sphere r 18 at (−200, 160, −500), #F2F4FF. Sunrise: a big emissive disc low at (0, 20, −900), #FFB36B, dawn only. Cross-fade 2 s on weather change. | `world.weather`, `light_rig` |
| `Clouds` | Toy clouds: 40 puffs, each a cluster of 5–8 white spheres (InstancedMesh, MeshStandard #EEF1FF, roughness 1). Sea of clouds at y −25…−8, a few at plane level. They scroll +Z at 30 m/s and wrap at z +80 → −600. Storm: color → #59607A, density ×2, closer (y −6…+6). Dawn: color → #FFE2C4. | `world.weather` |
| `Weather` | **Rain** (rain / storm / rain_light): 2,000 instanced thin boxes (0.005 × 0.25 × 0.005, #B8C7E0, opacity 0.5) in a 40 × 20 × 60 box around the cockpit, falling at 25 m/s and streaking back; rain_light = 40% of the instances. **Droplets**: 60 small transparent spheres on the windshield panes sliding up and outward. **Lightning**: a directional light (white) whose intensity is driven by timelines (§F14). **Fog**: `fogExp2` density = `world.fog`, tweened 2 s. | `world.weather`, `world.fog` |
| `Wings` | Visible through the side windows: wing RoundedBox from x ±1.3 to ±4.0 at y 1.0 (2.7 × 0.08 × 0.8, cream, with a teal tip); engine nacelle capsule at x ±2.6 (r 0.22, length 0.9, pointing −Z) with a 3-blade propeller (boxes 0.5 × 0.06 × 0.02, #2B2F3A) spinning at 30 rad/s. A stopped propeller decelerates over 2.5 s. | `world.propeller_stopped` |
| `WingFire` | At the burning nacelle (cockpit wing **and** exterior plane). Fire: 120 additive billboard sprites (procedural radial-gradient texture, colors #FFD166 → #FF7A1A → transparent), lifetime 0.6 s, rising and drifting back. Smoke: 60 normal-blended grey sprites (#6B6F7A, opacity 0.5), lifetime 2.5 s, trailing +Z. Levels: `full` 100%; `half` 50% of the count and 70% of the size; `smoke` fire 0, smoke 100%; `wisp` smoke 20%; `flicker` fire 25%, on and off every 0.4–0.9 s; `none` = nothing. Level changes tween over 1 s. Bursts: `foam` (white puff, 80 sprites, 0.8 s) and `snuff` (white puff, 40 sprites, 0.5 s). | `world.fire`, `fx:burst:*` |
| `Runway` | A group: strip plane 60 × 1200 (#2A2A2E); center dashes (instanced boxes 1 × 0.02 × 12 every 30 m, white); two rows of edge lights (instanced emissive spheres r 0.4, #FFF4D6, every 30 m at x ±28); an approach light bar (10 emissive spheres in a row before the threshold). States: `hidden` (invisible); `far` (visible at z −600, y −40, edge lights faded in); `rolling` (under the plane at y −1.2, dashes and lights stream past +Z at 60 m/s using modulo offsets); `stopped` (stream speed 0). | `world.runway`, timelines |
| `ExteriorPlane` | At world (0, 50, −300): capsule fuselage (r 0.9, length 6, cream) along Z; rounded-box wings (12 × 0.15 × 1.6) with teal tips; two nacelles with spinning propellers at x ±2.6; tail fin; a teal #2EC4B6 stripe (thin box); a row of round windows (dark spheres). It mirrors `propeller_stopped` and `WingFire`. Its landing-lights cones show when `landing_lights` is on. | `world.*` |

### F9.8 Characters (`scene/characters/Pilot.tsx`, `FlyerAvatar.tsx`, `FirstPersonHands.tsx`)

**The captain (NPC, `Pilot.tsx`, not selectable):**


- Body: capsule (r 0.18, length 0.45), navy #1F2A44, sitting in the left seat. Arms: two capsules. Head: sphere r 0.14, skin #F1C27D. Cap: cylinder navy with a black visor box and a small gold badge. Mustache: two small dark-brown (#4A2E1F) capsules angled out.
- Animations (procedural, `useFrame`):
  - idle breathing: torso scale Y 1 ± 0.01 at 0.25 Hz;
  - `slumped`: head pitched 60° forward, torso leaned 25° onto the yoke;
  - "Zzz": drei `Text` floating up 0.3 m and fading, looping every 2 s while slumped;
  - snore: the pilot's chest swell syncs with the `snore` sfx (every 3–4 s, quiet);
  - `seat_back`: the seat and pilot group translate +0.4 m in Z (`elastic.out(1, 0.5)` in the `p1_seat` timeline);
  - `awake`: head lifts, looks left and right, a "?" pops above (scale 0 → 1, `back.out`).

**The Flyer's character (`FlyerAvatar.tsx`), male or female from the Flyer player's `gender`:**

- Sits in the right seat (x +0.5, z 0.3), the same toy proportions as the captain (capsule body r 0.17 × 0.42, sphere head r 0.135, skin #E0AC69), seat belt across the chest (a flat dark strap).
- **Male:** short tousled dark-brown hair (#3B2A20) built from 4–5 flattened spheres, a teal hoodie (#2EC4B6) with a lighter hood rim, round glasses (two torus rings).
- **Female:** dark hair (#2B1D16) with a high ponytail (a capsule swinging on a spring), a coral bomber jacket (#E07A5F) with cream cuffs, small round earrings.
- Both are original, friendly, non-stereotyped toy designs, clearly distinguishable at a glance, and must read well in silhouette in `WIDE_INTERIOR`.
- **Visibility:** rendered in all third-person shots (`WIDE_INTERIOR`, `PILOT`, exterior window views of the cockpit) and in the lobby preview. **Hidden in first-person shots** (when the camera is within 0.25 m of the Flyer's eye position) so the camera never sees inside the head.
- **Poses:** `idle` (breathing, small looks around), `panic` (hands on cheeks, used in the prologue when the captain slumps), `brace` (gripping the armrests, `p3_touchdown`), `cheer` (both arms up with a bounce, `landing`).

**First-person hands (`FirstPersonHands.tsx`):** in first-person shots, the Flyer's two mitten hands with sleeves in the character's outfit color (teal hoodie / coral jacket) rest at the bottom edge of the frame. When the Flyer clicks a control, the nearer hand does a quick 180 ms "poke" toward the click point and back (no IK, just a tween toward the hit point projected onto the panel); hidden during cinematics.

**Portraits (`ui/avatars/`):** flat 2D SVG busts in the same toy style, used in the DOM:

- `FlyerPortrait` (male / female, matching the 3D model's hair, outfit and glasses or earrings).
- `TowerPortrait` (male / female): an air-traffic controller with a headset and mic boom and a navy vest with a teal "ATC" badge; male with short dark hair, female with a low bun. Neither has a mustache, so they're never confused with the captain.
- States: `idle`, `talking` (the mic boom glows and the mouth flaps at ~6 Hz while that player holds the channel), `happy` (deck screen).

### F9.9 World → scene mapping (summary)

| `World` field | Visual | Audio (§F16.4) |
| --- | --- | --- |
| `light_rig` | `LightRig` cross-fades to that rig over 1 s | — |
| `alarm` | red pulse light (part of `night_alarm`) | `alarm_master` loop |
| `warning_beep` | — | `warning_beep` once per second |
| `pilot.*` | pose, Zzz, seat offset, "?" | `snore` while slumped |
| `ap_screen` | `OH_AP_SCREEN` boot and on | — |
| `fire` | `WingFire` on that side (cockpit and exterior) + orange point light at that window (part of the `fire` rig) | — |
| `propeller_stopped` | that propeller spins down | `engine_hum` drops pitch 15% |
| `fire_bell` | — | `fire_bell` loop |
| `fuel_hiss` | — | `fuel_hiss` loop |
| `engine_hum` | — | `normal` / `one_engine` (−15% pitch) / `steady` (`one_engine` with no wobble) / `off` (fade out 3 s) |
| `weather`, `fog` | Sky, Clouds, Weather | `rain` loop gain 0.08 (rain/storm), 0.04 (rain_light) |
| `turbulence` | resting camera shake | — |
| `static_level` | — | `static` gain |
| `landing_lights` | two warm spotlights from the nose (#FFE7B0, angle 0.35, intensity 6, distance 300) + visible cones (transparent cones, opacity 0.08) | — |
| `runway` | `Runway` state | — |
| `overhead_all_green` | (lamps come as object states; this flag just keeps the outro idempotent) | — |

## F10. Camera rig and light rigs

### F10.1 `cinematics/cameraRig.ts`

```ts
export const rig = { position: new Vector3(0.5, 1.3, 0.35), target: new Vector3(0.2, 1.0, -1.0),
                     roll: 0, pitchOffset: 0, shake: 0, restShake: 0 };
// every frame (CameraRigDriver):
//   n = simplex(t * 9) per axis; off = n * 0.03 * rig.shake
//   camera.position.copy(rig.position).add(off)
//   lookAt(target + (0, tan(pitchOffset°) * dist, 0)); camera.rotateZ(roll°)
//   rig.shake = damp(rig.shake, rig.restShake, 3, dt)    // decays to rest (0, or 0.15 in phase 3)
```

Shots (position → target), from the build spec:

| Shot | Position | Target |
| --- | --- | --- |
| `FLYER_DEFAULT` | (0.5, 1.3, 0.35) | (0.2, 1.0, −1.0) |
| `OVERHEAD` | (0.35, 1.35, 0.25) | (0, 1.95, −0.3) |
| `PEDESTAL` | (0.4, 1.35, 0.25) | (0, 0.75, −0.45) |
| `FRONT` | (0.45, 1.3, 0.3) | (0.1, 0.98, −0.95) |
| `RIGHT_WINDOW` | (0.5, 1.3, 0.35) | (3.0, 1.1, −0.2) |
| `LEFT_WINDOW` | (0.3, 1.3, 0.3) | (−3.0, 1.1, −0.2) |
| `PILOT` | (0.4, 1.35, 0.4) | (−0.5, 1.1, −0.1) |
| `WIDE_INTERIOR` | (0, 1.6, 1.4) | (0, 1.1, −0.8) |
| `EXT_SIDE` | plane + (6, 1, 4) | plane (0, 50, −300) |
| `EXT_CHASE` | plane + (0, 1.5, 7) | plane |
| `EXT_FRONT_LOW` | plane + (0, −0.5, −8) | plane |

Helpers (all return GSAP tweens so timelines can position them):

- `moveTo(shot, seconds, ease = "power2.inOut")` tweens position and target together.
- `cut(shot)` sets both instantly. `whip(shot)` = `moveTo(shot, 0.5, "power3.inOut")`.
- `shakeFor(amount, seconds)` sets `shake = amount`, which decays to rest over `seconds`.
- `rollTo(deg, s)`, `pitchTo(deg, s)`.
- `flash(color, ms)`: full-screen DOM overlay, opacity 1 → 0.
- `setLightRig(name, s)`, `titleCard(key, seconds)`, `sfx(name)`.

**Resting shot during play** (until §F10.3 free look is built; then it's the initial facing) = the current station's shot (`OVERHEAD` / `PEDESTAL` / `FRONT`), applied when PLAYING starts, after any cinematic and on rejoin. In Dev Mode with `?orbit=1`, OrbitControls replace the rig.

### F10.2 `scene/LightRig.tsx`

| Rig | Setup |
| --- | --- |
| `night_alarm` | Hemisphere sky #2A3A6A / ground #10121A at 0.5; warm cabin point light (#FFD8A8) 0.6 at (0, 1.9, 0); red point light (#FF3B3B) pulsing 0 → 2.5 at 1.2 Hz at (0, 1.8, −0.4) |
| `night_calm` | Same base; the red pulse is replaced by a soft amber (#FFB347) point light at 0.8; moonlight directional #9FB4FF at 0.6 from (−1, 2, −1) |
| `fire` | `night_calm` + an orange point light (#FF7A1A) at the fire-side window (x ±1.1, y 1.3, z −0.1), flickering 1.2–2.2 with noise; a slow red pulse at 0.5 Hz (0 → 0.8) |
| `storm` | Dark-blue hemisphere (#1B2440 / #05070C) at 0.3, no moon; the lightning directional light at 0 (spiked by timelines to 6) |
| `dawn` | Low directional #FFB36B at 1.2 from (0, 0.3, −1); hemisphere #FFD9B0 / #3A3A4A at 0.6 |

Every rig parameter is a tweenable number; a rig change tweens all of them over 1 s (or over the duration the timeline asks for). The fire-side light reads `world.fire.side`.

### F10.3 Free look and interact mode (PENDING DESIGN CHANGE, user decision Nov 14 2026, not implemented yet)

> **This overrides the build spec's non-goal "No walking or free camera."** The Flyer may now look around the cabin with the mouse. There's still no walking: the head stays in the seat, turning and leaning a little. Scripted cinematics are unchanged. Build this after the current round, on the new AWS profile.

**Two modes during PLAYING (Flyer only):**

| Mode | Cursor | Mouse | Clicks |
| --- | --- | --- | --- |
| **Look** (default) | Hidden; pointer locked (Pointer Lock API) | Moving the mouse turns the head | A click **freezes the view** → interact mode (and also counts as a click on the control under the screen centre if there is one; see below) |
| **Interact** | Visible | Moves the pointer only; the view stays still | A click on a control → `interact` (as today, §F9.5). A click on **empty space** (no control under the pointer) → back to look mode, re-locking the pointer |

- **Entering look mode** needs a user gesture (browser rule): the first click on the canvas when PLAYING starts. Until then, show the hint below. `Esc` (the browser releases pointer lock) → interact mode.
- **Clicking any control** keeps interact mode, including a control on another station that's inert (it does nothing, as today). Only a click that hits **no control mesh** returns to look mode.
- **Head limits** (from the seated eye at the `FLYER_DEFAULT` position):
  - **turn:** yaw ±110° (enough to look out of both side windows), pitch −55° (down to the pedestal) to +60° (up to the overhead);
  - **lean** with the look direction: up to **25 cm** forward/down when looking toward the front panel or the pedestal, and up to **20 cm sideways** toward a side window when yaw > 60°, so the player can **see past the pedestal** and look **side to side** out of both windows at the wings and fire;
  - a collision clamp keeps the camera ≥ 6 cm from cockpit geometry.
- **Settle on freeze:** when look → interact, find the station whose panel the view ray hits (or the nearest within 25°). Ease over **0.3 s** (`power2.out`) toward a clean framing of that panel: a blend of the current view and that station's shot (§F10.1), keeping most of the player's angle and any lean needed to see the bottom row. If no panel is near, stay exactly where the view is.
- **Feel:** mouse sensitivity is set in Settings (default 0.15°/px, range 0.05–0.4, saved in `wingin:settings`). The look is smoothed with critical damping (~60 ms); there's no Y inversion by default (optional toggle). Camera shake, roll and pitch from cinematics and `fx` compose on top of the look rotation (§F10.1 rig).
- **Cinematics** (`input_locked`): the scripted rig takes over the camera as today. Pointer lock may stay engaged, but mouse input is ignored. When the cinematic ends, the head eases (0.4 s) back from the cinematic's end shot into look mode, facing the current station's shot.
- **Typing** (the MockTalkBox or any input): focusing an input releases pointer lock → interact mode. Space push-to-talk works in both modes.
- **First-person hands:** the poke animation plays only in interact mode, toward the clicked control.
- **HUD hint** (new strings, both languages): `look.hint_enter` "Click to look around" / "चारों ओर देखने के लिए क्लिक करो"; `look.hint_look` "Move the mouse to look · Click to use the controls" / "देखने के लिए माउस घुमाओ · कंट्रोल चलाने के लिए क्लिक करो"; `look.hint_interact` "Click empty space to look around again" / "फिर से देखने के लिए खाली जगह पर क्लिक करो"; `settings.sensitivity` "Mouse sensitivity" / "माउस की संवेदनशीलता". The hint shows small and bottom-left, and fades after the first 3 uses of each mode.
- **Privacy and rules unchanged:** only the server's `interactive` ids react (§A2 rule 6); the Tower is unaffected; there are no protocol changes.
- **Consequences:**
  - The **FRONT occlusion**: the lean alone couldn't clear the pedestal, so FP_LEVER_4 moved to row 1, col 3 in `stations.json` (decision 2026-11-15); the 3D controls are otherwise frozen.
  - Free look means all three stations are on screen more often, so the **draw-call budget** (§F21; WIDE-type views reach ~280) matters more. Plan the control-batching optimization (identical controls in one draw each, with **no visual change**) alongside this.
  - The station shots (§F10.1) remain the cinematic shots, the settle targets, and the initial facing.
- **Tests and visual check:**
  - mode transitions (lock/unlock/Esc/typing/cinematic);
  - the head limits and collision clamp;
  - the settle target picking;
  - an empty-space click returning to look mode;
  - a click on a control in interact mode sending `interact` and staying in interact mode;
  - screenshots of the leaned view over the pedestal, both side-window looks, and each settle framing, at 1440×900.

## F11. Flyer HUD (`ui/FlyerHUD.tsx`)

An absolutely positioned DOM layer over the canvas. Baloo 2. All text in the Flyer's language. `pointer-events: none` except on interactive widgets.

| Area | Content |
| --- | --- |
| Top left | Signal: 3 bars (filled = `signal_level`: phase 1 → 3 bars, 2 → 2, 3 → 1) + the label (`signal.N`) + the phase name. Phase 3: the bars glitch (random 1-frame jitter every 2–5 s). |
| Top center | Progress pips, one per action (`total_actions`): done = filled teal, current = pulsing white ring, upcoming = hollow. |
| Top right | Fuel: `{n}s` (tabular numbers) + a thin bar (green #30A46C > 50%, amber #F5C518 > 20 s, red #E5484D ≤ 20 s and pulsing). The 3D fuel dial on the front panel mirrors it. |
| Bottom center | Subtitle stack: the last 3 Tower utterances, newest at the bottom, older ones at 60% and 35% opacity, each with a small TOWER tag and the Tower's portrait (§F13). Newest line 26 px. |
| Above subtitles | While transmitting: my live partial caption (italic, 18 px, white 80%). After sending: "You: …" echo in grey for 3 s. |
| Bottom right | `PTTIndicator` (real mode) or `MockTalkBox` + `QuickReplies` (mock). |
| Bottom left (phase 3) | `Lifelines`: three dots (filled = left) + "Tap a subtitle to decode it". |
| Top center overlay | `Toasts` and `TitleCard`. |
| Corner (top right, small) | `Settings` (volume slider, mute). |
| Full screen | `Overlays` (§F20): flash, red vignette pulse, skip button during cinematics, crash/retry, paused, reconnecting. |

`PTTIndicator` shows the partner's small portrait in the busy state (`talking`). States: **idle** (mic icon, `ptt.idle`, plus the on-screen hold button), **transmitting** (red pulsing ring, `ptt.transmitting`, tiny level meter), **busy** (amber, `ptt.busy_tower` when the partner holds the channel). It ignores clicks when busy.


## F12. Tower screen (`ui/TowerScreen.tsx`)

Designed for 1440 × 900; works down to 1280 × 720 (below that, scale the whole layout with CSS `zoom`/transform). Everything is in the Tower's language and script. The Tower **never** mounts the cockpit canvas and never receives Flyer secrets.

### F12.1 Layout

A dark slate desk (#1E222B with a subtle noise texture via an SVG filter), decorated with a coffee mug (SVG, top left of the manual, with a steam wisp animation) and a pencil lying beside the manual.

| Column | Width | Content |
| --- | --- | --- |
| Left | 24% | `Radar` (square, max 300 px), then the fuel bar with seconds, signal bars + label, phase title |
| Center | 54% | `ManualCard`: the open ring-bound manual (two-page spread; the left page is one full-page diagram), or `ManualCover` when `card` is null |
| Right | 22% | My `TowerPortrait` (top, 96 px, `talking` while I transmit), subtitles from the Flyer (last 5), `Lifelines` (phase 3), `PTTIndicator` + partial caption (or `MockTalkBox`), `Settings` |

A CSS screen-shake class (`translate` jitter, 0.6 s) is applied to the whole screen by the `p2_intro` Tower timeline.

### F12.2 Radar (`ui/Radar.tsx`)

SVG 280 × 280:

- Background: dark green-black disc #0B1A14, 3 concentric rings and crosshairs (#1F4D3A), a range label.
- Sweep: a rotating wedge (conic gradient, 4 s per revolution) that brightens the blip when it passes.
- Blip: a circle r 6 colored by `radar.blip` (green #30A46C, amber #F5C518, red #E5484D) with a soft glow, positioned along a fixed route path from (70, 210) to the runway at (215, 70) by `radar.progress` (eased 1 s).
- `icon`: `mayday` = a "MAYDAY" label in a red box above the blip; `fire` = a cartoon flame icon + `tower.engine_fire`; `smoke` = a grey puff icon. **Never any side.**
- `storm`: 4 grey translucent blobs drifting slowly across the disc.
- `runway`: a small white rectangle at the route end; `glide_path`: a dashed line from the blip to the runway.
- `landed`: the blip parks on the runway; a "LANDED" stamp (§F12.6) and confetti (60 DOM particles, 2 s) play once.

Below the radar: the fuel bar (same colors and pulse as the Flyer HUD, plus `{n}s`), signal bars (`signal_level` filled, same rule as the Flyer) with `signal.N`, and the phase title `phase.N`.

### F12.3 The flight manual (`ui/ManualCard.tsx`)

**Look:** a ring-bound flight manual lying open on the desk. Each step is presented as a **module page**: one self-contained page with a heavy title, one big diagram, one bold instruction line and a pictogram rule grid. The art is clean, bold vector line art: thick rounded black outlines on white paper, flat color **only** where color carries meaning (lamp and control colors), chunky shapes, generous white space.
- Pages: white #FFFFFF with a faint warm edge (#F4EFE4), a 2 px darker border and a soft drop shadow.
- Ink #1F1F1F; outlines 3.5 px with round joins at 1440 × 900.
- The gutter has 5 chunky metal rings (SVG, grey gradient) over punched holes.
- Pencil orange #C2410C, sticky note #FFF1A8, highlighter #FFE066.
- Fonts: Baloo 2 800 for titles, Baloo 2 600 for print, Kalam for handwritten notes.
- **Original design: our own module layout, icons and art. Don't copy, trace or imitate any existing game's manual pages, icons or characters.**

> **PENDING LAYOUT CHANGE (Nov 14 2026, not implemented yet; do it the next time the manual is touched).** The M1 build put the whole step on the left page and left the right page nearly empty. It also clipped the rule grid at the bottom. The layout below is the correct one and supersedes M1.

**The open book:** the manual is a real open book. **Two pages of equal width** sit either side of a center gutter with the metal rings, with a soft gutter shadow on both inner edges and a few stacked page edges along each outer side.
- The whole spread **scales to fit** the center column: both its width and its **height** at 1440 × 900 and at 1280 × 720.
- **Nothing on either page may be clipped or scroll.** A test asserts that every page element's bounding box is inside its page at both sizes.
- The phase tabs stick out of the right page's outer edge but stay inside the manual's reserved width.

**Accepted by the user (Nov 14 2026), after reviewing the open-book build:**
- The front panel's three gear lamps keep **separate** callouts.
- The overhead diagram may use a **single (right) side gutter**, with its column-0 names above and below.
- Callout tags may scale down to **≥ 12 px at 1280 × 720**, because the whole book scales uniformly. They stay ≥ 14 px at 1440 × 900.

**Left page: the diagram (`PanelDrawing`).** A title bar on top, then the station diagram filling the rest of the page (≈ 80% of the page height). Nothing else goes on the left page.

1. **Title bar:** `card.title` in heavy caps (Baloo 2 800, 34 px, letter-spaced; Devanagari at the same weight, no caps transform) on the left; a small step pill (`manual.step`, `index+1` / `total`) and the phase name on the right.
2. **The diagram** (`ui/manual/PanelDrawing.tsx`), filling the rest of the left page (≈ 80% of its height, full width), in a rounded-rectangle frame:
   - **Source of truth:** generated from `stations.json` with the same grid as the 3D build, never placed by hand, scaled to fit (SVG `viewBox` + `preserveAspectRatio="xMidYMid meet"`, no fixed cell size).
   - **Controls** are drawn by type, large, in their **default** position (never the live state):
     - button = rounded square (big = circle); toggle = plate + bat; handle = T-bar; lever = slot + knob; notch lever = slot + ticks; lamp = a light-bulb icon (outlined bulb with rays, colored only if the control's palette color is meaningful); gauge = dial + needle; screen = rectangle.
     - Digits and arrows are drawn big and bold on the controls, as in the cockpit.
     - Colored controls get a flat fill in their palette color.
   - **Names:** small callout tags outside the panel frame (Baloo 2 600, ≥ 14 px, the Tower's language), each joined to its control by a thin leader line with a dot. Callouts never overlap glyphs or each other.
     - A numbered row (buttons 1–4, switches 1–4, levers 1–4) gets **one group callout** ("बटन" / "buttons", "स्विच" / "switches", "लीवर" / "levers": the shared word from `manual_name` with the number removed).
     - Every other control gets its full `manual_name[lang]`.
     - Placement comes from the grid: the top half above the frame, the bottom half below, the outer columns at the sides. Use a deterministic placement plus a collision pass.
   - **This step's highlights:**
     - `card.highlight.circled` → a thick orange dashed ring (#C2410C, stroke 4, dasharray 9 6) around each listed control, and its callout gets an orange underline.
     - `card.highlight.question` → a bold "?" badge (white "?" on an orange circle, 32 px) beside each listed member.
**Right page: the instruction, the rule and the notes (`FindOut`, `RuleTable`, notes).** Top to bottom: the instruction line, the rule grid, then the notes area (hint, sticky note, last try) and the progress dots at the bottom.

3. **The instruction line** (`FindOut.tsx`), one or two lines of Baloo 2 600 (18 px), centered, with the important words **bold**:
   - Observe actions: the breadcrumb as a sentence: **station_label → part_label → property_label**. Each chip is bold and the keyword segments get the highlighter. After it comes `manual.then_grid` ("then follow the grid" / "फिर तालिका देखो").
   - `branch_on` actions: `known_from.text`, then `manual.then_grid`.
   - Say-only actions: `manual.instruction_do` ("Have the Flyer do this:" / "फ़्लायर से यह करवाओ:").
   - This describes the *rule*, never a sentence to say aloud (§A2 rule 5). A small handwritten `card.own_words_note` sits under it in Kalam, pencil grey.
4. **The rule grid** (`RuleTable.tsx`), **pictogram-first**, under the instruction line on the right page (≈ 45–55% of the page height, always fully visible):
   - **Header row** = one column per possible value (`rows[].when`), each a big pictogram in a rounded tab (≥ 48 px):
     - a light-bulb icon filled with the value's color (color swatches);
     - a bold ← or → arrow (sides; for `branch_on FIRE_SIDE`, a small flame next to the arrow);
     - a ✓ or ✗ badge (yes/no).
     - Under each icon, the value's label segments (small, highlighted keyword).
   - **Cell row** = under each column, the action as pictures: the `ControlDrawing` (≥ 64 px) of the control in its `target` state, with a chunky `×count` badge when count > 1.
     - Ordered multi-step rows show "1 → 2" between the drawings (`manual.order_then`); unordered ones show "+" (`manual.order_any`).
     - The highlighted `do` label sits small under the drawings.
   - **Say-only** actions: a single wide cell with a "do" pictogram (a pointing hand) as its header.
   - The grid has thick rounded outer borders and thin inner dividers, like an illustrated rule card, not a spreadsheet.
5. **Keywords** (on the instruction line, the value labels and the `do` labels): every keyword segment gets the same yellow highlighter mark behind it: `background: linear-gradient(transparent 35%, #FFE066 35%, #FFE066 90%, transparent 90%)`, `padding: 0 .15em`. It's identical for all keywords. No glosses on the manual.
6. **Success:** on `successStamp` for this action, a green "✓" rubber stamp scales into the matching grid column (`row_index`): 1.6 → 1 with `back.out` over 250 ms, plus the `stamp` thump.
7. **Wrong action:** the grid flashes a red ✗ for 600 ms, and a slip appears over it for 3 s: `tower.flyer_used` + `used.label` (segments) + `×count` when > 1.
8. **Motion:** when `card.action_id` changes, a 0.4 s page turn (the right page flips over the gutter onto the left, `transform-style: preserve-3d`, revealing the new step on both pages).

**Right page, lower part: notes and progress (handwritten).** They sit below the rule grid in the remaining space.

1. **Hint:** `card.hint` as a pencil annotation (Kalam 20 px, #555, rotated −2°) in the upper half, with a small curved arrow pointing toward the left page.
2. **Sticky note:** `card.sticky` on a yellow sticky note (#FFF1A8, rotated 3–5°, a tape strip on top, a soft shadow), Kalam 22 px.
3. **Last try:** when `card.last_wrong` is set, a red handwritten note: `manual.last_try` + label segments + `×{count}` + ✗ (Kalam, #C81E1E, rotated −2°, scribble underline).
4. **Progress** (`Checklist.tsx`): progress dots in a row near the bottom (`card.progress`: done = black, current = the phase color, upcoming = beige #E8DCC0). Colored phase tabs stick out of the right page edge (1 teal #2EC4B6, 2 orange #F97316, 3 blue #3E63DD; the current one is wider and labeled). This is the Tower's checklist; there's no separate checklist panel.
5. **Phase flavor:** `stamp === "emergency"` → a red rotated (12°) rubber stamp `manual.emergency` on the right page (mix-blend multiply, 85%). `smudges` → 4 blurred blue-grey rain-drop smudges across **both** pages.

**Quick-say (Mock/Dev only, `card.quick_say` present):** a small ▶ button at the end of the instruction line (sends `quick_say.ask`) and one under each grid column (that column's branch line, or `quick_say.say` for say-only). It sends `say_text` with `text`, or `alt_text` when `settings.sendDevanagari` is on (a dev-only toggle in the dev panel). Players in real mode never see these.

**ManualCover (`card === null`):** the closed manual: a teal hardback cover with `manual.cover_title`, a cartoon plane emblem, the phase tabs, and the upcoming phase's name. Shown in LOBBY→PROLOGUE, intros, outros, ENDING and CRASH.

### F12.4 The right column

- `Subtitles` with `stack=5` (the Flyer's utterances, FLYER tag; opacity 100, 80, 65, 50, 35%; newest 20 px).
- `Lifelines` (phase 3 only): three dots + `lifeline.hint`.
- `PTTIndicator` (`ptt.busy_flyer` when the Flyer talks) and my partial caption and echo, or `MockTalkBox` in mock.

### F12.5 What the Tower plays during cinematics

The Tower doesn't render the 3D scene. Each cinematic has a 2D Tower timeline (§F14.4) with the radar, stamps, banners, title cards and the screen shake.

### F12.6 Stamps and banners

- Rubber stamp component: big bold text (Baloo 2 800, 96 px, letter-spaced) in a rounded double border, rotated −8°, slams in (scale 2.2 → 1, 180 ms, `power4.in`) with a `stamp` thump and a 2 px screen jolt. Used for MAYDAY (red), LANDED (green) and EMERGENCY (manual corner).
- Banner: a full-width strip across the radar column (teal, white text) for `tower.autopilot`.

### F12.7 Tower window (PENDING, user decision Nov 14 2026)

For the three big story moments (**takeoff** in the prologue, the **landing**, and the **crash**), the Tower sees the plane itself through a "tower window", not just the radar.

- **Look:** a large framed control-tower window (thick slate frame, slightly tinted glass with a soft reflection streak) that slides down over the radar and manual area (≈ 75% of the screen, centered) in 0.5 s, plays its shot, then slides away. The desk dims behind it.
- **Rendering:** a separate, small `<Canvas>` (`ui/tower/TowerWindow.tsx`, lazy-loaded) containing **only** the sky, clouds, runway, the exterior plane and a ground strip with a few toy hangars and the tower's own railing in the foreground. It **never** includes the cockpit, stations, controls or any `flyer_view` data, and it reuses the exterior components from §F9.7. The Tower bundle loads three.js only for this chunk, and only when a window cinematic starts.
- **Shots:** from the tower (a fixed position near the runway's middle, about 12 m up), with a slow pan following the plane:
  - takeoff: the roll, lift-off and climb away into the dusk;
  - landing: dawn, touchdown, braking and the stop near the tower;
  - crash: far-off sky, the spiral and the POOF on the horizon.
- **Privacy rule:** the Tower's view must **never** reveal the fire side. In the tower window the plane is always rendered **symmetrically**: both propellers spinning (or both slowed on landing), no single-wing fire or smoke, and wisps from both engines, or none. It doesn't receive or read `fire_side`/`damaged_side`, and the server sends the Tower no side params anyway (§A10).
- **Sound:** a distant engine and wind, quieter than the Flyer's; touchdown screech on landing; the soft boom on the crash.
- **Tests:** the TowerWindow chunk is lazy and is never imported by the cockpit; no side param is read; symmetric rendering is asserted; screenshots of all three shots in both languages.

## F13. Subtitles, keyword chips and lifelines (`ui/Subtitles.tsx`, `ui/Lifelines.tsx`)

**One component for both screens:** `<Subtitles stack={3|5} tag="TOWER"|"FLYER" fontSize={26|20}/>`, reading `store.subtitles`.

**Line rendering:**

- A rounded bar (rgba(10,12,18,0.55), backdrop blur 4 px) with the speaker's small round portrait (28 px, the partner's `FlyerPortrait` / `TowerPortrait` in their gender, from `room_state`), the tag pill (tiny, uppercase, slate) and the segments in order.
- `plain` segment → a text span (white, preserving spaces).
- `keyword` segment → `<KeywordChip>`: **one style for every keyword**: `background: rgba(43,47,58,0.78); color: #fff; border-bottom: 2px solid rgba(255,255,255,0.7); border-radius: .45em; padding: 0 .3em;`. **Never vary it by concept.**
- `gloss` (when non-null) → immediately after the chip: `[gloss]` in a muted yellow #E9D98B, 0.7 em, `margin-left: .2em`.
- `concepts` with two entries ("twice") render as one chip with one gloss.
- New lines slide up 12 px and fade in (200 ms). Lines older than the stack fade out.
- Phase 3 (`level === 3`): the bar has a faint glitch effect (a 1 px RGB-split text shadow that flickers once when the line appears).

**Lifelines (phase 3, `game.lifelines_enabled`):**

- Lifeline dots: 3 circles, filled = remaining (`game.lifelines[me.role]`).
- A subtitle is **decodable** when `lifeline_available` is true, it is one of the partner's last 3 lines, and it isn't already revealed. Hover shows a small "decode" icon and cursor; click → `{type: "lifeline", utterance_id}` and show `lifeline.decoding` under the line (spinner, up to ~3 s).
- On `translation`: show `text` under that line (Baloo 2, 0.8 em, cream on dark, Devanagari for a Hindi player) for `TRANSLATION_REVEAL_MS` (6 s), then collapse it to a small `lifeline.show` link that re-opens it for free (client-side; no message).
- **Pin (decided):** a lifelined line stays pinned (with its translation) at the top of the stack until dismissed (✕), the next step, or another lifeline.
- With 0 lifelines left: clicks show `toast.no_lifelines`. On error `translation_failed`: clear the spinner and toast (the server didn't spend the lifeline).

**My own speech:** `partial` (live caption while transmitting) and `echo` ("You: …" for 3 s) render above the stack in grey; no chips.

## F14. Cinematics (`cinematics/`)

### F14.1 Runner (`runner.ts`)

```ts
useEffect(() => {                                       // on store.cinematic change
  const c = store.cinematic; if (!c) return;
  const tl = (role === "flyer" ? flyerTimelines : towerTimelines)[c.id](ctx, c.params);  // paused
  tl.duration();                                        // dev assert ≈ c.duration_ms / 1000 (±0.05) else warn
  const startIn = c.start_at_ms - serverNow();
  if (startIn > 0) setTimeout(() => tl.play(0), startIn);
  else tl.seek(Math.min(-startIn / 1000, tl.duration())).play();   // late (or rejoin): seek forward
  current = tl;
  return () => { tl.progress(1); tl.kill(); };          // replaced → apply end state
}, [store.cinematic?.id, store.cinematic?.start_at_ms]);
// on cinematic_skip: current.progress(1)
```

- Every timeline is built with a fixed total length: `tl.to({}, {duration: D}, 0)` where `D = duration_ms / 1000` from the message, so seeking and skipping are exact. A builder may compress its steps proportionally when the message duration differs from the nominal one (demo prologue 6 s, ending 4 s, `p1_intro` retry 3.2 s).
- `ctx` = `{ rig, refs (sceneRefs: pilot, seat, exteriorPlane, fire, runway, lights, lamps), ui: { titleCard, flash, stamp, banner, shake }, sfx, lang, t }`.
- **End states must match `World`.** Timelines animate toward the post-cinematic world. When the following `flyer_view` arrives, the scene reconciles without a visible jump.
- During any cinematic: `input_locked` (from `game_state`) disables part interaction, lifelines, retry and quick-say; push-to-talk and the mock box stay enabled. A **Skip** button (`cin.skip`) appears bottom center for skippable cinematics; after pressing it, it shows `cin.skip_waiting` until `cinematic_skip`. Hotkey K = skip (Dev Mode: the force skip).
- Title cards (`TitleCard.tsx`): centered, Baloo 2 800, 64 px for the title and 28 px for the signal line, cream with a dark outline; slide in from the top (0.4 s), hold, fade out (0.4 s). Text in the viewer's language from `title.phase` / `title.signal` + `signal.N` + "▮▮▮ / ▮▮ / ▮".

### F14.2 Flyer timelines (`timelines.ts`)

Times in seconds from the start. They follow the build spec shot lists, plus the exact end states.

**`prologue` (28 s; demo 12 s) — PENDING REWRITE (user decision Nov 14 2026): a movie-style opening.** *(The previous 12 s cruise-start version is superseded.)*

1. **0–8 Takeoff at dusk.**
   - 0 `cut(EXT_FRONT_LOW)` on the runway at sunset: the toy plane sits at the threshold with the runway lights glowing.
   - 0.8–3.5 it rolls (engines spool up, `engine_hum` rising) while the camera tracks alongside (an `EXT_SIDE`-style dolly).
   - 3.5 lift-off with a small bounce of the wheels.
   - 4–8 `cut(EXT_CHASE)`: it climbs through pink-orange clouds and banks gently.
   - The WINGIN' IT! logo fades in at 5.0–5.5, holds, and fades out by 7.5.
   - Light: a `dawn`-like dusk rig (low orange sun), shifting toward night.
2. **8–10.5 Time skip.** A fade to black over 0.4 s. A centered movie-style card in the viewer's language, `cin.time_skip` ("1.5 hours later" / "1.5 घंटे बाद"), fades in and out. Engine hum only.
3. **10.5–17 Cruise, the pilot dozes off.**
   - 10.5 fade up on `EXT_CHASE` at night over moonlit clouds (`night_calm`).
   - 12 `cut(WIDE_INTERIOR)`: the captain yawns (12.5), nods twice (13.5, 14.5), then **slumps onto the yoke at 15.5** (roll dip 6°). The Flyer's character turns to him and goes `panic` (15.8).
   - 16 the `alarm_master` loop starts and the `night_alarm` rig snaps on; "Zzz" floats above the captain.
4. **17–20 "Take control".** A big card over a dimmed frame, in the viewer's language:
   - Flyer: `cin.take_control_flyer` "The pilot is out cold. You have to fly the plane!" / "पायलट बेहोश है। अब विमान तुम्हें उड़ाना है!"
   - Tower: `cin.take_control_tower` "The pilot is out cold. Guide the passenger down!" / "पायलट बेहोश है। यात्री को सही-सलामत उतरवाओ!"
   - Radio crackle at 17.2.
5. **20–21 Black.** A fade to black, then a fade up.
6. **21–25.5 Into the Flyer's eyes.**
   - 21 `cut(WIDE_INTERIOR)` (from behind both seats, as in the M3a `09-wide-prologue-*` frame), alarm light pulsing.
   - 21.5–25 a slow dolly-in (`power2.inOut`) over the Flyer character's shoulder and **into the Flyer's eye position**. The character model hides as the camera passes 0.8 m from the eye (§F9.8).
   - 25 the first-person view settles facing the overhead.
7. **25.5–28 Title card** "PHASE 1 — PILOT DOWN" / "SIGNAL: STRONG ▮▮▮". At 28 the camera hands over to **free look** (§F10.3) at PLAYING start (until free look is built: the `OVERHEAD` resting shot).
- **Demo (12 s):** a 3 s takeoff (lift-off + chase), a 1.2 s time skip, 3.5 s of dozing, a 1.5 s take-control card, a 1.8 s dolly-in, 1 s of title. Same beats, compressed per beat (not a uniform ×0.43).
- End state = the phase-1 start world (alarm on, night_alarm, pilot slumped).

**`p1_intro` (1.2 s; retry 3.2 s)** — retry: `titleCard` phase 1 for 2 s first. Then `moveTo(OVERHEAD, 1.2)`.

**`p1_seat` (3 s)** — `moveTo(PILOT, 0.6)`; 0.6–1.8 the seat and pilot slide +0.4 m Z (`elastic.out(1, 0.5)`); `sfx("snore")` + a bigger "Zzz" (scale 1.6); 2.4 `moveTo(OVERHEAD, 0.6)`. End: `pilot.seat_back = true`.

**`p1_outro` (6 s)**

1. 0–2 at `OVERHEAD`: every overhead lamp turns green one by one, 0.15 s apart (local tween; the server sends the final lamp states at the end). `setLightRig("night_calm", 1.5)`.
2. 2–4 `moveTo(FLYER_DEFAULT, 1.5)`, `rollTo(0, 1.5)`. The clouds part (cloud density tween), the moon brightens, `sfx("music_sting")` (a short relieved arpeggio).
3. 4–6 `cut(EXT_SIDE)`: the plane flies level.
- End: `overhead_all_green`, night_calm.

**`p2_intro` (9 s)**

1. 0–1 `EXT_SIDE` continues. At 0.8 the `fire_side` engine explodes: `flash("#fff", 60)`, `sfx("boom")`, an expanding orange fireball (sphere 0 → 2.5 m, emissive, fade 0.6 s), then `WingFire` full on that side + smoke trail.
2. 1 `cut(FLYER_DEFAULT)`; `shakeFor(1.0, 1.2)`; `setLightRig("fire", 0.3)`; the `fire_bell` loop starts.
3. 2.5 `whip(params.fire_side === "left" ? LEFT_WINDOW : RIGHT_WINDOW)`, hold on the burning wing until 5.
4. 5–6 `moveTo(FLYER_DEFAULT, 1)`.
5. 6–8 `titleCard` "PHASE 2 — ENGINE FIRE" / "SIGNAL: WEAK ▮▮". Static ambience steps up to 0.02.
6. 8–9 `moveTo(PEDESTAL, 1.0)`.
- Retry: same timeline (`retry` param ignored on the Flyer).
- End = phase-2 start world.

**`p2_extinguish` (3 s)** — `moveTo(fire-side window, 0.5)`; 0.5 `sfx("whoosh")` + `fx burst foam` for 0.8 s; flames scale to 0 over 1 s; smoke thins to a wisp; 2.4 `moveTo(PEDESTAL, 0.6)`. End: `fire.level = wisp`, `fire_bell` off, night_calm.

**`p2_outro` (8 s)**

1. 0–2 at `PEDESTAL`: the engine hum drops; `pitchTo(-5, 1.5)`.
2. 2–4 `moveTo(FLYER_DEFAULT, 1.2)`; clouds darken (color tween); the first raindrops on the glass (droplets 0 → 20).
3. 4–6.5 `cut(EXT_CHASE)`: the plane, one propeller stopped (`stopped_side`), sinks into black storm clouds (plane y −3 over 2.5 s); distant lightning (2 small flashes).
4. 6.5–8 cut inside (`FLYER_DEFAULT`); rain gets heavy; `setLightRig("storm", 1.5)`; `pitchTo(0, 1)`.
- End: weather storm, light storm.

**`p3_intro` (7 s)**

1. 0–2 `FLYER_DEFAULT`; rain streaks; `restShake = 0.15` (turbulence for the whole phase until touchdown).
2. 2 a lightning double flash (directional 6 for 70 ms, off 60 ms, 4 for 50 ms + `flash("#dfe8ff", 80)`); `sfx("thunder")` at 2.8.
3. 2.5–5 `titleCard` "PHASE 3 — STORM LANDING" / "SIGNAL: LOST ▮". The HUD subtitle bar glitches once; three lifeline dots pop in.
4. 5–7 `moveTo(FRONT, 1.5)`.
- End = phase-3 start world.

**`lightning_strike` (1.5 s)** — directional to 6 for 70 ms, off 60 ms, 4 for 50 ms; `flash("#dfe8ff", 80)`; `sfx("thunder")` at 0.3; the front-panel lamps flicker randomly for 1 s (local emissive noise); `shakeFor(0.4, 0.5)`. When it ends, the server's `object_state` makes the observed lamp blink.

**`p3_runway_reveal` (4 s)** — 0–0.5 the two landing spotlights fade in; 0.5–2.5 fog 0.035 → 0.012; 0.8 the runway group becomes visible at z −600 with edge lights fading in (0.8–2.4); 1.0 `moveTo(FLYER_DEFAULT, 0.8)` (a glance out of the windshield), hold, 3.2 `moveTo(FRONT, 0.8)`. End: `landing_lights`, `runway = far`, fog 0.012.

**`p3_touchdown` (6 s)**

1. 0–2 `FLYER_DEFAULT`: the runway slides from z −600, y −40 to under the plane (y −1.2), `power2.in`; the approach lights streak past.
2. 2 touchdown (the Flyer's character, if visible in any later wide shot, is in `brace` until 4): camera bump −0.08 m and back in 200 ms; `sfx("screech")`; sparks (orange additive particles, 0.6 s) under both side windows; `shakeFor(0.6, 1.0)`.
3. 2–5 the runway streams past at 60 m/s; rain lightens (rain_light); `restShake = 0`.
4. 5–6 `moveTo(FRONT, 1.0)`. The runway keeps streaming until C8 succeeds.
- End: `runway = rolling`, turbulence 0, rain_light.

**`landing` (7 s)**

1. 0–3 `FLYER_DEFAULT`: the runway stream decelerates to 0 (`power3.out`); `sfx("squeal")`; nose dip `pitchTo(4, 0.4)` then settle to 0 over 1 s; engines spool down (`engine_hum` fades); the rain stops; clouds part; `setLightRig("dawn", 2.5)`; the sky cross-fades to dawn.
2. 3–5 `cut(EXT_FRONT_LOW)`: the plane stopped on the runway at sunrise, a wisp of smoke from the damaged engine (`damaged_side`).
3. 5–7 `cut(WIDE_INTERIOR)`: the Flyer's character does `cheer`; the pilot wakes, lifts his head, looks around; a "?" pops above him.
- End = the "After landing" world.

**`ending` (6 s; demo 4 s)** — a slow orbit around the exterior plane at dawn (along the `EXT_CHASE` path, 60°); title `end.landed` + `end.fuel_left` + `end.total_time` from params; last 0.8 s fade to cream (the deck appears when the server sends `deck` and status `DECK`).

**`crash` (5 s, not skippable)** — `flash("#fff", 120)`; `cut(EXT_SIDE)`; the plane spirals down cartoon-style (roll 720°, y −30 over 3 s, `power2.in`) leaving a corkscrew smoke trail; at 3.2 it vanishes into a big cartoon "POOF" cloud (white spheres puffing out with `back.out`) + `sfx("boom")` softened; 4 `crash.title` text; the Retry overlay is enabled from 5 s (§F20).

### F14.3 In-phase cinematic camera return

After `p1_seat`, `p2_extinguish`, `p3_runway_reveal` and `p3_touchdown`, the camera must be back at the station shot when the timeline ends (each timeline ends with a `moveTo(station shot)`).

### F14.4 Tower timelines (`towerTimelines.ts`)

| id | Tower 2D sequence |
| --- | --- |
| `prologue` | **PENDING REWRITE (matches the new 28 s Flyer prologue):** 0–8: the **tower window** (§F12.7) slides open and shows the takeoff from the control tower: the toy plane rolls down the runway, lifts off and climbs away into the dusk. 7.5: the window slides closed and the radar boots (rings draw in, sweep starts), with a green blip climbing. 8–10.5: the same `cin.time_skip` black card. 10.5–17: the radar cruising; at 17 the blip turns red, the radio crackles, and the MAYDAY stamp slams. 17–20: `cin.take_control_tower`. 20–21: black. 21–25.5: the manual cover. 25.5–28: the phase 1 title card. (Demo 12 s: compressed per beat, like the Flyer's.) |
| `p1_intro` | The manual cover opens (0.6 s), and the first card slides in. Retry: the title card for 2 s first. |
| `p1_seat` | Nothing (the radar keeps sweeping). |
| `p1_outro` | 0–2: every progress dot turns green one by one. 4–6: the "AUTOPILOT ENGAGED" banner; the blip turns green. The manual closes to the cover at 5.4. |
| `p2_intro` | 0.8: CSS screen shake 0.6 s; the blip turns red with the fire icon and `tower.engine_fire`. 6–8: the phase 2 title card. Static ambience steps up. **No side shown.** |
| `p2_extinguish` | 0.5–1.5: the fire icon morphs into the smoke icon; the blip turns amber. |
| `p2_outro` | Storm blobs drift in over the radar; the static rises; the manual closes to the cover at 7. |
| `p3_intro` | 2: the screen flashes once (lightning, a 60 ms white overlay at 40%). 2.5–5: the phase 3 title card; the subtitle column glitches once; three lifeline dots pop in. 5–7: the runway icon and glide-path line draw on the radar. |
| `lightning_strike` | A 60 ms white overlay at 30%; the radar flickers for 0.5 s. |
| `p3_runway_reveal` | The runway icon brightens and pulses twice. |
| `p3_touchdown` | 0–2: the blip slides onto the runway icon; 2: a small bounce of the blip. |
| `landing` | **PENDING:** 0–5.5: the **tower window** opens on the dawn runway seen from the tower; the toy plane rolls in from the left, braking (smoke wisps from **both** engines; see the privacy rule in §F12.7), and stops near the tower. 5.5: the window slides closed; the blip parks; then the LANDED stamp + confetti; the screen warms (a dawn-colored gradient overlay, 20%). |
| `ending` | The same title as the Flyer (`end.landed`, fuel, time); fade to cream. |
| `crash` | **PENDING:** 0–3.2: the **tower window** opens on the sky seen from the tower: far away, the toy plane spirals down (a symmetric smoke corkscrew) and vanishes into a big cartoon POOF cloud on the horizon. 3.2: the window closes; the blip spirals off the radar and pops into a tiny "POOF"; 4: `crash.title`; the Retry overlay from 5 s. |

## F15. Action feedback (not cinematics; no input lock)

Driven by `lastResult`, `fx` and toasts.

| Event | Flyer screen | Tower screen | Sound |
| --- | --- | --- | --- |
| Correct action (`action_result.success`) | The control's own animation already played; a green edge flash on the station (an emissive rim mesh around the panel, 0 → 1 → 0 in 400 ms); the progress pip fills with a pop | The matching row gets the green ✓ stamp (`row_index`); the progress dot fills | `chime` (both) |
| Wrong action | The control springs back (bounce); `shakeFor(0.5, 0.35)`; red vignette pulse 250 ms (DOM radial gradient #E5484D at 0.45 opacity); the fuel needle and bar drop with a red "−10" floating label | The rows flash ✗; the "Flyer used: {control} ×{count}" slip; the `last_wrong` note on the page; the fuel bar drops with "−10" | `buzzer` (both) |
| Crossover (`toast.crossover`) | Toast "CROSSOVER! +5s" (gold, scale-pop); the fuel bar "+5" in green | Same toast | `sparkle` (both) |
| Fuel under 20 s (while draining) | The fuel dial and bar pulse red | The fuel bar pulses red | `low_fuel` (two 600 Hz beeps every 2 s, both) |
| `both:static_dip` | `static` gain → 0 for 1.2 s | same | — |
| `both:signal_flash` | The signal bars flash full 3× over 1.2 s | same | — |
| `fx:shake:a:s`, `fx:yaw:side`, `fx:pitch_dip` | Camera rig helpers (`yaw` = `rollTo(±4, 0.4)` then back to 0 over 1.5 s, positive toward the stopped side) | — | — |
| `fx:lamp_flicker:ID` | That lamp's emissive flickers (noise) for 0.6 s | — | — |
| `fx:flicker_stop` | Stop any panel flicker | — | — |
| `fx:burst:foam` / `fx:burst:snuff` | A white puff at the burning nacelle | — | `whoosh` / soft `whoosh` |
| `sfx:<name>` / `sfx_stop:<loop>` | Play / stop | — | |

Toasts (`Toasts.tsx`): a stack at the top center, max 3, auto-hide after 2.5 s (crossover 2 s), in the viewer's language from `ToastKey`.

## F16. Audio

### F16.1 Microphone (`audio/mic.ts`)

```ts
export async function initMic(): Promise<void> {
  stream = await navigator.mediaDevices.getUserMedia({ audio: {
    channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  ctx = getAudioContext();                                   // shared with sfx (F16.3)
  await ctx.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
  const src = ctx.createMediaStreamSource(stream);
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7000;  // anti-alias
  node = new AudioWorkletNode(ctx, "pcm-worklet");
  analyser = ctx.createAnalyser(); analyser.fftSize = 512;
  src.connect(lp).connect(node); src.connect(analyser);     // the worklet output is not connected to speakers
  node.port.onmessage = (e) => onChunk(e.data as ArrayBuffer);  // 1,600 samples Int16 = 3,200 bytes
}
// pre-roll: keep the last 2 chunks (200 ms) in a ring buffer at all times
// level(): RMS of analyser time-domain data, mapped to 0..1 (x * 4, clamped)
```

Needs HTTPS or `localhost`. Permission state goes to `store.mic.permission`.

### F16.2 `audio/pcm-worklet.js`

```js
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;      // 3 at 48 kHz, 2.75625 at 44.1 kHz
    this.out = new Int16Array(1600); this.n = 0;
    this.acc = 0; this.cnt = 0; this.pos = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.cnt++; this.pos += 1;
      if (this.pos >= this.ratio) {                // box-average decimation (after the 7 kHz biquad)
        this.pos -= this.ratio;
        let s = this.acc / this.cnt; this.acc = 0; this.cnt = 0;
        s = Math.max(-1, Math.min(1, s));
        this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;   // Int16, little-endian on all target CPUs
        if (this.n === 1600) {
          this.port.postMessage(this.out.buffer, [this.out.buffer]);
          this.out = new Int16Array(1600); this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-worklet", PcmWorklet);
```

### F16.3 Push-to-talk (`audio/ptt.ts`)

- **Inputs:** hold Space (ignore `e.repeat`; ignore when focus is in an `input`, `textarea` or `contenteditable`; `preventDefault` to stop page scroll), or press and hold the on-screen mic button (`pointerdown` / `pointerup` / `pointerleave` / `pointercancel`). Window `blur` ends a transmission.
- **Start:** `send({type: "ptt_start"})`, play `radio_in` (quiet), set `transmitting`. Buffer chunks locally until the server's `channel` shows `busy_by === me.role`, then send the 2 pre-roll chunks followed by everything buffered, then stream each new chunk as a binary frame. On `error channel_busy`: stop, discard, show the busy state and toast.
- **End:** on release `send({type: "ptt_end"})`, play `radio_out` (squelch), stop streaming. Hold time under 300 ms: still send `ptt_end` (the server drops it as `too_short`). Auto-end at 12 s.
- Disabled (button greyed) while the partner holds the channel. Available during cinematics.
- **Mock rooms** (`welcome.mock_speech` or `room_state.mock_speech`): no mic, no PTT. `MockTalkBox` replaces it (§F18.2).
- **Ducking:** while `store.channel !== null` (either player), the ambience bus gain → 0.5× (150 ms ramp), back to 1 on release.

### F16.4 Procedural sound engine (`audio/sfx.ts`)

One shared `AudioContext` (created lazily; resumed on the first user gesture: the lobby click, Ready, or the "Click to enable sound" chip in split view).

```
master (volume slider × mute; default 0.5)
 ├─ sfxBus      (one-shots: clicks, chimes, buzzer, booms…)        gain 1.0
 ├─ ambienceBus (engine_hum, rain, static, alarms, bells, hiss)    gain 1.0, ducked to 0.5 while the radio is busy
 └─ radioBus    (radio_in / radio_out)                             gain 0.6
```

API: `sfx.play(name)`, `sfx.loop(name, on: boolean)`, `sfx.setParam(name, key, value)`. Every recipe is behind a name so it can later be swapped for a recorded file (Kenney audio packs are a good source) without code changes elsewhere: `RECIPES[name] = (ctx, dest) => Voice`.

| Name | Recipe | Used for |
| --- | --- | --- |
| `alarm_master` | Square wave alternating 880/660 Hz every 250 ms, gain 0.12, loop | `world.alarm` |
| `fire_bell` | Triangle 1200 Hz, amplitude-modulated at 12 Hz, gain 0.08, loop | `world.fire_bell` |
| `warning_beep` | Sine 1000 Hz, 120 ms, once per second, gain 0.08 | `world.warning_beep` |
| `click` | 5 ms white-noise burst, high-pass 2 kHz, gain 0.3 | buttons, switches |
| `clunk` | Sine 90 Hz with a 150 ms decay + a little noise, gain 0.4 | levers, handles, gear |
| `chime` | Sines 880 + 1320 Hz, 400 ms decay, gain 0.2 | correct action |
| `chime_soft` | `chime` at gain 0.1 and one octave lower | AP lamp, calm moments |
| `buzzer` | Sawtooth 110 Hz, 350 ms, low-pass 800 Hz, gain 0.25 | wrong action |
| `boom` | 1.2 s brown noise, low-pass sweeping 1200 → 100 Hz, plus sine 50 Hz, gain 0.5 | explosion, crash |
| `whoosh` | White noise, band-pass sweeping 400 → 3000 Hz over 0.8 s, gain 0.3 | extinguisher, bursts |
| `engine_hum` | Two detuned sawtooths 70/72 Hz, low-pass 300 Hz, gain 0.06, loop; pitch −15% for `one_engine`; slow ±1% wobble except for `steady`; fade out 3 s for `off` | always in flight |
| `static` | White noise, band-pass 1.5 kHz; gain = `world.static_level` (Flyer) or 0 / 0.02 / 0.04 by `signal_level` (Tower). Must stay quiet. | radio ambience |
| `rain` | Pink noise, low-pass 6 kHz, gain 0.08 (0.04 for rain_light), loop | phase 3 |
| `thunder` | 2.5 s brown noise with a slow attack and a rumbling 4 Hz LFO, gain 0.4 | lightning |
| `screech` | Sawtooth 1800 Hz with fast vibrato + noise, 0.6 s, gain 0.2 | touchdown |
| `squeal` | Sine 2400 Hz with slow vibrato, 1.5 s fade, gain 0.1 | braking |
| `snore` | Filtered noise with a 0.4 Hz swell, gain 0.05, every 3–4 s | pilot slumped |
| `sparkle` | A quick arpeggio 1046, 1318, 1568 Hz (60 ms each), gain 0.15 | crossover |
| `low_fuel` | Two short 600 Hz beeps every 2 s, gain 0.12 | fuel < 20 s |
| `radio_in` / `radio_out` | A short band-passed noise click / squelch, gain 0.15 | push-to-talk |
| `fuel_hiss` | White noise, high-pass 3 kHz, gain 0.03, loop | `world.fuel_hiss` |
| `motor_whirr` | Sawtooth 220 → 330 Hz glide over 0.8 s through a low-pass 900 Hz, gain 0.1 | flaps |
| `radio_crackle` | 0.6 s of noise bursts gated randomly, band-pass 2 kHz, gain 0.12 | prologue |
| `music_sting` | Triangle arpeggio C5–E5–G5–C6 (120 ms each) with a 1 s tail, gain 0.12 | `p1_outro` |
| `stamp` | Sine 70 Hz thump, 120 ms + a noise slap, gain 0.3 | Tower stamps |
| `page_turn` | Band-passed noise sweep 2 → 6 kHz, 250 ms, gain 0.08 | Tower page turn |

Keep the overall volume low: two laptops play sound in the same room while the players talk. Both screens have a master volume slider and a mute toggle.

**`useWorldAudio`:** the Flyer derives loops from `World` (alarm, warning_beep, fire_bell, fuel_hiss, engine_hum, rain, static, snore). The Tower runs only `static` (by signal level), `low_fuel`, one-shots and stamps.

## F17. Word deck (`ui/WordDeck.tsx`)

Shown when status is `DECK` and `store.deck` is set. In the player's own language.

- **Header:** the partner's portrait (`happy`, 120 px, in `partner_gender`) next to `deck.header` with N = `learned_count` (the N big, teal). Under it, the **mission report**: `deck.report` (Baloo 2, 20 px, Devanagari for a Hindi player); while `report_pending`, show `deck.report_loading` with a typing animation, replaced on `deck_report`.
- **Card grid** (4 columns at 1440 px, 3 at 1280 px): learned words first, then a `deck.still_learning` divider and the rest greyed (40% opacity, no badges). Each card:
  - the partner-language word large (`word`, Latin, Baloo 2 800, 40 px),
  - its meaning in the player's language (`meaning`, Devanagari when `meaning_script === "deva"`),
  - badges: `deck.understood` (when `understood ≥ 1`), `deck.said_it` (when `spoken ≥ 1`),
  - a ▶ button when `clip_url` is set: `new Audio(API_BASE + clip_url).play()`, with a playing state. Hidden in mock (no clips).
  - **Card visuals stay neutral** (cream card #FBF6EA, ink text); do not color-code by meaning.
- **Stats row** (`deck.stats`): fuel left per phase (`deck.stat_fuel`), wrong actions, lifelines used (mine / partner), total time (mm:ss).
- **Buttons:** **Play again** (`play_again`) and **Swap roles** (`swap_roles`). After pressing one, show `deck.waiting_vote` until the server moves on.
- Entry animation: the cards deal in one by one (40 ms stagger, `back.out`).

## F18. Dev mode (`VITE_DEV_MODE=1` and `welcome.dev_mode`)

### F18.1 Split view (`ui/DevSplit.tsx`)

`/dev/split?room=TEST&seed=42` (§F4). Two iframes side by side at 50% width (each renders its screen scaled to fit). A toolbar: room code, seed input, "new room", "swap languages" (reloads the iframes with `lang` swapped), bot toggles, "send Devanagari quick-say" toggle (posts to both iframes via `postMessage`, which sets `settings.sendDevanagari`). Since the iframes start without a user gesture, each shows "Click to enable sound" until clicked.

### F18.2 Mock talking

- `MockTalkBox` replaces the PTT whenever the room is mock: a text input (`mock.placeholder`) + Enter / **Send** → `say_text {text}`. ↑ recalls the last line. Focus with Enter when nothing is focused. The text box is also in demo rooms, collapsed behind a small keyboard icon (the stage safety net).
- **Flyer quick replies** (`QuickReplies.tsx`): chips from `flyer.quickReplies` above the text box; click = send `text` (or `alt_text` when sendDevanagari is on).
- **Tower quick-say:** the ▶ buttons on the manual (§F12.3).

### F18.3 Bots

Toggled in the dev panel or via `?bots=` (sends `dev bots`). The bots run on the server; the client only shows their subtitles and their effects.

### F18.4 Dev panel (`ui/DevPanel.tsx`, toggle with the backtick key)

A right-side drawer (400 px, monospace, dark), rendering `store.dev` (`dev_state`):

- **Live state:** room, status, phase, action id, seed, rolled vars, forced vars, expected steps (with done ticks), pending count, fuel, bots.
- **Exposure table:** per player, concept × heard / glossed / understood / spoken (20 rows).
- **Last utterance:** transcript, matches (start, end, concepts, side), segments as sent, latency; plus the latency sparkline (last 20, target line at 1500 ms).
- **Buttons and hotkeys** (hotkeys only while the panel is enabled and no input has focus): complete action (**N**), fail action (**F**), go to phase 1/2/3 (**1**, **2**, **3**), skip cinematic (**K**), set seed, force a var (dropdown of var + value), +60 s fuel, bots (Tower / Flyer), "send Devanagari" toggle.

### F18.5 Scene sandbox and cinematic scrubber (visual QA)

These routes exist so 3D and cinematic work can be checked frame by frame without a server or a second player. They use **the same components and timelines** as the real game (no forks, no copies), fed from `dev/fixtures.ts`. Only compiled when `VITE_DEV_MODE=1`.

- **`/dev/scene?world=<preset>&shot=<SHOT>&lamps=<list>&fps=1`**
  - `world` presets: `lobby`, `p1_start`, `p1_calm`, `p2_start`, `p2_half`, `p2_extinguished`, `p3_start`, `p3_runway`, `p3_rolling`, `landed` (the §A11 table plus the effects in between). `fire_side=left|right` picks the side.
  - `shot` = any §F10.1 shot id (default: the station shot of that preset).
  - `lamps=OH_MASTER_LAMP:red:blink:ring,FP_GEAR_LAMP_3:red` overrides object states.
  - `fps=1` shows an FPS / draw-call readout (`renderer.info`).
  - Arrow keys step through the shot list; `O` toggles OrbitControls for inspection only.
- **`/dev/cinematic?id=<id>&t=<seconds>&role=flyer|tower&lang=en|hi&fire_side=left&demo=0&retry=0&play=0`**
  - Builds the timeline locally (start from the preset world before that cinematic), then seeks to `t` paused, or plays from `t` with `play=1`.
  - A scrubber bar: a range slider over the full duration, play/pause, ±0.1 s step, jump to the hero beat (§F0.5), and the current camera shot, light rig and time readout.
- **`window.__wingin`** (dev builds only, from `dev/debugHooks.ts`):
  ```ts
  interface WinginDebug {
    ready: Promise<void>;                        // resolves after the first rendered frame with fonts loaded
    setWorld(preset: string, opts?: { fire_side?: Side }): Promise<void>;
    setShot(shot: string): Promise<void>;        // cut, then wait 2 frames
    seek(id: CinematicId, t: number, params?: Record<string, string | number | boolean>): Promise<void>;
    stats(): { fps: number; calls: number; triangles: number };
  }
  ```
  Playwright (the e2e suite or the Playwright MCP browser) navigates to these routes, awaits `__wingin.ready`, sets the frame, and screenshots.

**Visual QA loop:** for every 3D or cinematic change, open the relevant sandbox URL in a real GPU-backed Chrome (the project's Playwright MCP server, `.mcp.json`), take a 1440 × 900 screenshot, look at it, compare it with §F0 and the shot list, fix, and repeat. The frames in §F0.6 are the minimum set for M3.

## F19. Demo mode (presenter)

- In a demo room (`welcome.demo` or `room_state.demo`): a small DEMO badge in a corner; presenter hotkeys work without the dev panel: **N** → `presenter next_action`, **P** → `presenter next_phase` (`PresenterKeys.tsx`; ignored while typing).
- Prologue and ending are shorter (the durations come from the server). Phase 2 is auto-played by bots (subtitles still appear on both screens).
- Fuel shows 300 s.
- The keyboard-icon text box is available on both screens if speech fails on stage.
- Rehearse with the exact run-of-show in §A17.

## F20. Overlays and edge cases (`ui/Overlays.tsx`)

| Situation | Behavior |
| --- | --- |
| Reconnecting (socket closed) | Full-screen dim + spinner + `overlay.reconnecting`; all input disabled; on reconnect the snapshot restores everything (a running cinematic seeks to the right time) |
| PAUSED (partner disconnected) | Dim + `overlay.paused` with a 60 s countdown (from `game_state.server_ms`); PTT disabled; on resume, fade out |
| CRASH | After the crash timeline, a centered card: `crash.title` + **Retry** (`retry`); after pressing it, `crash.waiting` until both have voted (`retry_votes`) |
| Skip | A bottom-center Skip button for skippable cinematics (§F14.1) |
| Sound locked | The "Click to enable sound" chip until the AudioContext is running |
| Unsupported browser | No WebGL2 (Flyer) or no AudioWorklet (real mode) → a full-screen `overlay.unsupported` |
| Mic denied | The lobby blocks Ready (real mode) with `lobby.mic_denied` |
| Tab hidden | Keep the socket; timelines keep running on the server clock and catch up on return (the runner seeks) |
| Window resize | Canvas and Tower layout respond; the Tower scales below 1280 × 720 |
| Room not found / role taken | Back to the landing with a toast / disable that role card |
| `game_state.status === "LOBBY"` after abandon | Return to the lobby with `toast.partner_gone` |

## F21. Performance budget

- Target 60 fps on an M1 MacBook Air at 1440p (`dpr` capped at 1.5), and ≥ 45 fps on a 2020 Intel laptop with integrated graphics.
- Draw calls < 250: instance clouds, rain, runway lights, dashes and particles; merge static shell geometry where easy.
- No shadows, no textures beyond tiny generated canvases (particle sprites, sky gradient).
- Postprocessing: Bloom (`mipmapBlur`, luminanceThreshold 1.0, intensity 0.8) and Vignette (offset 0.3, darkness 0.35) only.
- `useFrame` callbacks avoid allocations (reuse vectors).
- The Tower screen is pure DOM/SVG; keep the radar sweep on CSS transforms.
- First load < 3 MB gzipped (fonts subset to latin + devanagari).

## F22. Testing

**Vitest (unit, jsdom):**

| Test | Checks |
| --- | --- |
| `strings.test.ts` | every key has non-empty `en` and `hi`; every `ToastKey` and error code is mapped; gendered keys have both `m` and `f` Hindi forms and `t()` picks by the right person's gender |
| `characterSelect.test.tsx` | Join is disabled until role, gender, language and name are set; a taken role is disabled; `join` carries `gender`; `update_player` on change |
| `clock.test.ts` | the best-RTT offset selection; `serverNow` |
| `store.test.ts` | the reducer for every S2C type (snapshots), bounce handling, subtitle trimming, translation reveal, rejoin `history` |
| `subtitles.test.tsx` | segments render in order; every keyword chip has the **same** class list whatever the concept; glosses in brackets; no Devanagari rendered from Latin segments; `twice` → one chip |
| `manual.test.tsx` | a fixture card renders find-out chips, the rule table, highlighter marks on keywords only, `last_wrong`, quick-say only when `quick_say` is set |
| `stations.test.ts` | grid → position mapping; every station control maps to a part component; the drawing renders every control |
| `timelines.test.ts` | each Flyer and Tower timeline (with stub refs) has `duration()` = the `cinematics.json` duration (±0.05 s), and the demo and retry variants too |
| `privacy.test.ts` | no file under `src/` imports `@content/lexicon.json` or `@content/phase*`; the built bundle (`dist/`) doesn't contain any authored line (grep a few Devanagari lines from the content files) |
| `worklet.test.ts` | the decimation produces 1,600-sample chunks at 48 kHz and 44.1 kHz; values clamp to Int16 |

**Playwright (e2e, against `docker compose up` with `MOCK_SPEECH=1 DEV_MODE=1`):**

1. `/dev/split?room=E2E1&seed=42&bots=both`: the prologue plays, Phase 1 starts, and the game reaches the deck within 6 minutes (bots playing); screenshots at each phase title.
2. Manual mock play: the Tower clicks quick-say, the Flyer clicks the right control → the step ticks; a wrong control → buzzer, fuel −10, "Flyer used" on the Tower.
3. Refresh the Flyer iframe mid-phase → it rejoins and the same action is active.
4. Phase 3 lifeline: click a Tower subtitle on the Flyer → the translation appears; the dots go 3 → 2.
5. **`visual.spec.ts`** (headed Chrome, 1440 × 900): for every frame in §F0.6, open `/dev/scene` or `/dev/cinematic`, await `__wingin.ready`, set the frame, and save a PNG to `client/e2e/__screenshots__/` (gitignored) for review. Assert no console errors and `stats().fps ≥ 30`. **No pixel-diff assertions** (WebGL output differs across GPUs); the screenshots are for human or agent review.

## F23. Frontend milestones (aligned with build spec §18)

| Milestone | Frontend scope | Done when |
| --- | --- | --- |
| **M0 Scaffold** | Vite app, Tailwind, fonts, router, `protocol.ts`, the content imports, compose service | `npm run dev` serves the landing page |
| **M1 Playable mock** | Socket + store, home page, character select (role, gender, language, name; placeholder portraits are fine), lobby, the cockpit shell with all three stations from `stations.json` (no effects), parts with interaction and bounce, the Tower screen with the manual card and progress, `MockTalkBox`, quick-say, quick replies, plain subtitles, `/dev/split`, simple cinematics (camera moves + title cards) | One person finishes the whole game in split view |
| **M2 Language engine UI** | Keyword chips + glosses, phase 3 lifelines, translation reveal, the dev panel exposure table, toasts | Subtitles visibly fade across the three phases |
| **M3 Look & feel** | Final 3D Flyer characters + first-person hands + 2D portraits (both genders), light rigs, sky, clouds, wing fire, rain, lightning, runway, the exterior plane, the pilot, every Flyer and Tower timeline, action feedback, all procedural sounds | The full game in split view looks and sounds like the shot lists, and every frame in the §F0.6 visual acceptance set has been captured and checked against §F0 |
| **M4 Real speech** | Mic init + level meter, worklet, pre-roll, PTT (Space + button), channel states, partial captions, ducking | Two people on two laptops play by voice |
| **M5 Word deck** | The deck screen, clip playback, the report with loading, play again / swap roles | The end screen plays the partner's real voice |
| **M6 Deploy** | Amplify (or S3 + CloudFront / Caddy) build with `VITE_WS_URL`/`VITE_API_URL` | The checklist passes on HTTPS |
| **M7 Demo polish** | Demo badge, presenter keys, the stage text box, a rehearsed run with the forced values | The §A17 run-of-show works three times in a row |

## F24. Frontend acceptance checklist

- [ ] `docker compose up`, open `/dev/split`: the prologue plays and Phase 1 starts with no other steps.
- [ ] The full game is finishable in Mock Mode with quick-say and quick replies, on both values of every variable, **in both language pairings**: (Flyer en, Tower hi) and (Flyer hi, Tower en). The English Tower's manual is fully in English; the Hindi Flyer's HUD, title cards and quick replies are in Hindi/Devanagari; subtitles are Latin for both.
- [ ] Only the current station's controls react; nothing reacts during cinematics or the gap; wrong controls spring back.
- [ ] A wrong action plays the buzzer, shake and red pulse, the fuel drops by 10, and the Tower sees "Flyer used …" in its language.
- [ ] Fuel at 0 plays the crash; Retry (both) restarts the phase with full fuel.
- [ ] Phase 1 subtitles show every keyword glossed; Phase 2 only some; Phase 3 none. The chip style is identical everywhere; no Devanagari in any subtitle.
- [ ] Phase 3 lifelines: 3 dots per player, a full translation revealed for 6 s then a free "show" link; a failed translation keeps the dot.
- [ ] Cinematics start within ~200 ms on two browsers (server clock); double skip works; a late joiner seeks.
- [ ] Refreshing a tab mid-game rejoins and resumes (same role via the sessionStorage token).
- [ ] Real mode: mic permission + level meter in the lobby; Space and the on-screen button both work; the channel-busy state shows; the ambience ducks while talking.
- [ ] The Tower manual matches the cockpit layout exactly (same grid), is fully in Devanagari for a Hindi Tower, never scripts sentences, and highlights every keyword identically.
- [ ] The Tower never shows the fire side or any lamp color; the Flyer never shows the manual.
- [ ] The word deck lists learned words first, plays the partner's voice, shows the report (or its loading state) and the stats; Play again and Swap roles work.
- [ ] Demo room: DEMO badge, N/P presenter keys, 300 s fuel, short prologue, phase 2 auto-play.
- [ ] The home page offers Start / Join / How to play; character select requires a gender; both players' portraits (in their genders) show in the lobby, on subtitles, on the PTT busy state and on the deck; the Flyer's 3D character matches their gender; Hindi strings about a person use the right gender.
- [ ] Every frame in the §F0.6 visual acceptance set matches the §F0 color script and shot rules (no clipping, readable labels, glowing lamps, subtitles clear of controls).
- [ ] The deployed build works over HTTPS/WSS with two laptops in one room.
