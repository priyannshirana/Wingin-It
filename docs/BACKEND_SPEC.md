# Wingin' it! — Backend Spec (MVP)

Nov 14, 2026 · companion to `docs/FRONTEND_SPEC.md` · derived from `Fade — Build Spec (MVP).md`

> **Characters:** players pick a male or female character for their role at join (§A2 rule 9); the server stores and relays it (`gender`).
>
> **Name:** the game is **Wingin' it!** (logo: WINGIN' IT!). The original build spec uses the working title *Fade*; wherever it says Fade, read Wingin' it!. Code identifiers use the prefix `wingin` (e.g. `wingin:token:…`, `wingin_games`).

This is the complete brief for the **Python game server and the content pipeline** of *Wingin' it!* Part A, the shared contract, appears word for word in the frontend spec too. Part B covers everything the backend owns: rooms, the state machine, the action judge, fuel, the language engine, speech, translation, the word deck, AWS, dev and demo tooling, validation, tests and deployment. An agent should be able to build the server from this document, the frontend spec and the content written here, with nothing else.

**How to read it**

- **Part A** = the contract with the client: messages, ids, timings, the world state, cinematics, the demo route. Don't break it.
- **Part B** = backend internals. Function names and module paths are prescriptive. Algorithms are given in pseudocode or Python.
- Copy the game lines exactly as written in §B5, including the Devanagari and the em dashes (—).
- When something is still ambiguous, choose the simplest thing that keeps the game playable and leave a `# SPEC-ASSUMPTION:` comment.

## Contents

- Part A — Shared Contract (A1–A17)
- Part B — Backend
  - B1 Responsibilities and principles
  - B2 Repo layout (server, content, scripts)
  - B3 Configuration
  - B4 Lexicon content (`content/lexicon.json`)
  - B5 Stations, manual terms and phase content (`stations.json`, `manual_terms.json`, `phase*.json`)
  - B6 Content loading and the validator
  - B7 Rooms, players, connections
  - B8 Game state machine
  - B9 Actions, randomization and the judge
  - B10 Fuel
  - B11 Language engine (normalize, match, romanize, segments, gloss, exposure, credits, crossover)
  - B12 Manual card builder
  - B13 Speech pipeline (mock + Amazon Transcribe)
  - B14 Translation and lifelines
  - B15 Word deck, clips, Bedrock report, DynamoDB
  - B16 Bots, dev commands, demo mode
  - B17 Security, limits, logging, metrics
  - B18 Testing
  - B19 Deployment (Docker, compose, ECS/ALB, EC2 + Caddy, CI)
  - B20 Backend milestones and done criteria
  - B21 Backend acceptance checklist

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
| `POST /api/rooms` | `{"demo"?: bool, "seed"?: int, "mock"?: bool}` | `{"code": "KXPD"}` | Creates a room. `demo` and `mock` overrides are honored only when the server has `DEV_MODE=1` or `DEMO_MODE=1` **[ASSUMPTION]**. `seed` honored only in Dev Mode. |
| `GET /api/rooms/{code}` | — | `{"exists": bool, "status": Status, "roles_taken": Role[], "demo": bool}` | Used by the join form before opening the socket. 404 → `{"exists": false}`. |
| `GET /clips/{clip_id}.wav` | — | `audio/wav` (16 kHz mono PCM16) | 404 if unknown. `Cache-Control: private, max-age=3600`. |
| `WS /ws/{code}` | — | — | One socket per player tab. Origin checked against `ALLOWED_ORIGINS`. |

Room codes: 4 uppercase letters from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I, no O, no digits). In Dev Mode a code may also be any 4 letters the client asks for (e.g. `TEST`): connecting to `/ws/TEST` creates it if it doesn't exist **[ASSUMPTION]** (needed by `/dev/split`).

## A5. WebSocket basics

- **Text frames** are JSON objects with a `type` field and the payload fields flat beside it: `{"type": "interact", "object_id": "OH_BTN_1", "verb": "press"}`.
- **Binary frames** (client → server only) are raw audio: mono, Int16 little-endian PCM, 16 kHz, normally 3,200 bytes (100 ms). Accepted only between a granted `ptt_start` and `ptt_end`. Max 6,400 bytes per frame.
- Max text frame 8 KB. `say_text.text` max 300 characters. `join.name` 1–16 characters, trimmed.

**Connection handshake**

```
client opens WS /ws/KXPD
server -> welcome      {server_ms, room_code, mock_speech, dev_mode, demo, gloss_threshold, version}
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
  dev_mode: boolean; demo: boolean; gloss_threshold: number; version: string }
interface Pong { type: "pong"; client_ms: number; server_ms: number }
interface Joined { type: "joined"; player_id: string; token: string; role: Role; lang: Lang; gender: Gender; name: string }

interface PlayerPublic { id: string; name: string; role: Role; lang: Lang; gender: Gender; ready: boolean;
  connected: boolean; is_bot: boolean }
interface RoomState { type: "room_state"; code: string; status: Status; demo: boolean;
  mock_speech: boolean; players: PlayerPublic[]; can_start: boolean;
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
- **Prologue change (Nov 14 2026, pending):** the prologue is now a 28 s movie-style opening (12 s in demo): takeoff, a "1.5 hours later" black card, the pilot dozing off, a "take control" card, black, then a zoom into the Flyer's eyes (Frontend §F14.2, §F14.4, §F12.7). `content/cinematics.json` must be updated to the new durations when this is built.
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
(12 s or double skip) → PHASE_INTRO(1): game_state, cinematic{p1_intro}, manual_card{null}
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
| 0:00 | Prologue (6 s): toy plane at night, pilot slumps, MAYDAY on the Tower radar, title "PHASE 1 — PILOT DOWN / SIGNAL STRONG" | Presenter: "The pilot passed out. One of them sees the cockpit, the other has the manual. They don't share a language." |
| 0:08 | P1_A1, master lamp blinking **red** | Tower: "Kaun si light jal rahi hai — laal ya neeli?" → Flyer sees *Kaun si [which] light jal rahi hai — laal [red] ya neeli [blue]?* → Flyer: "Red! The red one!" → Tower sees *Red [laal]! The red [laal] one!* → Tower: "Ek number button dabao — teen nahi!" → Flyer presses button 1. Alarm stops, cabin turns amber. |
| 0:30 | P1_A3 | Tower: "Teen number lever kheencho — chaar nahi!" → Flyer pulls handle 3 → `p1_seat`: pilot slides back snoring. |
| 0:42 | P1_A7 | Tower: "Chaar number switch band karo, phir ek number lever kheencho." → Flyer does both → `p1_outro`, "AUTOPILOT ENGAGED". |
| 0:55 | `p2_intro`: right engine explodes, "PHASE 2 — ENGINE FIRE / SIGNAL WEAK" | Presenter: "Now the signal weakens. Watch the brackets disappear for words they already know." Bots play B1 and B3 on screen. With the Phase 1 lines above, the Flyer sees *Daayan [right] laal [red] lever kheencho baayan [left] nahi!*: the new Phase 2 words keep their brackets, while *kheencho* and *nahi* (already glossed twice in Phase 1) have lost theirs. Exact output depends on what was actually said in Phase 1. |
| 1:25 | `p2_extinguish`, `p2_outro` into the storm | |
| 1:35 | `p3_intro`: "PHASE 3 — STORM LANDING / SIGNAL LOST", three lifeline dots | Presenter: "No translation at all now." |
| 1:45 | P3_C4 | Tower: "Peela switch chalu karo." → Flyer: "Yellow switch… on!" → runway reveal. |
| 2:00 | P3_C5, lightning, warning lamp **red** | Tower: "Kaun si light jal rahi hai — neeli ya laal?" → Flyer: "Laal!" (CROSSOVER! +5s toast) → Tower: "Teen number button dabao — ek nahi!" → Flyer taps the subtitle once to show the lifeline, then presses 3. |
| 2:20 | P3_C7 | Tower: "Ek number aur do number lever neeche karo." → touchdown, sparks. |
| 2:35 | P3_C8 | Tower: "Laal lever kheencho! Phir engine band karo!" → `landing` at dawn, pilot wakes, "?" |
| 2:45 | `ending` → word deck | Flyer's deck: "Your partner taught you N words", ▶ plays the Tower's real voice saying *laal*. |

**Demo safety nets:** if AWS speech fails on stage, create the room with `{"demo": true, "mock": true}` and use the type box; presenter key `N` completes a stuck action; `P` jumps to the next phase. Rehearse with the exact forced values above.

---

# Part B — Backend

## B1. Responsibilities and principles

The backend is **one Python process** (FastAPI + uvicorn). It holds all game state in memory and is the only source of truth.

It owns:

1. Rooms, players, tokens, connections and reconnects (§B7).
2. The game state machine and all timers: cinematics, gaps, debounce, fuel (§B8–B10).
3. Randomization with one seeded RNG per game (§B9).
4. Judging every `interact` (§B9).
5. The language engine: matching, romanizing, segments, gloss rule, exposure, credits, crossover (§B11).
6. Building the Tower's `manual_card` in the Tower's language from content (§B12).
7. Speech: mock (`say_text`) and Amazon Transcribe streaming (§B13).
8. Translation for lifelines and the word deck: mock index and Amazon Translate (§B14).
9. The word deck, voice clips, the Bedrock mission report and DynamoDB persistence (§B15).
10. Bots, dev commands, demo mode and presenter keys (§B16).
11. Content validation at startup and in CI. **If validation fails, the server refuses to start** (§B6).

Principles:

- **Mock first.** With `MOCK_SPEECH=1` nothing touches AWS, and the whole game is playable through `say_text`. Every AWS call sits behind an interface with a mock implementation.
- **Deterministic live loop.** Keyword matching, glossing and level rules are plain Python. No AI is used in the subtitle path.
- **Single event loop.** All room mutations happen on the asyncio loop. Blocking AWS SDK calls (boto3) run in `asyncio.to_thread`. Each room has an `asyncio.Lock` held while it handles one inbound message or timer callback, so handlers never interleave inside a room.
- **Generation-guarded timers.** Every scheduled callback captures `room.gen` (incremented on every state change, retry, goto, pause). A callback whose generation no longer matches does nothing. This removes a whole class of stale-timer bugs.
- **Send through queues.** Each connection has an outbound `asyncio.Queue` drained by one writer task, so two coroutines never write to the same WebSocket at once.

## B2. Repo layout

```
wingin-it/
  README.md                      # mock mode in 2 commands: `docker compose up`, open http://localhost:5173/dev/split
  docker-compose.yml
  .github/workflows/ci.yml       # validator + pytest + client typecheck/build
  docs/
    BACKEND_SPEC.md
    FRONTEND_SPEC.md
  content/
    lexicon.json                 # §B4
    stations.json                # §B5.1 (also read by the client)
    manual_terms.json            # §B5.2
    cinematics.json              # §A10 (also read by the client)
    demo.json                    # §A17
    phase1_pilot_down.json       # §B5.4
    phase2_engine_fire.json      # §B5.5
    phase3_storm_landing.json    # §B5.6
    validate_content.py          # §B6.2
  scripts/
    make_terminology.py          # Translate custom terminology from the lexicon
    make_vocabularies.py         # Transcribe custom vocabularies from the lexicon
    create_table.py              # DynamoDB table wingin_games
  server/
    requirements.txt
    Dockerfile
    pyproject.toml               # pytest + ruff config
    app/
      main.py                    # FastAPI app, routes, WS endpoint, startup validation
      config.py                  # env vars (§B3)
      constants.py               # §A14 numbers
      protocol.py                # pydantic models for every message in §A7/§A8
      rooms.py                   # Room, Player, Connection, registry, codes, tokens
      game.py                    # state machine, phases, world, effects, cinematic scheduling
      actions.py                 # ActionRun, judge, press/notch debounce
      fuel.py                    # fuel clock
      rng.py                     # seeded roller with forcing
      world.py                   # World model, phase start worlds, effect application
      content.py                 # load content JSON into typed models, template expansion
      manual.py                  # manual_card builder
      bots.py                    # Auto Tower / Auto Flyer
      dev.py                     # dev + presenter commands, dev_state
      language/
        normalize.py             # NFC, punctuation, Devanagari folding, digits
        lexicon.py               # Lexicon index + match()
        romanize.py              # Devanagari -> readable Latin
        subtitles.py             # segments + gloss rule
        exposure.py              # PlayerStats, credits, crossover
      speech/
        base.py                  # SpeechSession protocol, TranscriptResult, WordItem
        transcribe_aws.py
        transcribe_mock.py
        translate.py             # AwsTranslator, MockTranslator (authored-line index)
      audio.py                   # PCM buffer, WAV encoder, clip cutting
      deck.py                    # deck payload, stats, Bedrock report + template
      persistence.py             # DynamoDB writer + no-op
      logging_setup.py
    tests/
      conftest.py                # FakeSocket, room factory, fake clock
      test_normalize.py
      test_matcher.py
      test_romanize.py
      test_subtitles.py
      test_gloss_rule.py
      test_judge.py
      test_fuel.py
      test_credits.py
      test_lifelines.py
      test_privacy.py
      test_manual.py
      test_state_machine.py
      test_full_game_bots.py     # plays every branch path to the deck via bots
      test_mock_translate.py
      test_deck.py
  client/                        # see FRONTEND_SPEC.md
```

**`server/requirements.txt`** (pin to the latest stable versions at build time; these are minimums):

```
fastapi>=0.115
uvicorn[standard]>=0.32
pydantic>=2.9
rapidfuzz>=3.10
boto3>=1.35
amazon-transcribe>=0.6.2
python-multipart>=0.0.12
orjson>=3.10
pytest>=8.3
pytest-asyncio>=0.24
httpx>=0.27
```

The romanizer is the hand-written one in §B11.3, so no transliteration package is needed. `indic-transliteration` may be added as an optional comparison in tests only.

## B3. Configuration (`app/config.py`)

Read once at startup into a frozen `Settings` object (pydantic-settings or plain `os.environ`).

| Variable | Default | Meaning |
| --- | --- | --- |
| `MOCK_SPEECH` | `1` | `1` = `say_text` only; no Transcribe, Translate or Bedrock. `0` = real AWS. |
| `DEV_MODE` | `1` locally, `0` in prod images | Enables `dev` messages, `dev_state`, quick-say, ad-hoc room codes, `seed`. |
| `DEMO_MODE` | `0` | `1` = every new room is a demo room (§A17). |
| `AWS_REGION` | `us-east-1` | Must support Transcribe streaming for `hi-IN`. Check the supported-languages table before deploying. |
| `TRANSCRIBE_MULTI_LANG` | `0` | `0` = single language per speaker (the default). `1` = opt-in multi-language identification (`hi-IN,en-US`, the speaker's language preferred). See §B13.3. |
| `TRANSCRIBE_VOCAB_HI` / `TRANSCRIBE_VOCAB_EN` | empty | Optional custom vocabulary names. |
| `TRANSLATE_TERMINOLOGY` | empty | Optional custom terminology, e.g. `wingin-terms`. |
| `BEDROCK_MODEL_ID` | empty | Any text model enabled in the account. Empty = template report. |
| `DDB_TABLE` | empty | Results table (`wingin_games`). Empty = don't persist. |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated. CORS and WebSocket `Origin` check. In Dev Mode `localhost:*` and `127.0.0.1:*` are always allowed. |
| `GLOSS_THRESHOLD` | `2` | §B11.6 |
| `CONTENT_DIR` | `../content` (relative to `server/`), `/app/content` in Docker | |
| `PORT` | `8000` | |
| `LOG_LEVEL` | `INFO` | |
| `ROOM_IDLE_TTL_S` | `1800` | Delete a room this long after its last connection closes. |
| `MAX_ROOMS` | `200` | `POST /api/rooms` returns 503 above this. |

`say_text` is accepted when `room.mock_speech` is true, **or** `DEV_MODE=1`, **or** the room is a demo room (that is the stage safety net). `room.mock_speech` defaults to `MOCK_SPEECH`, and room creation may override it (§A4).

## B4. Lexicon (`content/lexicon.json`)

Exactly 20 concepts. Shape of one entry:

- `en.display` is the canonical English form. `en.variants` are the matching forms. `en.crossover` lists how a **Hindi** transcript spells the English word (Devanagari loan spellings).
- `hi.display_roman` / `hi.display_deva` are the canonical Hindi forms. `hi.variants` are Devanagari variants, each with its romanized display form. `hi.roman_variants` are every Latin spelling that should match (Mock Mode typing, and Latin tokens inside Hindi transcripts). `hi.crossover` lists how an **en-US** transcript spells the Hindi word.
- `multi`: multi-word variants (matched first, longest first).
- `special`: English `twice` = TWO + TIMES.

Matching normalization (lowercase, strip punctuation, apostrophes removed so `don't` → `dont`) is applied to the variants when the index is built, so the JSON stays human-readable.

```json
{
  "version": 1,
  "concepts": [
    {"id": "RED", "introduced_in": 1,
     "en": {"display": "red", "variants": ["red"], "crossover": ["रेड"]},
     "hi": {"display_roman": "laal", "display_deva": "लाल",
            "variants": [{"deva": "लाल", "roman": "laal"}],
            "roman_variants": ["laal", "lal"],
            "crossover": ["lal", "laal", "lull"]}},
    {"id": "GREEN", "introduced_in": 1,
     "en": {"display": "green", "variants": ["green"], "crossover": ["ग्रीन"]},
     "hi": {"display_roman": "hara", "display_deva": "हरा",
            "variants": [{"deva": "हरा", "roman": "hara"}, {"deva": "हरी", "roman": "hari"}, {"deva": "हरे", "roman": "hare"}],
            "roman_variants": ["hara", "hari", "hare"],
            "crossover": ["hara", "hurra"]}},
    {"id": "BLUE", "introduced_in": 1,
     "en": {"display": "blue", "variants": ["blue"], "crossover": ["ब्लू"]},
     "hi": {"display_roman": "neela", "display_deva": "नीला",
            "variants": [{"deva": "नीला", "roman": "neela"}, {"deva": "नीली", "roman": "neeli"}, {"deva": "नीले", "roman": "neele"}],
            "roman_variants": ["neela", "neeli", "neele", "nila", "nili"],
            "crossover": ["neela", "nila"]}},
    {"id": "ONE", "introduced_in": 1,
     "en": {"display": "one", "variants": ["one", "1"], "crossover": []},
     "hi": {"display_roman": "ek", "display_deva": "एक",
            "variants": [{"deva": "एक", "roman": "ek"}, {"deva": "१", "roman": "ek"}],
            "roman_variants": ["ek", "1"],
            "crossover": []}},
    {"id": "TWO", "introduced_in": 1,
     "en": {"display": "two", "variants": ["two", "2"], "crossover": []},
     "hi": {"display_roman": "do", "display_deva": "दो",
            "variants": [{"deva": "दो", "roman": "do"}, {"deva": "२", "roman": "do"}],
            "roman_variants": ["do", "2"],
            "crossover": []}},
    {"id": "THREE", "introduced_in": 1,
     "en": {"display": "three", "variants": ["three", "3"], "crossover": []},
     "hi": {"display_roman": "teen", "display_deva": "तीन",
            "variants": [{"deva": "तीन", "roman": "teen"}, {"deva": "३", "roman": "teen"}],
            "roman_variants": ["teen", "tin", "3"],
            "crossover": ["teen"]}},
    {"id": "FOUR", "introduced_in": 1,
     "en": {"display": "four", "variants": ["four", "4"], "crossover": []},
     "hi": {"display_roman": "chaar", "display_deva": "चार",
            "variants": [{"deva": "चार", "roman": "chaar"}, {"deva": "४", "roman": "chaar"}],
            "roman_variants": ["chaar", "char", "4"],
            "crossover": ["char"]}},
    {"id": "PRESS", "introduced_in": 1,
     "en": {"display": "press", "variants": ["press", "pressed", "pressing"], "crossover": ["प्रेस"]},
     "hi": {"display_roman": "dabao", "display_deva": "दबाओ",
            "variants": [{"deva": "दबाओ", "roman": "dabao"}, {"deva": "दबाइए", "roman": "dabaiye"}, {"deva": "दबाना", "roman": "dabana"}, {"deva": "दबा", "roman": "daba"}],
            "roman_variants": ["dabao", "dabaao", "dabaiye", "dabana", "daba"],
            "crossover": []}},
    {"id": "PULL", "introduced_in": 1,
     "en": {"display": "pull", "variants": ["pull", "pulled", "pulling"], "crossover": ["पुल"]},
     "hi": {"display_roman": "kheencho", "display_deva": "खींचो",
            "variants": [{"deva": "खींचो", "roman": "kheencho"}, {"deva": "खींचिए", "roman": "kheenchiye"}, {"deva": "खींचना", "roman": "kheenchna"}, {"deva": "खींच", "roman": "kheench"}],
            "roman_variants": ["kheencho", "kheecho", "khincho", "kheenchiye", "kheench", "kheenchna"],
            "crossover": []}},
    {"id": "ON", "introduced_in": 1,
     "en": {"display": "on", "variants": ["on"], "crossover": ["ऑन"]},
     "hi": {"display_roman": "chalu", "display_deva": "चालू",
            "variants": [{"deva": "चालू", "roman": "chalu"}],
            "roman_variants": ["chalu", "chaalu"],
            "crossover": []}},
    {"id": "OFF", "introduced_in": 1,
     "en": {"display": "off", "variants": ["off"], "crossover": ["ऑफ"]},
     "hi": {"display_roman": "band", "display_deva": "बंद",
            "variants": [{"deva": "बंद", "roman": "band"}, {"deva": "बन्द", "roman": "band"}],
            "roman_variants": ["band", "bandh", "bund"],
            "crossover": []}},
    {"id": "YES", "introduced_in": 1,
     "en": {"display": "yes", "variants": ["yes", "yeah", "yep", "yup"], "crossover": ["यस"]},
     "hi": {"display_roman": "haan", "display_deva": "हाँ",
            "variants": [{"deva": "हाँ", "roman": "haan"}, {"deva": "हां", "roman": "haan"}],
            "roman_variants": ["haan", "haa", "han"],
            "crossover": ["haan", "hun"]}},
    {"id": "NO", "introduced_in": 1,
     "en": {"display": "no", "variants": ["no", "not", "don't", "nope"], "crossover": ["नो"]},
     "hi": {"display_roman": "nahi", "display_deva": "नहीं",
            "variants": [{"deva": "नहीं", "roman": "nahi"}, {"deva": "नही", "roman": "nahi"}, {"deva": "मत", "roman": "mat"}],
            "roman_variants": ["nahi", "nahin", "nai", "mat"],
            "crossover": ["nahi", "nahin"]}},
    {"id": "WHICH", "introduced_in": 1,
     "en": {"display": "which", "variants": ["which"], "crossover": []},
     "hi": {"display_roman": "kaun sa", "display_deva": "कौन सा",
            "variants": [{"deva": "कौन सा", "roman": "kaun sa"}, {"deva": "कौन सी", "roman": "kaun si"}, {"deva": "कौन से", "roman": "kaun se"}, {"deva": "कौनसा", "roman": "kaunsa"}, {"deva": "कौनसी", "roman": "kaunsi"}],
            "roman_variants": ["kaun sa", "kaun si", "kaun se", "kaunsa", "kaunsi", "konsa", "kon sa"],
            "crossover": []}},
    {"id": "TIMES", "introduced_in": 1,
     "en": {"display": "times", "variants": ["times"], "crossover": []},
     "hi": {"display_roman": "baar", "display_deva": "बार",
            "variants": [{"deva": "बार", "roman": "baar"}],
            "roman_variants": ["baar", "bar"],
            "crossover": []}},
    {"id": "FIRE", "introduced_in": 2,
     "en": {"display": "fire", "variants": ["fire", "burning"], "crossover": ["फायर", "फ़ायर"]},
     "hi": {"display_roman": "aag", "display_deva": "आग",
            "variants": [{"deva": "आग", "roman": "aag"}],
            "roman_variants": ["aag", "aagh"],
            "crossover": ["aag", "ag"]}},
    {"id": "LEFT", "introduced_in": 2,
     "en": {"display": "left", "variants": ["left"], "crossover": ["लेफ्ट"]},
     "hi": {"display_roman": "baayan", "display_deva": "बायाँ",
            "variants": [{"deva": "बायाँ", "roman": "baayan"}, {"deva": "बायां", "roman": "baayan"}, {"deva": "बाएँ", "roman": "baayein"}, {"deva": "बाएं", "roman": "baayein"}, {"deva": "बाईं", "roman": "baayin"}],
            "roman_variants": ["baayan", "bayan", "baayaan", "baayein", "baaye", "baayin"],
            "crossover": []}},
    {"id": "RIGHT", "introduced_in": 2,
     "en": {"display": "right", "variants": ["right"], "crossover": ["राइट"]},
     "hi": {"display_roman": "daayan", "display_deva": "दायाँ",
            "variants": [{"deva": "दायाँ", "roman": "daayan"}, {"deva": "दायां", "roman": "daayan"}, {"deva": "दाएँ", "roman": "daayein"}, {"deva": "दाएं", "roman": "daayein"}, {"deva": "दाईं", "roman": "daayin"}],
            "roman_variants": ["daayan", "dayan", "daayaan", "daayein", "daaye", "daayin"],
            "crossover": []}},
    {"id": "YELLOW", "introduced_in": 2,
     "en": {"display": "yellow", "variants": ["yellow"], "crossover": ["येलो"]},
     "hi": {"display_roman": "peela", "display_deva": "पीला",
            "variants": [{"deva": "पीला", "roman": "peela"}, {"deva": "पीली", "roman": "peeli"}, {"deva": "पीले", "roman": "peele"}],
            "roman_variants": ["peela", "peeli", "peele", "pila", "pili"],
            "crossover": ["peela", "pila"]}},
    {"id": "DOWN", "introduced_in": 2,
     "en": {"display": "down", "variants": ["down"], "crossover": ["डाउन"]},
     "hi": {"display_roman": "neeche", "display_deva": "नीचे",
            "variants": [{"deva": "नीचे", "roman": "neeche"}],
            "roman_variants": ["neeche", "niche", "neechay"],
            "crossover": []}}
  ],
  "special": {
    "en_twice": {"variant": "twice", "concepts": ["TWO", "TIMES"]}
  },
  "on_off_guard_next": ["the", "a", "an", "top", "my", "your", "it", "this", "that"],
  "shared_words": [
    {"en": "light", "deva": ["लाइट", "लाईट"]},
    {"en": "button", "deva": ["बटन"]},
    {"en": "lever", "deva": ["लीवर", "लिवर"]},
    {"en": "switch", "deva": ["स्विच"]},
    {"en": "engine", "deva": ["इंजन", "इंजिन"]},
    {"en": "number", "deva": ["नंबर", "नम्बर"]},
    {"en": "pump", "deva": ["पंप", "पम्प"]},
    {"en": "fuel", "deva": ["फ्यूल"]},
    {"en": "autopilot", "deva": ["ऑटोपायलट"]},
    {"en": "overhead", "deva": ["ओवरहेड"]},
    {"en": "panel", "deva": ["पैनल"]},
    {"en": "pedestal", "deva": ["पेडेस्टल"]},
    {"en": "front", "deva": ["फ्रंट"]},
    {"en": "handle", "deva": ["हैंडल"]},
    {"en": "radio", "deva": ["रेडियो"]},
    {"en": "tower", "deva": ["टावर"]},
    {"en": "pilot", "deva": ["पायलट"]},
    {"en": "runway", "deva": ["रनवे"]},
    {"en": "gear", "deva": ["गियर"]},
    {"en": "flaps", "deva": ["फ्लैप्स", "फ़्लैप्स"]},
    {"en": "brake", "deva": ["ब्रेक"]},
    {"en": "ok", "deva": ["ओके"]},
    {"en": "alarm", "deva": ["अलार्म"]},
    {"en": "master", "deva": ["मास्टर"]}
  ],
  "romanize_overrides": {
    "करो": "karo", "या": "ya", "फिर": "phir", "और": "aur", "है": "hai", "हैं": "hain",
    "में": "mein", "जल": "jal", "रही": "rahi", "रहा": "raha", "अभी": "abhi", "भी": "bhi",
    "से": "se", "का": "ka", "को": "ko", "वाला": "wala", "वाली": "wali", "ठीक": "theek",
    "हो": "ho", "गया": "gaya",
    "गई": "gayi", "दिया": "diya", "हिल": "hil", "हम": "hum", "जा": "ja", "रहे": "rahe",
    "दिख": "dikh", "खींचा": "kheencha", "कर": "kar", "ने": "ne", "की": "ki", "के": "ke",
    "पे": "pe", "पर": "par", "यह": "yeh", "ये": "ye", "वो": "woh", "क्या": "kya", "रंग": "rang",
    "बस": "bas", "अब": "ab", "जल्दी": "jaldi", "मैं": "main", "तुम": "tum", "आप": "aap",
    "कौन": "kaun", "वाले": "wale", "तो": "toh", "बहुत": "bahut", "अच्छा": "accha",
    "देखो": "dekho", "बताओ": "batao", "सही": "sahi", "गलत": "galat", "ग़लत": "galat"
  }
}
```

**[ASSUMPTION]** `roman_variants` and the extra shared words (`alarm`, `master`, plus Devanagari spellings for every shared word) aren't in the build spec. The spec needs them for Latin matching and natural display. `pul` (पुल) also means "bridge" in Hindi, but the build spec lists it as a crossover spelling, so it stays.

## B5. Stations, manual terms and phase content

### B5.1 `content/stations.json`

This is the one layout file for both the 3D cockpit and the manual drawings (build spec §8.6). The client imports it. Grid rows count from the far edge of the panel (row 0) toward the Flyer. `span` = columns covered, `rowspan` = rows covered (default 1). `size: "big"` = the big variant (master lamp, extinguisher button, brake, engine switch). `color` is a palette name. `manual_name` is how the manual names the control. `parts` are the things a step can ask about (`find_out`), each with `members` (objects that get the "?" on the drawing).

```json
{
  "version": 1,
  "palette": {
    "red": "#E5484D", "green": "#30A46C", "blue": "#3E63DD", "yellow": "#F5C518",
    "white": "#D9D9E0", "grey": "#8B8D98"
  },
  "stations": [
    {
      "id": "overhead", "phase": 1,
      "name": {"en": "Overhead panel", "hi": "ओवरहेड पैनल"},
      "grid": {"cols": 7, "rows": 4},
      "controls": [
        {"id": "OH_GREEN_LAMP",  "type": "Lamp", "label": null, "color": "green", "row": 0, "col": 0, "default": {"kind": "lamp", "color": null, "blinking": false, "attention": false}, "manual_name": {"en": "green light", "hi": "हरी लाइट"}},
        {"id": "OH_MASTER_LAMP", "type": "Lamp", "size": "big", "label": null, "color": "white", "row": 0, "col": 3, "default": {"kind": "lamp", "color": null, "blinking": false, "attention": false}, "manual_name": {"en": "big center light", "hi": "बड़ी बीच वाली लाइट"}},
        {"id": "OH_AP_SCREEN",   "type": "Screen", "label": null, "color": "grey", "row": 0, "col": 5, "default": {"kind": "screen", "on": false}, "manual_name": {"en": "autopilot screen", "hi": "ऑटोपायलट स्क्रीन"}},
        {"id": "OH_AP_LAMP",     "type": "Lamp", "label": null, "color": "white", "row": 0, "col": 6, "default": {"kind": "lamp", "color": null, "blinking": false, "attention": false}, "manual_name": {"en": "right light", "hi": "दाईं लाइट"}},
        {"id": "OH_BTN_1", "type": "PushButton", "label": "1", "color": "white", "row": 1, "col": 0, "default": {"kind": "button"}, "manual_name": {"en": "button one", "hi": "एक नंबर बटन"}},
        {"id": "OH_BTN_2", "type": "PushButton", "label": "2", "color": "white", "row": 1, "col": 1, "default": {"kind": "button"}, "manual_name": {"en": "button two", "hi": "दो नंबर बटन"}},
        {"id": "OH_BTN_3", "type": "PushButton", "label": "3", "color": "white", "row": 1, "col": 2, "default": {"kind": "button"}, "manual_name": {"en": "button three", "hi": "तीन नंबर बटन"}},
        {"id": "OH_BTN_4", "type": "PushButton", "label": "4", "color": "white", "row": 1, "col": 3, "default": {"kind": "button"}, "manual_name": {"en": "button four", "hi": "चार नंबर बटन"}},
        {"id": "OH_BTN_RED",   "type": "PushButton", "label": null, "color": "red",   "row": 1, "col": 4, "default": {"kind": "button"}, "manual_name": {"en": "red button",   "hi": "लाल बटन"}},
        {"id": "OH_BTN_GREEN", "type": "PushButton", "label": null, "color": "green", "row": 1, "col": 5, "default": {"kind": "button"}, "manual_name": {"en": "green button", "hi": "हरा बटन"}},
        {"id": "OH_BTN_BLUE",  "type": "PushButton", "label": null, "color": "blue",  "row": 1, "col": 6, "default": {"kind": "button"}, "manual_name": {"en": "blue button",  "hi": "नीला बटन"}},
        {"id": "OH_SW_1", "type": "ToggleSwitch", "label": "1", "color": "grey", "row": 2, "col": 0, "default": {"kind": "toggle", "value": "on"},  "manual_name": {"en": "switch one",   "hi": "एक नंबर स्विच"}},
        {"id": "OH_SW_2", "type": "ToggleSwitch", "label": "2", "color": "grey", "row": 2, "col": 2, "default": {"kind": "toggle", "value": "off"}, "manual_name": {"en": "switch two",   "hi": "दो नंबर स्विच"}},
        {"id": "OH_SW_3", "type": "ToggleSwitch", "label": "3", "color": "grey", "row": 2, "col": 4, "default": {"kind": "toggle", "value": "on"},  "manual_name": {"en": "switch three", "hi": "तीन नंबर स्विच"}},
        {"id": "OH_SW_4", "type": "ToggleSwitch", "label": "4", "color": "grey", "row": 2, "col": 6, "default": {"kind": "toggle", "value": "on"},  "manual_name": {"en": "switch four",  "hi": "चार नंबर स्विच"}},
        {"id": "OH_HANDLE_1", "type": "PullHandle", "label": "1", "color": "grey", "row": 3, "col": 0, "default": {"kind": "handle", "value": "in"}, "manual_name": {"en": "lever one",   "hi": "एक नंबर लीवर"}},
        {"id": "OH_HANDLE_2", "type": "PullHandle", "label": "2", "color": "grey", "row": 3, "col": 2, "default": {"kind": "handle", "value": "in"}, "manual_name": {"en": "lever two",   "hi": "दो नंबर लीवर"}},
        {"id": "OH_HANDLE_3", "type": "PullHandle", "label": "3", "color": "grey", "row": 3, "col": 4, "default": {"kind": "handle", "value": "in"}, "manual_name": {"en": "lever three", "hi": "तीन नंबर लीवर"}},
        {"id": "OH_HANDLE_4", "type": "PullHandle", "label": "4", "color": "grey", "row": 3, "col": 6, "default": {"kind": "handle", "value": "in"}, "manual_name": {"en": "lever four",  "hi": "चार नंबर लीवर"}}
      ],
      "parts": [
        {"id": "OH_MASTER_LAMP", "members": ["OH_MASTER_LAMP"], "name": {"en": "big center light", "hi": "बड़ी बीच वाली लाइट"}},
        {"id": "OH_GREEN_LAMP",  "members": ["OH_GREEN_LAMP"],  "name": {"en": "green light", "hi": "हरी लाइट"}},
        {"id": "OH_AP_LAMP",     "members": ["OH_AP_LAMP"],     "name": {"en": "right light", "hi": "दाईं लाइट"}}
      ]
    },
    {
      "id": "pedestal", "phase": 2,
      "name": {"en": "Center pedestal", "hi": "पेडेस्टल"},
      "grid": {"cols": 4, "rows": 4},
      "controls": [
        {"id": "PD_FIRE_LAMP_L", "type": "Lamp", "label": "←", "color": "red", "row": 0, "col": 0, "default": {"kind": "lamp", "color": null, "blinking": false, "attention": false}, "manual_name": {"en": "left fire light",  "hi": "बाईं आग वाली लाइट"}},
        {"id": "PD_FIRE_LAMP_R", "type": "Lamp", "label": "→", "color": "red", "row": 0, "col": 3, "default": {"kind": "lamp", "color": null, "blinking": false, "attention": false}, "manual_name": {"en": "right fire light", "hi": "दाईं आग वाली लाइट"}},
        {"id": "PD_FIRE_HANDLE_L", "type": "PullHandle", "label": "←", "color": "red", "row": 1, "col": 0, "default": {"kind": "handle", "value": "in"}, "manual_name": {"en": "left red lever",  "hi": "बायाँ लाल लीवर"}},
        {"id": "PD_EXT_BTN", "type": "PushButton", "size": "big", "label": null, "color": "red", "row": 1, "col": 1, "span": 2, "default": {"kind": "button"}, "manual_name": {"en": "red button", "hi": "लाल बटन"}},
        {"id": "PD_FIRE_HANDLE_R", "type": "PullHandle", "label": "→", "color": "red", "row": 1, "col": 3, "default": {"kind": "handle", "value": "in"}, "manual_name": {"en": "right red lever", "hi": "दायाँ लाल लीवर"}},
        {"id": "PD_FUEL_SW_L", "type": "ToggleSwitch", "label": "←", "color": "yellow", "row": 2, "col": 0, "default": {"kind": "toggle", "value": "on"}, "manual_name": {"en": "left yellow switch",  "hi": "बायाँ पीला स्विच"}},
        {"id": "PD_PUMP_GREEN",  "type": "ToggleSwitch", "style": "mushroom", "label": null, "color": "green",  "row": 2, "col": 1, "default": {"kind": "toggle", "value": "off"}, "manual_name": {"en": "green pump",  "hi": "हरा पंप"}},
        {"id": "PD_PUMP_YELLOW", "type": "ToggleSwitch", "style": "mushroom", "label": null, "color": "yellow", "row": 2, "col": 2, "default": {"kind": "toggle", "value": "off"}, "manual_name": {"en": "yellow pump", "hi": "पीला पंप"}},
        {"id": "PD_FUEL_SW_R", "type": "ToggleSwitch", "label": "→", "color": "yellow", "row": 2, "col": 3, "default": {"kind": "toggle", "value": "on"}, "manual_name": {"en": "right yellow switch", "hi": "दायाँ पीला स्विच"}},
        {"id": "PD_LEVER_1", "type": "UpDownLever", "label": "1", "color": "grey", "row": 3, "col": 0, "default": {"kind": "lever", "value": "up"}, "manual_name": {"en": "lever one",   "hi": "एक नंबर लीवर"}},
        {"id": "PD_LEVER_2", "type": "UpDownLever", "label": "2", "color": "grey", "row": 3, "col": 1, "default": {"kind": "lever", "value": "up"}, "manual_name": {"en": "lever two",   "hi": "दो नंबर लीवर"}},
        {"id": "PD_LEVER_3", "type": "UpDownLever", "label": "3", "color": "grey", "row": 3, "col": 2, "default": {"kind": "lever", "value": "up"}, "manual_name": {"en": "lever three", "hi": "तीन नंबर लीवर"}},
        {"id": "PD_LEVER_4", "type": "UpDownLever", "label": "4", "color": "grey", "row": 3, "col": 3, "default": {"kind": "lever", "value": "up"}, "manual_name": {"en": "lever four",  "hi": "चार नंबर लीवर"}}
      ],
      "parts": [
        {"id": "PD_FIRE_LAMPS", "members": ["PD_FIRE_LAMP_L", "PD_FIRE_LAMP_R"], "name": {"en": "burning engine", "hi": "आग वाला इंजन"}},
        {"id": "WING_FIRE",     "members": ["PD_FIRE_LAMP_L", "PD_FIRE_LAMP_R"], "name": {"en": "the fire", "hi": "आग"}}
      ]
    },
    {
      "id": "front", "phase": 3,
      "name": {"en": "Front panel", "hi": "फ्रंट पैनल"},
      "grid": {"cols": 8, "rows": 3},
      "controls": [
        {"id": "FP_GEAR_LAMP_1", "type": "Lamp", "label": null, "color": "white", "row": 0, "col": 0, "default": {"kind": "lamp", "color": null, "blinking": false, "attention": false}, "manual_name": {"en": "light 1", "hi": "लाइट 1"}},
        {"id": "FP_GEAR_LAMP_2", "type": "Lamp", "label": null, "color": "white", "row": 0, "col": 1, "default": {"kind": "lamp", "color": null, "blinking": false, "attention": false}, "manual_name": {"en": "light 2", "hi": "लाइट 2"}},
        {"id": "FP_GEAR_LAMP_3", "type": "Lamp", "label": null, "color": "white", "row": 0, "col": 2, "default": {"kind": "lamp", "color": null, "blinking": false, "attention": false}, "manual_name": {"en": "light 3", "hi": "लाइट 3"}},
        {"id": "FP_WARN_LAMP",   "type": "Lamp", "label": null, "color": "white", "row": 0, "col": 4, "default": {"kind": "lamp", "color": null, "blinking": false, "attention": false}, "manual_name": {"en": "warning light", "hi": "चेतावनी लाइट"}},
        {"id": "FP_FIRE_LAMP",   "type": "Lamp", "label": null, "color": "red",   "row": 0, "col": 5, "default": {"kind": "lamp", "color": null, "blinking": false, "attention": false}, "manual_name": {"en": "fire light", "hi": "आग वाली लाइट"}},
        {"id": "FP_FUEL_GAUGE",  "type": "FuelGauge", "label": null, "color": "white", "row": 0, "col": 7, "rowspan": 2, "default": {"kind": "gauge"}, "manual_name": {"en": "fuel gauge", "hi": "फ्यूल मीटर"}},
        {"id": "FP_BTN_1", "type": "PushButton", "label": "1", "color": "white", "row": 1, "col": 0, "default": {"kind": "button"}, "manual_name": {"en": "button one",   "hi": "एक नंबर बटन"}},
        {"id": "FP_BTN_2", "type": "PushButton", "label": "2", "color": "white", "row": 1, "col": 1, "default": {"kind": "button"}, "manual_name": {"en": "button two",   "hi": "दो नंबर बटन"}},
        {"id": "FP_BTN_3", "type": "PushButton", "label": "3", "color": "white", "row": 1, "col": 2, "default": {"kind": "button"}, "manual_name": {"en": "button three", "hi": "तीन नंबर बटन"}},
        {"id": "FP_BTN_RED",   "type": "PushButton", "label": null, "color": "red",   "row": 1, "col": 4, "default": {"kind": "button"}, "manual_name": {"en": "red button",   "hi": "लाल बटन"}},
        {"id": "FP_BTN_GREEN", "type": "PushButton", "label": null, "color": "green", "row": 1, "col": 5, "default": {"kind": "button"}, "manual_name": {"en": "green button", "hi": "हरा बटन"}},
        {"id": "FP_LAND_SW", "type": "ToggleSwitch", "label": null, "color": "yellow", "row": 1, "col": 6, "default": {"kind": "toggle", "value": "off"}, "manual_name": {"en": "yellow switch", "hi": "पीला स्विच"}},
        {"id": "FP_LEVER_1", "type": "UpDownLever", "label": "1", "color": "grey", "row": 2, "col": 0, "default": {"kind": "lever", "value": "up"}, "manual_name": {"en": "lever one",   "hi": "एक नंबर लीवर"}},
        {"id": "FP_LEVER_2", "type": "UpDownLever", "label": "2", "color": "grey", "row": 2, "col": 1, "default": {"kind": "lever", "value": "up"}, "manual_name": {"en": "lever two",   "hi": "दो नंबर लीवर"}},
        {"id": "FP_LEVER_3", "type": "UpDownLever", "label": "3", "color": "grey", "row": 2, "col": 2, "default": {"kind": "lever", "value": "up"}, "manual_name": {"en": "lever three", "hi": "तीन नंबर लीवर"}},
        {"id": "FP_LEVER_4", "type": "UpDownLever", "label": "4", "color": "grey", "row": 1, "col": 3, "default": {"kind": "lever", "value": "up"}, "manual_name": {"en": "lever four",  "hi": "चार नंबर लीवर"}},
        {"id": "FP_FLAP_L", "type": "NotchLever", "label": "←", "color": "grey", "row": 2, "col": 4, "default": {"kind": "notch", "value": 0}, "manual_name": {"en": "left lever",  "hi": "बायाँ लीवर"}},
        {"id": "FP_FLAP_R", "type": "NotchLever", "label": "→", "color": "grey", "row": 2, "col": 5, "default": {"kind": "notch", "value": 0}, "manual_name": {"en": "right lever", "hi": "दायाँ लीवर"}},
        {"id": "FP_BRAKE", "type": "PullHandle", "size": "big", "label": null, "color": "red", "row": 2, "col": 6, "default": {"kind": "handle", "value": "in"}, "manual_name": {"en": "red lever", "hi": "लाल लीवर"}},
        {"id": "FP_ENGINE_SW", "type": "ToggleSwitch", "size": "big", "style": "guarded", "label": null, "color": "grey", "row": 2, "col": 7, "default": {"kind": "toggle", "value": "on"}, "manual_name": {"en": "engine switch", "hi": "इंजन स्विच"}}
      ],
      "parts": [
        {"id": "FP_GEAR_LAMPS", "members": ["FP_GEAR_LAMP_1", "FP_GEAR_LAMP_2", "FP_GEAR_LAMP_3"], "name": {"en": "the three lights", "hi": "तीन लाइटें"}},
        {"id": "FP_WARN_LAMP",  "members": ["FP_WARN_LAMP"], "name": {"en": "warning light", "hi": "चेतावनी लाइट"}},
        {"id": "FP_FIRE_LAMP",  "members": ["FP_FIRE_LAMP"], "name": {"en": "fire light", "hi": "आग वाली लाइट"}}
      ]
    }
  ]
}
```

Notes:

- Every colored control also differs by position (color-blind rule).
- `OH_AP_SCREEN` is decorative (`Screen`) and never interactive. The server sends its state from `world.ap_screen`.
- Role notes for the 3D build (not used by the server): OH_HANDLE_3 slides the pilot seat; OH_HANDLE_1 = autopilot; PD_LEVER_1/2 = left/right throttle, PD_LEVER_3 = descent, PD_LEVER_4 = decoy; FP_LEVER_1/2 = throttles, FP_LEVER_3 = decoy, FP_LEVER_4 = landing gear.

### B5.2 `content/manual_terms.json`

The words the manual builder uses to generate find-out chips and rule labels (build spec §13.3). **[ASSUMPTION]** The build spec gives only the verbs; the rest is authored here.

```json
{
  "verbs": {
    "press":      {"hi": "दबाओ",    "en": "press"},
    "pull":       {"hi": "खींचो",    "en": "pull"},
    "toggle_on":  {"hi": "चालू करो", "en": "turn on"},
    "toggle_off": {"hi": "बंद करो",  "en": "turn off"},
    "move_down":  {"hi": "नीचे करो", "en": "move down"},
    "move_up":    {"hi": "ऊपर करो",  "en": "move up"}
  },
  "count_words": {
    "hi": {"1": "एक", "2": "दो", "3": "तीन", "4": "चार"},
    "en": {"1": "one", "2": "two", "3": "three", "4": "four"}
  },
  "times_template": {"hi": "{n} बार", "en": "{n} times"},
  "rule_template": {"hi": "{object} {count} {verb}", "en": "{verb} {object} {count}"},
  "properties": {
    "color":     {"hi": "रंग?",       "en": "color?"},
    "lit":       {"hi": "चालू है?",    "en": "on?"},
    "side":      {"hi": "कौन सा?",    "en": "which one?"},
    "burning":   {"hi": "अभी भी है?", "en": "still there?"},
    "all_green": {"hi": "तीनों हरी?",  "en": "all three green?"}
  },
  "value_prefix_branch_on": {"FIRE_SIDE": {"hi": "आग:", "en": "fire:"}},
  "known_from": {"hi": "यह आपने कदम {n} में पता किया", "en": "You found this out in step {n}"},
  "own_words": {"hi": "अपने शब्दों में पूछो", "en": "Ask in your own words"},
  "own_words_say": {"hi": "अपने शब्दों में बोलो", "en": "Say it in your own words"}
}
```

### B5.3 Phase content schema

```text
Phase file
  phase: 1|2|3
  id: "pilot_down" | "engine_fire" | "storm_landing"
  name: {en, hi}
  station: StationId
  fuel_s: int
  signal: "strong" | "weak" | "lost"
  phase_vars: [PhaseVar]
  actions: [Action]                  # 5..8

PhaseVar
  var: str
  roll_at: "phase_start" | "effect"  # "effect" = rolled by a roll:<VAR> effect
  options: [Option]

Option
  value: ConceptId-like string       # RED, BLUE, YES, NO, LEFT, RIGHT ...
  weight: int
  lamp?: LampColor | null            # shorthand for lamps[observe.object]
  lamps?: {OBJ: LampColor | null}
  world?: {key: value}               # world mutations when this value is applied

Action
  id, title {en, hi}
  observe?: {var, object?, part, property, options?, attention?}
            # options omitted when var is a phase var; attention defaults to the lamps the option touches
  branch_on?: VAR                    # use an earlier phase var (no ask)
  ask?: Line                         # only with observe
  say?: Line                         # say-only actions
  branches?: [{when, say: Line, expect: [Step]}]
  expect?: [Step]                    # say-only actions
  unordered?: bool                   # default false
  keep_lamp?: bool                   # default false
  flyer_examples: {en: [str], hi: [str], hi_roman: [str]}   # same length, aligned by index
  hint: {en, hi}
  sticky: {en, hi}
  on_start: [Effect]
  on_success: [Effect]

Line  = {hi, hi_roman, en}
Step  = {object, verb, value?: "on"|"off", count?: int (default 1)}
```

**[ASSUMPTION]** `hint`, `sticky`, every `title.hi`, and the `flyer_examples` not given in the build spec are authored below. They are not validated for coverage (only `ask`/`say` lines are), but they go into the mock translation index.

### B5.4 `content/phase1_pilot_down.json`

```json
{
  "phase": 1, "id": "pilot_down",
  "name": {"en": "Pilot Down", "hi": "पायलट बेहोश"},
  "station": "overhead", "fuel_s": 150, "signal": "strong",
  "phase_vars": [],
  "actions": [
    {
      "id": "P1_A1",
      "title": {"en": "Silence the master alarm", "hi": "मास्टर अलार्म बंद करो"},
      "observe": {"var": "MASTER_COLOR", "object": "OH_MASTER_LAMP", "part": "OH_MASTER_LAMP", "property": "color",
                  "options": [{"value": "RED", "weight": 1, "lamp": "red"},
                              {"value": "BLUE", "weight": 1, "lamp": "blue"}]},
      "ask": {"hi": "कौन सी लाइट जल रही है — लाल या नीली?",
              "hi_roman": "Kaun si light jal rahi hai — laal ya neeli?",
              "en": "Which light is on — red or blue?"},
      "branches": [
        {"when": "RED",
         "say": {"hi": "एक नंबर बटन दबाओ — तीन नहीं!", "hi_roman": "Ek number button dabao — teen nahi!", "en": "Press button one — not three!"},
         "expect": [{"object": "OH_BTN_1", "verb": "press", "count": 1}]},
        {"when": "BLUE",
         "say": {"hi": "तीन नंबर बटन दबाओ — एक नहीं!", "hi_roman": "Teen number button dabao — ek nahi!", "en": "Press button three — not one!"},
         "expect": [{"object": "OH_BTN_3", "verb": "press", "count": 1}]}
      ],
      "flyer_examples": {"en": ["The red one!", "Blue!"], "hi": ["लाल वाली!", "नीली!"], "hi_roman": ["Laal wali!", "Neeli!"]},
      "hint": {"en": "Find out the color first, then check the rule.", "hi": "पहले रंग पता करो, फिर नियम देखो।"},
      "sticky": {"en": "Wrong button = 10 s of fuel gone!", "hi": "गलत बटन = 10 सेकंड ईंधन गया!"},
      "on_start": [],
      "on_success": ["sfx_stop:alarm_master", "world:alarm=false", "world:light_rig=night_calm"]
    },
    {
      "id": "P1_A2",
      "title": {"en": "Power the autopilot", "hi": "ऑटोपायलट को बिजली दो"},
      "say": {"hi": "दो नंबर स्विच चालू करो।", "hi_roman": "Do number switch chalu karo.", "en": "Turn switch two on."},
      "expect": [{"object": "OH_SW_2", "verb": "toggle", "value": "on"}],
      "flyer_examples": {"en": ["Switch two is on."], "hi": ["दो चालू हो गया।"], "hi_roman": ["Do chalu ho gaya."]},
      "hint": {"en": "Nothing to ask — just have it done.", "hi": "कुछ पूछना नहीं है — बस करवाओ।"},
      "sticky": {"en": "Switch up = on", "hi": "स्विच ऊपर = चालू"},
      "on_start": [],
      "on_success": ["world:ap_screen=true"]
    },
    {
      "id": "P1_A3",
      "title": {"en": "Slide the pilot back", "hi": "पायलट को पीछे खिसकाओ"},
      "say": {"hi": "तीन नंबर लीवर खींचो — चार नहीं!", "hi_roman": "Teen number lever kheencho — chaar nahi!", "en": "Pull lever three — not four!"},
      "expect": [{"object": "OH_HANDLE_3", "verb": "pull"}],
      "flyer_examples": {"en": ["Pulled! The pilot moved!"], "hi": ["खींच दिया! पायलट हिल गया!"], "hi_roman": ["Kheench diya! Pilot hil gaya!"]},
      "hint": {"en": "The levers are in the bottom row.", "hi": "लीवर सबसे नीचे वाली कतार में हैं।"},
      "sticky": {"en": "The pilot is asleep — let him snore.", "hi": "पायलट सो रहा है, सोने दो।"},
      "on_start": [],
      "on_success": ["cin:p1_seat", "world:seat_back=true"]
    },
    {
      "id": "P1_A4",
      "title": {"en": "Check the green light", "hi": "हरी लाइट जाँचो"},
      "observe": {"var": "GREEN_LIT", "object": "OH_GREEN_LAMP", "part": "OH_GREEN_LAMP", "property": "lit",
                  "options": [{"value": "YES", "weight": 1, "lamp": "green"},
                              {"value": "NO", "weight": 1, "lamp": null}]},
      "ask": {"hi": "हरी लाइट चालू है — हाँ या नहीं?", "hi_roman": "Hari light chalu hai — haan ya nahi?", "en": "Is the green light on — yes or no?"},
      "branches": [
        {"when": "YES",
         "say": {"hi": "एक नंबर स्विच बंद करो।", "hi_roman": "Ek number switch band karo.", "en": "Turn switch one off."},
         "expect": [{"object": "OH_SW_1", "verb": "toggle", "value": "off"}]},
        {"when": "NO",
         "say": {"hi": "तीन नंबर स्विच बंद करो।", "hi_roman": "Teen number switch band karo.", "en": "Turn switch three off."},
         "expect": [{"object": "OH_SW_3", "verb": "toggle", "value": "off"}]}
      ],
      "flyer_examples": {"en": ["No, it's off.", "Yes, it's green!"], "hi": ["नहीं!", "हाँ, हरी है!"], "hi_roman": ["Nahi!", "Haan, hari hai!"]},
      "hint": {"en": "The answer is yes or no.", "hi": "जवाब हाँ या नहीं में होगा।"},
      "sticky": {"en": "Dark light = no", "hi": "बुझी लाइट = नहीं"},
      "on_start": ["world:warning_beep=true"],
      "on_success": ["sfx_stop:warning_beep", "world:warning_beep=false"]
    },
    {
      "id": "P1_A5",
      "title": {"en": "Reset the radio", "hi": "रेडियो रीसेट करो"},
      "say": {"hi": "नीला बटन दो बार दबाओ।", "hi_roman": "Neela button do baar dabao.", "en": "Press the blue button two times."},
      "expect": [{"object": "OH_BTN_BLUE", "verb": "press", "count": 2}],
      "flyer_examples": {"en": ["Blue, twice. Done."], "hi": ["नीला, दो बार। हो गया।"], "hi_roman": ["Neela, do baar. Ho gaya."]},
      "hint": {"en": "The count matters.", "hi": "गिनती ज़रूरी है।"},
      "sticky": {"en": "Too many presses count as wrong!", "hi": "ज़्यादा दबाया तो गलत!"},
      "on_start": [],
      "on_success": ["both:static_dip", "both:signal_flash"]
    },
    {
      "id": "P1_A6",
      "title": {"en": "Autopilot light", "hi": "ऑटोपायलट लाइट"},
      "observe": {"var": "AP_COLOR", "object": "OH_AP_LAMP", "part": "OH_AP_LAMP", "property": "color",
                  "options": [{"value": "GREEN", "weight": 1, "lamp": "green"},
                              {"value": "RED", "weight": 1, "lamp": "red"}]},
      "keep_lamp": true,
      "ask": {"hi": "कौन सी लाइट जल रही है — हरी या लाल?", "hi_roman": "Kaun si light jal rahi hai — hari ya laal?", "en": "Which light is on — green or red?"},
      "branches": [
        {"when": "GREEN",
         "say": {"hi": "हरा बटन तीन बार दबाओ।", "hi_roman": "Hara button teen baar dabao.", "en": "Press the green button three times."},
         "expect": [{"object": "OH_BTN_GREEN", "verb": "press", "count": 3}]},
        {"when": "RED",
         "say": {"hi": "लाल बटन दो बार दबाओ।", "hi_roman": "Laal button do baar dabao.", "en": "Press the red button two times."},
         "expect": [{"object": "OH_BTN_RED", "verb": "press", "count": 2}]}
      ],
      "flyer_examples": {"en": ["Green!", "It's red!"], "hi": ["हरी है!", "लाल है!"], "hi_roman": ["Hari hai!", "Laal hai!"]},
      "hint": {"en": "Ask the color. Each color has its own count.", "hi": "रंग पूछो। हर रंग की गिनती अलग है।"},
      "sticky": {"en": "Have them count slowly.", "hi": "धीरे-धीरे गिनवाओ।"},
      "on_start": [],
      "on_success": ["lamp:OH_AP_LAMP=green", "sfx:chime_soft"]
    },
    {
      "id": "P1_A7",
      "title": {"en": "Engage the autopilot", "hi": "ऑटोपायलट चालू करो"},
      "say": {"hi": "चार नंबर स्विच बंद करो, फिर एक नंबर लीवर खींचो। ऑटोपायलट चालू? हाँ?",
              "hi_roman": "Chaar number switch band karo, phir ek number lever kheencho. Autopilot chalu? Haan?",
              "en": "Turn switch four off, then pull lever one. Autopilot on? Yes?"},
      "expect": [{"object": "OH_SW_4", "verb": "toggle", "value": "off"},
                 {"object": "OH_HANDLE_1", "verb": "pull"}],
      "flyer_examples": {"en": ["Yes! Autopilot is on!"], "hi": ["हाँ! चालू!"], "hi_roman": ["Haan! Chalu!"]},
      "hint": {"en": "Two things, in this order.", "hi": "दो काम, इसी क्रम में।"},
      "sticky": {"en": "Switch first, then lever!", "hi": "पहले स्विच, फिर लीवर!"},
      "on_start": [],
      "on_success": []
    }
  ]
}
```

### B5.5 `content/phase2_engine_fire.json`

```json
{
  "phase": 2, "id": "engine_fire",
  "name": {"en": "Engine Fire", "hi": "इंजन में आग"},
  "station": "pedestal", "fuel_s": 150, "signal": "weak",
  "phase_vars": [
    {"var": "FIRE_SIDE", "roll_at": "phase_start",
     "options": [{"value": "LEFT",  "weight": 1, "lamps": {"PD_FIRE_LAMP_L": "red"}, "world": {"fire_side": "left"}},
                 {"value": "RIGHT", "weight": 1, "lamps": {"PD_FIRE_LAMP_R": "red"}, "world": {"fire_side": "right"}}]}
  ],
  "actions": [
    {
      "id": "P2_B1",
      "title": {"en": "Pull the fire handle", "hi": "फ़ायर हैंडल खींचो"},
      "observe": {"var": "FIRE_SIDE", "part": "PD_FIRE_LAMPS", "property": "side",
                  "attention": ["PD_FIRE_LAMP_L", "PD_FIRE_LAMP_R"]},
      "keep_lamp": true,
      "ask": {"hi": "आग कौन से इंजन में है — बायाँ या दायाँ?", "hi_roman": "Aag kaun se engine mein hai — baayan ya daayan?", "en": "Which engine has the fire — left or right?"},
      "branches": [
        {"when": "LEFT",
         "say": {"hi": "बायाँ लाल लीवर खींचो — दायाँ नहीं!", "hi_roman": "Baayan laal lever kheencho — daayan nahi!", "en": "Pull the left red lever — not right!"},
         "expect": [{"object": "PD_FIRE_HANDLE_L", "verb": "pull"}]},
        {"when": "RIGHT",
         "say": {"hi": "दायाँ लाल लीवर खींचो — बायाँ नहीं!", "hi_roman": "Daayan laal lever kheencho — baayan nahi!", "en": "Pull the right red lever — not left!"},
         "expect": [{"object": "PD_FIRE_HANDLE_R", "verb": "pull"}]}
      ],
      "flyer_examples": {"en": ["Right! The right engine!", "Left! It's the left one!"], "hi": ["दायाँ! दायाँ इंजन!", "बायाँ! बायाँ वाला!"], "hi_roman": ["Daayan! Daayan engine!", "Baayan! Baayan wala!"]},
      "hint": {"en": "Which side? The Flyer can see it from the window.", "hi": "कौन सी तरफ़? फ़्लायर को खिड़की से आग दिखती है।"},
      "sticky": {"en": "You can't see the fire — ask!", "hi": "तुम्हें आग नहीं दिखती — पूछो!"},
      "on_start": [],
      "on_success": ["sfx:clunk", "fx:lamp_flicker:PD_FIRE_LAMP_{FIRE_SIDE.LR}"]
    },
    {
      "id": "P2_B2",
      "title": {"en": "Cut the fuel", "hi": "ईंधन काटो"},
      "branch_on": "FIRE_SIDE",
      "branches": [
        {"when": "LEFT",
         "say": {"hi": "बायाँ पीला स्विच बंद करो।", "hi_roman": "Baayan peela switch band karo.", "en": "Turn the left yellow switch off."},
         "expect": [{"object": "PD_FUEL_SW_L", "verb": "toggle", "value": "off"}]},
        {"when": "RIGHT",
         "say": {"hi": "दायाँ पीला स्विच बंद करो।", "hi_roman": "Daayan peela switch band karo.", "en": "Turn the right yellow switch off."},
         "expect": [{"object": "PD_FUEL_SW_R", "verb": "toggle", "value": "off"}]}
      ],
      "flyer_examples": {"en": ["Yellow switch is off."], "hi": ["पीला स्विच बंद।"], "hi_roman": ["Peela switch band."]},
      "hint": {"en": "The fire side — you found it in step 1.", "hi": "आग वाली तरफ़ — कदम 1 में पता चला था।"},
      "sticky": {"en": "Same side as the fire!", "hi": "आग वाली तरफ़ का स्विच!"},
      "on_start": [],
      "on_success": ["sfx_stop:fuel_hiss", "world:fuel_hiss=false", "world:fire_level=half"]
    },
    {
      "id": "P2_B3",
      "title": {"en": "Fire the extinguisher", "hi": "आग बुझाओ"},
      "observe": {"var": "STILL_BURNING", "object": "PD_FIRE_LAMP_{FIRE_SIDE.LR}", "part": "WING_FIRE", "property": "burning",
                  "options": [{"value": "YES", "weight": 7, "lamp": "red"},
                              {"value": "NO",  "weight": 3, "lamp": null, "world": {"fire_level": "smoke"}}]},
      "ask": {"hi": "आग अभी भी है — हाँ या नहीं?", "hi_roman": "Aag abhi bhi hai — haan ya nahi?", "en": "Is the fire still there — yes or no?"},
      "branches": [
        {"when": "YES",
         "say": {"hi": "लाल बटन दो बार दबाओ।", "hi_roman": "Laal button do baar dabao.", "en": "Press the red button two times."},
         "expect": [{"object": "PD_EXT_BTN", "verb": "press", "count": 2}]},
        {"when": "NO",
         "say": {"hi": "लाल बटन एक बार दबाओ।", "hi_roman": "Laal button ek baar dabao.", "en": "Press the red button one time."},
         "expect": [{"object": "PD_EXT_BTN", "verb": "press", "count": 1}]}
      ],
      "flyer_examples": {"en": ["Yes, still burning!", "No, the fire is out."], "hi": ["हाँ, अभी भी!", "नहीं, आग नहीं है।"], "hi_roman": ["Haan, abhi bhi!", "Nahi, aag nahi hai."]},
      "hint": {"en": "Still burning? Ask, then pick the count.", "hi": "आग अभी भी है? पूछो, फिर गिनती चुनो।"},
      "sticky": {"en": "The big round button", "hi": "बड़ा गोल बटन"},
      "on_start": [],
      "on_success": ["cin:p2_extinguish", "sfx_stop:fire_bell", "world:fire_bell=false", "world:fire_level=wisp",
                     "world:light_rig=night_calm", "lamp:PD_FIRE_LAMP_{FIRE_SIDE.LR}=off"]
    },
    {
      "id": "P2_B4",
      "title": {"en": "Shut the burning engine", "hi": "जलता इंजन बंद करो"},
      "branch_on": "FIRE_SIDE",
      "branches": [
        {"when": "LEFT",
         "say": {"hi": "एक नंबर लीवर नीचे करो।", "hi_roman": "Ek number lever neeche karo.", "en": "Move lever one down."},
         "expect": [{"object": "PD_LEVER_1", "verb": "move_down"}]},
        {"when": "RIGHT",
         "say": {"hi": "दो नंबर लीवर नीचे करो।", "hi_roman": "Do number lever neeche karo.", "en": "Move lever two down."},
         "expect": [{"object": "PD_LEVER_2", "verb": "move_down"}]}
      ],
      "flyer_examples": {"en": ["Lever one is down."], "hi": ["एक नंबर लीवर नीचे।"], "hi_roman": ["Ek number lever neeche."]},
      "hint": {"en": "Lever 1 = left engine, lever 2 = right engine.", "hi": "लीवर 1 = बायाँ इंजन, लीवर 2 = दायाँ इंजन।"},
      "sticky": {"en": "Remember the fire side?", "hi": "आग वाली तरफ़ याद है?"},
      "on_start": [],
      "on_success": ["world:propeller_stopped={FIRE_SIDE.lower}", "world:engine_hum=one_engine", "fx:yaw:{FIRE_SIDE.lower}"]
    },
    {
      "id": "P2_B5",
      "title": {"en": "Start the backup pump", "hi": "बैकअप पंप चालू करो"},
      "say": {"hi": "हरा पंप चालू करो — पीला नहीं!", "hi_roman": "Hara pump chalu karo — peela nahi!", "en": "Turn the green pump on — not yellow!"},
      "expect": [{"object": "PD_PUMP_GREEN", "verb": "toggle", "value": "on"}],
      "flyer_examples": {"en": ["Green pump on!"], "hi": ["हरा पंप चालू!"], "hi_roman": ["Hara pump chalu!"]},
      "hint": {"en": "There are two pumps — pick the right color.", "hi": "दो पंप हैं — सही रंग चुनो।"},
      "sticky": {"en": "Not the yellow one!", "hi": "पीला वाला नहीं!"},
      "on_start": [],
      "on_success": ["world:engine_hum=steady"]
    },
    {
      "id": "P2_B6",
      "title": {"en": "Start the descent", "hi": "नीचे उतरना शुरू करो"},
      "say": {"hi": "तीन नंबर लीवर नीचे करो — चार नहीं!", "hi_roman": "Teen number lever neeche karo — chaar nahi!", "en": "Move lever three down — not four!"},
      "expect": [{"object": "PD_LEVER_3", "verb": "move_down"}],
      "flyer_examples": {"en": ["Three is down. We're going down!"], "hi": ["तीन नीचे। हम नीचे जा रहे हैं!"], "hi_roman": ["Teen neeche. Hum neeche ja rahe hain!"]},
      "hint": {"en": "Don't touch lever 4.", "hi": "लीवर 4 को मत छूना।"},
      "sticky": {"en": "Down gently.", "hi": "धीरे से नीचे।"},
      "on_start": [],
      "on_success": []
    }
  ]
}
```

### B5.6 `content/phase3_storm_landing.json`

```json
{
  "phase": 3, "id": "storm_landing",
  "name": {"en": "Storm Landing", "hi": "तूफ़ान में लैंडिंग"},
  "station": "front", "fuel_s": 180, "signal": "lost",
  "phase_vars": [
    {"var": "GEAR_OK", "roll_at": "effect",
     "options": [{"value": "YES", "weight": 1, "lamps": {"FP_GEAR_LAMP_1": "green", "FP_GEAR_LAMP_2": "green", "FP_GEAR_LAMP_3": "green"}},
                 {"value": "NO",  "weight": 1, "lamps": {"FP_GEAR_LAMP_1": "green", "FP_GEAR_LAMP_2": "green", "FP_GEAR_LAMP_3": "red"}}]}
  ],
  "actions": [
    {
      "id": "P3_C1",
      "title": {"en": "Lower the landing gear", "hi": "लैंडिंग गियर नीचे करो"},
      "say": {"hi": "चार नंबर लीवर नीचे करो।", "hi_roman": "Chaar number lever neeche karo.", "en": "Move lever four down."},
      "expect": [{"object": "FP_LEVER_4", "verb": "move_down"}],
      "flyer_examples": {"en": ["Lever four is down."], "hi": ["चार नंबर लीवर नीचे।"], "hi_roman": ["Chaar number lever neeche."]},
      "hint": {"en": "The gear lever is the last of the four.", "hi": "गियर का लीवर चारों में आख़िरी है।"},
      "sticky": {"en": "Expect a loud clunk!", "hi": "धड़ाम की आवाज़ आएगी!"},
      "on_start": [],
      "on_success": ["sfx:clunk", "fx:shake:0.5:0.4", "roll:GEAR_OK", "show:GEAR_OK"]
    },
    {
      "id": "P3_C2",
      "title": {"en": "Confirm the gear", "hi": "गियर पक्का करो"},
      "observe": {"var": "GEAR_OK", "part": "FP_GEAR_LAMPS", "property": "all_green",
                  "attention": ["FP_GEAR_LAMP_1", "FP_GEAR_LAMP_2", "FP_GEAR_LAMP_3"]},
      "keep_lamp": true,
      "ask": {"hi": "तीन हरी लाइट चालू हैं — हाँ या नहीं?", "hi_roman": "Teen hari light chalu hain — haan ya nahi?", "en": "Are three green lights on — yes or no?"},
      "branches": [
        {"when": "YES",
         "say": {"hi": "हरा बटन एक बार दबाओ।", "hi_roman": "Hara button ek baar dabao.", "en": "Press the green button one time."},
         "expect": [{"object": "FP_BTN_GREEN", "verb": "press", "count": 1}]},
        {"when": "NO",
         "say": {"hi": "लाल बटन दो बार दबाओ।", "hi_roman": "Laal button do baar dabao.", "en": "Press the red button two times."},
         "expect": [{"object": "FP_BTN_RED", "verb": "press", "count": 2}]}
      ],
      "flyer_examples": {"en": ["No! Two green, one red!", "Yes, three green!"], "hi": ["नहीं, एक लाल है!", "हाँ, तीन हरी!"], "hi_roman": ["Nahi, ek laal hai!", "Haan, teen hari!"]},
      "hint": {"en": "All three lights matter.", "hi": "तीनों लाइटें देखनी हैं।"},
      "sticky": {"en": "Any red = no", "hi": "एक भी लाल = नहीं"},
      "on_start": [],
      "on_success": ["lamp:FP_GEAR_LAMP_1=green", "lamp:FP_GEAR_LAMP_2=green", "lamp:FP_GEAR_LAMP_3=green"]
    },
    {
      "id": "P3_C3",
      "title": {"en": "Set the flaps", "hi": "फ़्लैप्स सेट करो"},
      "say": {"hi": "बायाँ लीवर दो बार नीचे करो, दायाँ लीवर एक बार!", "hi_roman": "Baayan lever do baar neeche karo, daayan lever ek baar!", "en": "Move the left lever down two times, and the right lever one time!"},
      "unordered": true,
      "expect": [{"object": "FP_FLAP_L", "verb": "move_down", "count": 2},
                 {"object": "FP_FLAP_R", "verb": "move_down", "count": 1}],
      "flyer_examples": {"en": ["Left two, right one. Done."], "hi": ["बायाँ दो, दायाँ एक। हो गया।"], "hi_roman": ["Baayan do, daayan ek. Ho gaya."]},
      "hint": {"en": "Two levers, different counts. Any order.", "hi": "दो लीवर, अलग-अलग गिनती। क्रम कोई भी।"},
      "sticky": {"en": "Count each click.", "hi": "हर खटका गिनो।"},
      "on_start": [],
      "on_success": ["sfx:motor_whirr", "fx:pitch_dip"]
    },
    {
      "id": "P3_C4",
      "title": {"en": "Landing lights", "hi": "लैंडिंग लाइट"},
      "say": {"hi": "पीला स्विच चालू करो।", "hi_roman": "Peela switch chalu karo.", "en": "Turn the yellow switch on."},
      "expect": [{"object": "FP_LAND_SW", "verb": "toggle", "value": "on"}],
      "flyer_examples": {"en": ["Yellow switch on. I see the runway!"], "hi": ["पीला स्विच चालू। रनवे दिख रहा है!"], "hi_roman": ["Peela switch chalu. Runway dikh raha hai!"]},
      "hint": {"en": "You need light to find the runway.", "hi": "रनवे ढूँढने के लिए रोशनी चाहिए।"},
      "sticky": {"en": "There's only one yellow switch.", "hi": "पीला स्विच एक ही है।"},
      "on_start": [],
      "on_success": ["cin:p3_runway_reveal", "world:landing_lights=true", "world:fog=0.012", "world:runway=far"]
    },
    {
      "id": "P3_C5",
      "title": {"en": "Lightning strike", "hi": "बिजली गिरी!"},
      "observe": {"var": "WARN_COLOR", "object": "FP_WARN_LAMP", "part": "FP_WARN_LAMP", "property": "color",
                  "options": [{"value": "BLUE", "weight": 1, "lamp": "blue"},
                              {"value": "RED",  "weight": 1, "lamp": "red"}]},
      "ask": {"hi": "कौन सी लाइट जल रही है — नीली या लाल?", "hi_roman": "Kaun si light jal rahi hai — neeli ya laal?", "en": "Which light is on — blue or red?"},
      "branches": [
        {"when": "BLUE",
         "say": {"hi": "एक नंबर बटन दबाओ — तीन नहीं!", "hi_roman": "Ek number button dabao — teen nahi!", "en": "Press button one — not three!"},
         "expect": [{"object": "FP_BTN_1", "verb": "press", "count": 1}]},
        {"when": "RED",
         "say": {"hi": "तीन नंबर बटन दबाओ — एक नहीं!", "hi_roman": "Teen number button dabao — ek nahi!", "en": "Press button three — not one!"},
         "expect": [{"object": "FP_BTN_3", "verb": "press", "count": 1}]}
      ],
      "flyer_examples": {"en": ["Blue!", "Red! It's red!"], "hi": ["नीली!", "लाल! लाल है!"], "hi_roman": ["Neeli!", "Laal! Laal hai!"]},
      "hint": {"en": "Ask the warning light's color.", "hi": "चेतावनी लाइट का रंग पूछो।"},
      "sticky": {"en": "The light blinks after the flash.", "hi": "चमक के बाद लाइट टिमटिमाएगी।"},
      "on_start": ["event:lightning_strike"],
      "on_success": ["fx:flicker_stop", "sfx:chime_soft"]
    },
    {
      "id": "P3_C6",
      "title": {"en": "Fire scare", "hi": "आग का डर"},
      "observe": {"var": "FIRE_BACK", "object": "FP_FIRE_LAMP", "part": "FP_FIRE_LAMP", "property": "lit",
                  "options": [{"value": "YES", "weight": 1, "lamp": "red", "world": {"fire_level": "flicker"}},
                              {"value": "NO",  "weight": 1, "lamp": null}]},
      "ask": {"hi": "आग है — हाँ या नहीं?", "hi_roman": "Aag hai — haan ya nahi?", "en": "Is there a fire — yes or no?"},
      "branches": [
        {"when": "YES",
         "say": {"hi": "लाल बटन दो बार दबाओ!", "hi_roman": "Laal button do baar dabao!", "en": "Press the red button two times!"},
         "expect": [{"object": "FP_BTN_RED", "verb": "press", "count": 2}]},
        {"when": "NO",
         "say": {"hi": "हरा बटन एक बार दबाओ।", "hi_roman": "Hara button ek baar dabao.", "en": "Press the green button one time."},
         "expect": [{"object": "FP_BTN_GREEN", "verb": "press", "count": 1}]}
      ],
      "flyer_examples": {"en": ["Yes, fire!", "No fire."], "hi": ["हाँ, आग!", "आग नहीं।"], "hi_roman": ["Haan, aag!", "Aag nahi."]},
      "hint": {"en": "Check the fire light.", "hi": "आग वाली लाइट देखो।"},
      "sticky": {"en": "Dark light = no fire", "hi": "बुझी लाइट = आग नहीं"},
      "on_start": [],
      "on_success": ["fx:burst:snuff", "world:fire_level=wisp"]
    },
    {
      "id": "P3_C7",
      "title": {"en": "Throttles to idle", "hi": "थ्रॉटल आइडल पर"},
      "say": {"hi": "एक नंबर और दो नंबर लीवर नीचे करो।", "hi_roman": "Ek number aur do number lever neeche karo.", "en": "Move lever one and lever two down."},
      "unordered": true,
      "expect": [{"object": "FP_LEVER_1", "verb": "move_down"},
                 {"object": "FP_LEVER_2", "verb": "move_down"}],
      "flyer_examples": {"en": ["One and two are down."], "hi": ["एक और दो नीचे।"], "hi_roman": ["Ek aur do neeche."]},
      "hint": {"en": "Two levers, any order.", "hi": "दो लीवर, कोई भी क्रम।"},
      "sticky": {"en": "Runway coming up!", "hi": "रनवे आ रहा है!"},
      "on_start": [],
      "on_success": ["cin:p3_touchdown", "world:runway=rolling", "world:turbulence=0", "world:weather=rain_light"]
    },
    {
      "id": "P3_C8",
      "title": {"en": "Brake and shut down", "hi": "ब्रेक और इंजन बंद"},
      "say": {"hi": "लाल लीवर खींचो! फिर इंजन बंद करो!", "hi_roman": "Laal lever kheencho! Phir engine band karo!", "en": "Pull the red lever! Then turn the engine off!"},
      "expect": [{"object": "FP_BRAKE", "verb": "pull"},
                 {"object": "FP_ENGINE_SW", "verb": "toggle", "value": "off"}],
      "flyer_examples": {"en": ["Brake pulled. Engine off!"], "hi": ["ब्रेक खींचा। इंजन बंद!"], "hi_roman": ["Brake kheencha. Engine band!"]},
      "hint": {"en": "Brake first, then the engine.", "hi": "पहले ब्रेक, फिर इंजन।"},
      "sticky": {"en": "Big red lever = brake", "hi": "बड़ा लाल लीवर = ब्रेक"},
      "on_start": [],
      "on_success": []
    }
  ]
}
```

**Content notes**

- Observed lamps: when an action with `observe` activates, the server applies the rolled option (`lamp`/`lamps`/`world`), then marks the `attention` objects (default: the objects the option touches, falling back to `observe.object`) with `attention: true`, and sets `blinking: true` on the ones that are lit. A dark lamp ("no, it's off") keeps `color: null` but still gets the ring.
- When the action succeeds, attention rings are removed. Observed lamps go dark unless `keep_lamp: true`; kept lamps become steady (`blinking: false`).
- For phase variables (`FIRE_SIDE`, `GEAR_OK`), `observe` has no `options`: it reuses the phase variable's rolled value and its lamps.
- P2_B1 keeps the fire lamp steady red after success. It goes dark at the B3 extinguish (`lamp:...=off`).
- In P3_C5 the observed lamp is applied **after** `lightning_strike` ends (the build spec: "the observed lamp starts blinking when this ends").
- P3_C6 `YES` brings back a flame (`fire_level=flicker`) on the damaged wing.

## B6. Content loading and validation

### B6.1 Loading (`app/content.py`)

At startup `load_content(CONTENT_DIR)`:

1. Parse every JSON file into pydantic models (`Lexicon`, `Stations`, `ManualTerms`, `Cinematics`, `Demo`, `PhaseContent ×3`). Unknown keys are an error (`model_config = ConfigDict(extra="forbid")`).
2. Build indexes: `objects_by_id` (id → control + station), `parts_by_id`, `actions_by_id`, `phase_by_no`.
3. Run `validate_content.validate(content, matcher)` (§B6.2). On any failure: log the report and `sys.exit(1)`. `GET /health` is never reachable with bad content.
4. Build the `Lexicon` matcher index (§B11.2) and the mock translation index (§B14.1).

**Template expansion.** Strings may contain `{VAR.lower}`, `{VAR.LR}` (and `{DAMAGED_SIDE.*}`). `expand(s, vars)` replaces them: `LEFT` → `left` / `L`, `RIGHT` → `right` / `R`. It is applied to effect strings, `observe.object` and `attention` entries when an action activates. An unknown variable at runtime is a bug: raise.

### B6.2 `content/validate_content.py`

Run as `python content/validate_content.py` (adds `server/` to `sys.path`, imports `app.content` and `app.language.lexicon`, so it tests **the same matcher the game runs**). Exit code 0 = pass, 1 = fail. It also runs in CI and on server start.

Checks:

1. **Lexicon**
   - Exactly 20 concepts, unique ids, `introduced_in ∈ {1,2}`, exactly 15 with 1 and 5 with 2.
   - Every Hindi variant has non-empty `deva` and `roman`. Every `variants[].roman` is in `roman_variants`.
   - Within a language, no normalized variant maps to two concepts (check `en.variants`, `hi.variants[].deva`, `hi.roman_variants` separately; crossover lists are checked against the other side the same way).
   - No shared word (English or Devanagari) equals a variant of any concept.
2. **Stations**
   - Unique ids, ids prefixed `OH_`/`PD_`/`FP_` matching the station, grid cells inside the grid, no two controls overlap (taking `span`/`rowspan` into account), every `default.kind` matches the type, every part member exists on that station.
3. **Actions**
   - Each phase has 5–8 actions. Ids are unique and match `P{n}_`.
   - Every `expect` object exists **on that phase's station** (so it is visible in that phase's drawing), and every verb suits its type (§A6). `count ≥ 1`. `value` is present for `toggle` and absent otherwise. Counts > 1 only on `press` and NotchLever `move_down`.
   - `observe`: `part` exists on the station; `property` is in `manual_terms.properties`; option values (or the phase variable's values) equal the set of branch `when` values **exactly**; weights > 0; option lamps refer to Lamp objects.
   - `branch_on` refers to an earlier-rolled phase variable; its values equal the `when` set.
   - Exactly one of {`observe`+`ask`+`branches`, `branch_on`+`branches`, `say`+`expect`}.
   - Every `Line` has non-empty `hi`, `hi_roman`, `en`. `flyer_examples` lists have equal length ≥ 1.
   - Every effect string parses with the §A12 grammar; `cin:`/`event:` ids exist in `cinematics.json` with the right kind (`in_phase` for `cin`, `event` for `event`).
4. **Paths.** Enumerate every combination of variable values for the phase (the cartesian product of each distinct variable's values, so `FIRE_SIDE` is one dimension shared by B1, B2 and B4). For each path, the **Tower lines** = every `ask` + every top-level `say` + the branch `say` chosen by the path.
5. **Word rules.** For each path, and **separately for each of the three forms** (`hi` Devanagari, `hi_roman`, `en`), run the real matcher (speaker side only) on the Tower lines and count concept occurrences:
   - Phase 1: lines contain **only** Phase 1 concepts, and **each of the 15** occurs **≥ 2** times.
   - Phase 2: **each of the 5** Phase 2 concepts occurs **≥ 2** times.
   - Phase 3: **every one of the 20** concepts occurs **≥ 1** time.
   - **Required concepts**, for every phase, ≥ 1 on every path, WHICH exempt: derive per action from (a) the observed value chosen on the path (its concept id) and (b) each expect step of the chosen branch: the target control's color (`red/green/blue/yellow` → concept), digit label (`1–4` → ONE–FOUR), arrow label (`←` LEFT, `→` RIGHT), the verb (`press` PRESS, `pull` PULL, `toggle on` ON, `toggle off` OFF, `move_down` DOWN), and the count (if count > 1, or any other step or branch in the same action has a different count: the number concept + TIMES). Each required concept must appear in **that action's** lines on that path.
6. **Mock translation index.** No two different lines normalize to the same key with different counterparts (§B14.1).

Output: one coverage table per phase (rows = concepts, columns = paths, cells = min count over the three forms, failures marked `✗`), then `PASS` or a list of failures with the action id, path and form. Example:

```
Phase 1 — Pilot Down (4 paths × 3 forms)
concept   R/YES/G  R/YES/R  R/NO/G ... min  need
RED          4        5       4         4    2  ✓
...
PASS
```

## B7. Rooms, players, connections (`app/rooms.py`)

```python
@dataclass
class Connection:
    ws: WebSocket
    queue: asyncio.Queue            # outbound frames (dict or bytes-free; server never sends binary)
    writer: asyncio.Task
    player_id: str | None = None
    msg_times: deque                # rate limiting

@dataclass
class Player:
    id: str                         # "p_" + 8 hex
    token: str                      # secrets.token_urlsafe(24)
    name: str
    role: Role
    lang: Lang
    gender: Gender                  # "male" | "female", chosen at join (§A2 rule 9)
    ready: bool = False
    is_bot: bool = False
    conn: Connection | None = None
    disconnected_at: float | None = None
    stats: PlayerStats              # §B11.7, reset per game
    lifelines: int = 3

@dataclass
class Room:
    code: str
    created_at: float
    demo: bool
    mock_speech: bool
    seed_override: int | None
    status: Status = "LOBBY"
    paused_from: Status | None = None
    players: dict[Role, Player]     # at most one per role
    spectators: set[Connection]     # connected but not joined yet
    lock: asyncio.Lock
    gen: int = 0                    # timer generation (B1)
    game: Game | None = None        # created at PROLOGUE, kept through DECK
    bots: dict[Role, bool]          # bot toggles
    play_again_votes: set[Role]
    swap_votes: set[Role]
    last_activity: float
```

**Registry.** `rooms: dict[str, Room]`. `create_room()` picks a random unused code from `ABCDEFGHJKLMNPQRSTUVWXYZ`⁴. A cleanup task runs every 60 s and deletes rooms with no connected human for `ROOM_IDLE_TTL_S` (and frees their clips).

**WebSocket endpoint (`/ws/{code}`).**

1. Check `Origin` against `ALLOWED_ORIGINS` (close 4403 if it's not allowed). Uppercase the code. If the room doesn't exist: in Dev Mode create it; otherwise send `error room_not_found` and close 4404.
2. Create the `Connection` with its writer task, add it to `room.spectators`, send `welcome` and `room_state`.
3. Loop: `receive()`. Text → parse JSON → `protocol.parse_c2s()` (pydantic discriminated union on `type`; invalid → `error bad_message`, don't close). Bytes → `speech.on_audio_frame()`. Each message is handled under `async with room.lock`.
4. On disconnect: cancel the writer and call `on_disconnect(player)`.

**`join` handling.**

- Valid `token` matching a player in this room → rebind: `player.conn = conn`, `disconnected_at = None`, send `joined`, then the **rejoin snapshot**: `room_state`, `game_state`, `flyer_view` or `manual_card` (by role), `history` (the partner's last 5 utterances for this listener, with translations they already revealed), `channel`, the running `cinematic` (same `start_at_ms`, so the client seeks), and `deck` if in DECK. If the room was PAUSED and both humans are now connected → resume (§B8.4).
- No token: the role is free → create a `Player` (`name` trimmed to 16 chars, HTML-stripped; `gender` required, validated as `male`/`female` by the pydantic model). Role held → `error role_taken` (Dev Mode: take over a disconnected slot).
- `update_player` (LOBBY only): change name/role/lang/gender; resets `ready` for that player.
- After any roster change: broadcast `room_state` with `can_start` and `block_reason`:
  - `missing_player` if either role has no player (a bot counts as present when that role's bot is on in Dev Mode),
  - `same_language` if both have the same `lang`,
  - `not_ready` if anyone isn't ready (bots are always ready),
  - otherwise `can_start = true` and the server immediately starts the game (§B8).

**`send(player, msg)`** serializes with `orjson` and puts it on the connection queue (dropped if the player is disconnected). `broadcast(room, msg_for_role: Callable[[Role], dict | None])` builds per-role payloads; this is the only place role filtering happens, which keeps privacy auditable. `test_privacy.py` wraps this function.

## B8. Game state machine (`app/game.py`)

### B8.1 The Game object

```python
@dataclass
class Game:
    id: str                          # "g_" + uuid4 hex
    seed: int
    rng: Roller                      # §B9.1
    started_at: float
    phase: int = 0
    route: dict[int, list[str]]      # full game or demo route
    world: World
    objects: dict[str, ObjectState]  # all stations
    run: ActionRun | None            # current action
    action_index: int = -1
    completed: int = 0
    phase_vars: dict[str, str]       # FIRE_SIDE, GEAR_OK, ...
    damaged_side: str | None
    fuel: FuelClock
    cinematic: RunningCinematic | None   # id, start_at_ms, duration_ms, params, kind, skip_votes, on_end
    retry_votes: set[Role]
    attempts: dict[int, int]
    phase_stats: dict[int, PhaseStats]   # fuel_left, wrong, lifelines_used, time
    utterances: list[Utterance]
    action_log: list[CreditEvent]    # §B11.7 (reset per action attempt)
    last_wrong: LastWrong | None
    crossover_paid: dict[str, set[str]]  # player_id -> concepts paid
```

### B8.2 Transitions

```
start_game():                               # both ready, languages differ
    game = Game(seed = room.seed_override or random 31-bit)
    world = LOBBY world; objects = all station defaults
    enter(PROLOGUE)  -> play("prologue") then enter_phase_intro(1)

enter_phase_intro(n, retry=False):
    status = PHASE_INTRO; phase = n; manual_card(null) to tower
    play(f"p{n}_intro", params={retry}, tower params filtered) then enter_playing(n)

enter_playing(n):
    status = PLAYING
    world = phase_start_world(n)            # A11 table
    reset station n objects to defaults; demo + n==3: apply demo.phase3_preset
    roll phase_vars with roll_at == "phase_start" (FIRE_SIDE), apply their lamps/world
    if n == 3: damaged_side = game.phase_vars.get("FIRE_SIDE") or roll it
    fuel.reset(content fuel_s or demo 300); fuel.start()
    lifelines: 3 each (enabled only if n == 3)
    action_index = -1; completed = 0
    send flyer_view, game_state
    activate_next_action()

activate_next_action():
    action_index += 1
    if action_index == len(route[phase]): return enter_phase_outro(phase)
    run = ActionRun(action, rolled branch)   # §B9
    apply observe lamps (unless on_start has event:)
    send flyer_view (interactive = station ids), manual_card(card), game_state
    if on_start has event:X -> play(X) with on_end = make_action_active (+ apply observe lamps)
    bots.on_action_activated()

on_action_success():
    action_result(success) to both; fx; lamps off unless keep_lamp; attention off
    credits (B11.7); completed += 1; run.active = False
    if on_success has cin:X: play(X) then (apply deferred world/lamp effects, flyer_view,
                                          schedule(500 ms, activate_next_action))   # the cinematic already gave the pause
    else: schedule(NEXT_ACTION_DELAY_MS, activate_next_action)

enter_phase_outro(n):
    status = PHASE_OUTRO; record phase_stats[n]; fuel.stop()
    id = {1:"p1_outro", 2:"p2_outro", 3:"landing"}[n]
    play(id) then (world end-state; n < 3 ? enter_phase_intro(n+1) : enter_ending())

enter_ending():
    status = ENDING; deck.prepare(game)  (starts Bedrock calls now)
    persistence.save(game) (background)
    play("ending", params={fuel_left_s,total_time_s}) then enter_deck()

enter_deck(): status = DECK; send each player their deck (report may be pending)

on_fuel_empty():
    status = CRASH; cancel run timers; fuel.stop(); crash{phase} to both
    play("crash") (no auto end); retry_votes = {}

on_retry(role): (CRASH only, after the 5 s crash cinematic has ended or immediately — either is fine)
    retry_votes.add(role); broadcast retry_votes (bots vote at once)
    if both: attempts[phase] += 1; reset action_log; lifelines = 3;
             enter_phase_intro(phase, retry=True)
```

`play(id, params, on_end)`:

1. Look up `cinematics.json`. Duration = demo duration when the room is a demo and one exists, `retry_duration_ms` when `params.retry`.
2. `start_at_ms = now_ms + lead_ms`. Store `game.cinematic`. Set `input_locked = true`; pause fuel if PLAYING (`in_phase`/`event`).
3. Broadcast `cinematic` with role-filtered params (Tower: drop `fire_side`, `stopped_side`, `damaged_side`). Broadcast `game_state`.
4. `schedule(duration + lead, finish)` guarded by `gen`. `finish()`: clear `game.cinematic`, `input_locked = false`, resume fuel if PLAYING, then `on_end()`.

**Skip.** `skip_cinematic` from a role → if the running cinematic is skippable, add to `skip_votes`, broadcast `skip_votes`. Bots' roles count as voted. When both voted → broadcast `cinematic_skip {id}`, bump `gen` (cancels the pending finish) and call `finish()` now. Dev `skip_cinematic` skips straight away.

### B8.3 Every state change broadcasts `game_state`

Build it per role from `game` (identical for both roles: it contains no secrets). `radar` is derived:

| Situation | blip | icon | storm | runway | glide_path | landed |
| --- | --- | --- | --- | --- | --- | --- |
| LOBBY / start of PROLOGUE | green | null | false | false | false | false |
| PROLOGUE after the pilot dozes off (17 s; demo 7 s), phase 1 until A1 succeeds | red | mayday | | | | |
| Phase 1 after A1 | amber | null | | | | |
| After p1_outro | green | null | | | | |
| Phase 2 until B3 | red | fire | | | | |
| Phase 2 after B3 | amber | smoke | | | | |
| p2_outro onward | amber | null | true | | | |
| Phase 3 | amber | null | true | true | true | |
| landing onward | green | null | false | true | false | true |

`progress` = `completed / total_actions` of the current phase. (Time-based radar changes inside cinematics are animated by the client; the server just sends the end state.)

### B8.4 Pause and resume

- `on_disconnect(player)`: mark disconnected. If status ∈ {PROLOGUE, PHASE_INTRO, PLAYING, PHASE_OUTRO, ENDING, CRASH} → `paused_from = status`, `status = PAUSED`, `gen += 1` (freezes every timer), `fuel.pause()`, release the radio channel if they held it (abort their Transcribe stream), toast `toast.partner_left` to the other player. Schedule `abandon()` after 60 s (guarded by a separate pause token).
- If a cinematic was running when the pause began, remember it. **On resume** it is completed instantly (its `finish()` runs, applying the end state) **[ASSUMPTION]**. If the paused state was PLAYING with an active action, the action stays active and its partial press counts are reset. Any pending 1.5 s "next action" gap restarts in full.
- Resume when every human player is connected again: `status = paused_from`, `fuel.resume()` if PLAYING, broadcast `game_state`, toast `toast.partner_back`.
- `abandon()`: the game is dropped (persist nothing), `status = LOBBY`, the absent player removed, the present one set to not ready, toast `toast.partner_gone`.
- In LOBBY and DECK a disconnect only marks the player disconnected; after 60 s the slot is freed. A slot freed in DECK also ends the finished game like `abandon()` (nothing more is persisted: the game was saved at ENDING): `status = LOBBY`, deck votes cleared, the remaining player set to not ready, `room_state` + `game_state` broadcast, toast `toast.partner_gone`. A new partner can then join the empty seat and both readying starts a new `Game` with a new seed.

### B8.5 Play again / swap roles (DECK only)

- `play_again`: votes per role (bots vote at once). Both → new `Game` with a new seed (or the same `seed_override` in Dev Mode), same roles → PROLOGUE.
- **Votes:** each player has exactly **one current vote** (`play_again` or `swap_roles`); a later vote replaces that player's earlier one. The server acts only when both players' current votes are the same; mismatched votes just wait. Broadcast `room_state.play_again_votes` (the roles whose current vote is play_again) after every vote.
- `swap_roles`: both → swap the two players' roles, **keep each player's language and gender**, set both not ready → LOBBY. Tokens stay valid (the client re-keys its sessionStorage entry on the new role from `joined`, which the server re-sends to both after the swap).

## B9. Actions, randomization and the judge (`app/actions.py`, `app/rng.py`)

### B9.1 Seeded roller

```python
class Roller:
    def __init__(self, seed: int): self.r = random.Random(seed); self.forced = {}
    def roll(self, var: str, options: list[Option]) -> Option:
        if var in self.forced: return next(o for o in options if o.value == self.forced.pop(var))
        total = sum(o.weight for o in options)
        x = self.r.random() * total
        for o in options:
            x -= o.weight
            if x < 0: return o
        return options[-1]
```

- One `Roller` per game. Rolls happen in a fixed order (phase start, then each action as it activates, then effects), so the same seed always gives the same game. A retry keeps using the same RNG, so the retry gets **new** randomization.
- Demo rooms preload `forced` from `demo.json.force` at each phase start (forced values persist across retries in demo).
- Dev `force {var, value}` sets `forced[var]` for the next roll.
- Observe variables are rolled **when the action activates**, never earlier. `FIRE_SIDE` is rolled at phase 2 start. `GEAR_OK` is rolled by the `roll:GEAR_OK` effect in C1.

### B9.2 ActionRun

```python
@dataclass
class ActionRun:
    action: Action
    value: str | None                # rolled/branch_on value
    branch_index: int | None
    steps: list[Step]                # chosen branch's expect, or top-level expect (templates expanded)
    unordered: bool
    done: list[bool]
    pending: Pending | None          # {step_index, object_id, verb, count, timer_gen, start_state}
    active: bool                     # false during on_start event and after success
    wrong_count: int = 0
```

### B9.3 The judge: `on_interact(object_id, verb)`

```
if role != flyer: error not_your_role
if status != PLAYING or game.cinematic or not run or not run.active:
    -> object_state(current, bounce=True) for moving parts; no penalty; return
obj = objects_by_id[object_id]
if obj.station != current station: -> bounce, no penalty, return       # clicks on other stations ignored
if verb not valid for obj.type (A6): error bad_message; return

# finalize a pending count on a different object first
if run.pending and run.pending.object_id != object_id:
    ok = finalize_pending()                  # may produce a wrong action and reset partials
    if ok is False: pass                     # the new interaction is still judged below

candidates = [i for i, s in enumerate(steps) if not done[i]]
if not run.unordered: candidates = candidates[:1]
match = first i in candidates with steps[i].object == object_id

if match is None:
    reason = "wrong_order" if object_id in (objects of not-done steps) else "wrong_object"
    return wrong(reason, object_id, verb, count=1)

step = steps[match]
switch obj.type:
  PushButton (press):
      start/extend pending(match) -> count += 1; object_state(button, bounce=False)
      schedule(PRESS_DEBOUNCE_MS, finalize_pending) guarded by pending.timer_gen
  NotchLever:
      if verb == "move_up": return wrong("wrong_direction") with bounce
      if notch == 2: return wrong("wrong_count") with bounce
      notch += 1; object_state(notch, bounce=False)      # visible immediately
      pending count += 1; reschedule finalize
  ToggleSwitch (toggle):
      new = opposite(current)
      if new == step.value: set state; object_state(new); step_done(match)
      else: wrong("wrong_direction", bounce, state unchanged)
  PullHandle (pull):
      if current == "out": bounce, no penalty     # already pulled
      else: set "out"; object_state; step_done(match)
  UpDownLever:
      if verb == "move_down" and current == "up" and step.verb == "move_down": set "down"; step_done
      else: wrong("wrong_direction", bounce)

finalize_pending():
    p = run.pending; run.pending = None
    if p.count == steps[p.step].count: step_done(p.step); return True
    if NotchLever: restore notch to p.start_state; object_state(bounce=True)
    wrong("wrong_count", p.object_id, p.verb, count=p.count); return False

step_done(i): done[i] = True; if all(done): on_action_success()

wrong(reason, object_id, verb, count):
    run.pending = None (partial counts reset; completed steps kept)
    run.wrong_count += 1; phase_stats.wrong += 1
    fuel.add(-WRONG_PENALTY_S)
    flyer: object_state(unchanged state, bounce=True) for moving parts
    both: action_result(success=False, reason, fuel_delta=-10, completed_steps, total_steps)
          tower also: used = {object_id, label = manual_name segments in tower lang, verb, count}
    game.last_wrong = {label: rule-style label of what was done, count}
    tower: manual_card (with last_wrong)
    game_state; if fuel <= 0: on_fuel_empty()
```

**Rules restated (build spec §5).**

- Press and notch counting: the server counts interactions on the object. `PRESS_DEBOUNCE_MS` after the **last** one it compares to `count`. Equal = step done; different = wrong.
- Interacting with a different object while a count is pending finalizes that count at once **[ASSUMPTION]** (so for C3, `L, R, L` quickly = L finalized at 1 ≠ 2 → wrong).
- Wrong = any interaction on the current station that doesn't match the next expected step. The control animates and springs back (`bounce: true`); its state doesn't change. Completed steps are kept; partial counts reset.
- Clicks during the 1.5 s gap or during a cinematic are ignored with no penalty (but bounce so the client's optimistic animation returns).
- `dev complete_action` / presenter `next_action`: mark all steps done, set every expected object to its target state (send `object_state`s), then `on_action_success()` with `reason "dev"` internally.
- `dev fail_action`: `wrong("wrong_object", ...)` with `used` = the first expected object.

### B9.4 Rule-row index for the Tower

On success the Tower gets `row_index` = the chosen branch index (0 for say-only). On failure it gets `used`. Neither is sent to the Flyer (the Flyer doesn't need them).

## B10. Fuel (`app/fuel.py`)

```python
class FuelClock:
    max_s: float; left_s: float; running: bool; paused: bool; t0: float  # monotonic
    def start(): running = True; t0 = monotonic()
    def value(): return left_s - (monotonic() - t0 if running and not paused else 0)
    def pause(): left_s = value(); paused = True
    def resume(): paused = False; t0 = monotonic()
    def add(delta): left_s = value() + delta; t0 = monotonic(); clamp to [0, ∞)  # crossover may exceed max; cap at max_s + 30
```

- Drains only in PLAYING while no cinematic/event runs and not PAUSED. It **does** drain in the 1.5 s gap between actions.
- A room ticker task runs every 100 ms per active game: if `value() <= 0` → `on_fuel_empty()`. It broadcasts `game_state` every `FUEL_BROADCAST_MS` while draining.
- Wrong action −10 s. Crossover +5 s, once per concept per player per game.
- `dev add_fuel {seconds}` adds directly.
- At phase end, `phase_stats[n].fuel_left_s = round(value(), 1)`.

## B11. Language engine (`app/language/`)

### B11.1 Normalization and tokenization (`normalize.py`)

```python
DEVA = re.compile(r"[ऀ-ॿ]")
PUNCT = "।॥.,!?;:\"“”‘’'()[]{}—–-…/\\"   # dashes and quotes included

def tokenize(text: str) -> list[Token]:
    """Split on whitespace and punctuation. Keeps every token's (start, end) offsets in the
    original NFC string. Apostrophes inside Latin words are removed for matching (don't -> dont)
    but kept in display text. Returns Token(raw, start, end, norm, script)."""

def norm_token(raw: str) -> str:
    s = unicodedata.normalize("NFC", raw).lower()
    s = s.replace("'", "").replace("’", "")
    s = s.replace("ँ", "ं")        # candrabindu ँ -> anusvara ं
    s = s.replace("़", "")              # drop nukta ़
    s = s.translate(DEVA_DIGITS_TO_ASCII)    # ०-९ -> 0-9
    return s

script(token) = "deva" if DEVA.search(raw) else "latin"
```

The gaps between tokens (spaces and punctuation) are kept so the display can be rebuilt with the original punctuation. `।` and `॥` display as `.`.

### B11.2 Matching (`lexicon.py`)

```python
@dataclass
class Match:
    start: int          # token index (inclusive)
    end: int            # token index (exclusive)
    concepts: list[ConceptId]
    side: Literal["speaker", "listener"]   # speaker-language keyword, or listener-language word (Hinglish / crossover)
    variant: str        # matched normalized variant
    roman: str | None   # display form for Devanagari variants
    fuzzy: bool

class Lexicon:
    def match(self, tokens, lang: Lang, *, side="speaker") -> list[Match]
    def match_listener_side(self, tokens, listener_lang, taken: set[int]) -> list[Match]
```

Index built per language:

- `hi`: `exact_deva` from `hi.variants[].deva` (normalized) → (concept, roman). `exact_latin` from `hi.roman_variants`. `multi` = multi-word entries in either script (e.g. `kaun si`, `कौन सी`).
- `en`: `exact_latin` from `en.variants`; `multi` = none; `special` `twice` → [TWO, TIMES].
- Crossover (listener side): when the **listener** is `en` and the speaker `hi`, the "listener words" are `en.variants` (Latin, from multi-language transcripts or typing) + `en.crossover` (Devanagari loan spellings). When the listener is `hi` and the speaker `en`, they are `hi.roman_variants` + `hi.crossover`.
- `shared` = every shared word (English + Devanagari spellings), normalized. Shared words are **never** keywords.

Algorithm for `match(tokens, lang)` (speaker side):

```
taken = set()
1. Shared words: mark tokens whose norm ∈ shared as SHARED (never matched).
2. Multi-word, longest first (n = 3, then 2): sliding window over non-taken tokens;
   " ".join(norms) in multi[lang] -> Match(side="speaker").
3. Exact single token: norm in exact_deva or exact_latin (incl. digits "1".."4") -> Match.
   en "twice" -> Match(concepts=[TWO, TIMES]).
4. Fuzzy (Latin script tokens of length >= 4 only, never Devanagari, never shared):
   best = max over speaker-language Latin variants of length >= 4 of rapidfuzz.fuzz.ratio
   if best.score >= 85 and it beats the runner-up concept by > 0 -> Match(fuzzy=True). Ties -> no match.
5. ON/OFF guard (en only): drop an ON or OFF match when the next token's norm is in on_off_guard_next.
   ("on the left" -> no ON; "turn it on" -> ON; "switch two on." -> ON)
```

`match_listener_side` runs the same exact + multi steps (no fuzzy **[ASSUMPTION]**, to avoid false crossovers) with the listener-word index on tokens not taken by the speaker pass.

### B11.3 Romanizer (`romanize.py`)

`display_token(token, speaker_lang, match)` decides how each token appears in a subtitle (Latin only):

1. Latin token → the raw text as said/typed (keep the case).
2. Devanagari token inside a speaker-side match → the variant's stored `roman` (हरी → `hari`, १ → `ek`).
3. Devanagari shared word → its English spelling (लाइट → `light`, ओवरहेड → `overhead`).
4. Devanagari crossover spelling (listener side) → the English display (लेफ्ट → `left`, रेड → `red`).
5. `romanize_overrides` (करो → `karo`).
6. Otherwise `romanize(word)`, the fallback below.
7. Digit tokens: ASCII or Devanagari digits 1–4 → the concept's display in the **speaker's** language (`3` from a Hindi speaker → `teen`, from an English speaker → `three`). Other digits stay digits.

Then: lowercase romanized tokens, and capitalize the first letter of the subtitle and of each token that follows `.`, `!` or `?`.

**Fallback romanizer (readable Hinglish, not academic transliteration):**

```
consonants: क k, ख kh, ग g, घ gh, ङ n, च ch, छ chh, ज j, झ jh, ञ n, ट t, ठ th, ड d, ढ dh, ण n,
            त t, थ th, द d, ध dh, न n, प p, फ ph, ब b, भ bh, म m, य y, र r, ल l, व v, श sh, ष sh,
            स s, ह h;  nukta forms: क़ q, ख़ kh, ग़ g, ज़ z, ड़ r, ढ़ rh, फ़ f
independent vowels: अ a, आ aa, इ i, ई ee, उ u, ऊ oo, ए e, ऐ ai, ओ o, औ au, ऋ ri, ऑ o
matras: ा aa, ि i, ी ee, ु u, ू oo, े e, ै ai, ो o, ौ au, ृ ri, ॉ o, ॅ e
virama ्: no inherent vowel;  anusvara ं / candrabindu ँ: "n" ("m" before प फ ब भ म);  visarga ः: "h"
inherent "a" after a consonant with no matra/virama;
schwa deletion: drop the word-final inherent "a" when the word has 2+ aksharas (नमक -> namak, हम -> hum is an override)
```

Romanize on the **original** NFC text (before nukta is dropped) so फ़ → `f`. Unit tests: लाइट→light (shared), नमस्ते→namaste, विमान→vimaan, उतार→utaar, ज़मीन→zameen, खिड़की→khidki (override list may be extended when tests show odd output).

### B11.4 Utterance record

```python
class WordItem(BaseModel):
    token: str; start_s: float | None; end_s: float | None; confidence: float | None
    kind: Literal["pronunciation", "punctuation"] = "pronunciation"

class Utterance(BaseModel):
    id: str                       # "u_" + 8 hex
    room: str; speaker_id: str; speaker_role: Role; lang: Lang
    phase: int                    # 0..3 (also the signal level when playing)
    action_id: str | None
    transcript: str               # as Transcribe returned it (Devanagari for hi) or typed
    items: list[WordItem]
    matches: list[Match]          # speaker side
    listener_matches: list[Match] # listener side (Hinglish / crossover)
    segments_for_listener: list[Segment]
    glossed_concepts: set[str]    # concepts shown with a gloss to the listener
    unglossed_concepts: set[str]
    pcm: bytes | None
    translation: str | None
    translation_status: Literal["pending", "ready", "failed"]
    translation_event: asyncio.Event
    lifelined_by: set[str]        # player ids
    created_at: float
    released_at: float | None     # ptt_end time (latency)
    latency_ms: int | None
```

**Tokens in real mode** come from Transcribe `items` (one token per pronunciation item, punctuation items attached to the gap), so token *i* maps 1:1 to item *i* for clip cutting. In mock mode, tokens come from `tokenize(text)` with no timings.

### B11.5 Building segments (`subtitles.py`)

```python
def build_segments(utt, listener: Player, level: int) -> list[Segment]:
    tokens = utt.tokens
    spk = {i: m for m in utt.matches for i in range(m.start, m.end)}
    lst = {i: m for m in utt.listener_matches for i in range(m.start, m.end)}
    out = []; i = 0
    while i < len(tokens):
        if i in spk and spk[i].start == i:
            m = spk[i]
            text = join display of tokens m.start..m.end (keep the inner gap)
            gloss = None
            if any(should_gloss(level, c, listener.stats) for c in m.concepts):
                gloss = " ".join(listener_display(c, listener.lang) for c in m.concepts)
            out.append(Segment(text=text, kind="keyword", concept=m.concepts[0],
                               concepts=m.concepts if len(m.concepts) > 1 else None, gloss=gloss))
            i = m.end
        else:
            out.append(plain(display(tokens[i])))   # includes listener-side words: shown plain, no chip
            i += 1
        out.append(plain(gap after token))
    return merge_adjacent_plain(out)
```

- `listener_display(c, "en")` = `en.display`; `listener_display(c, "hi")` = `hi.display_roman` (glosses are Latin even for a Hindi listener).
- A word in the listener's own language (listener-side match) is **plain text**: no chip, no gloss, no exposure. Example for an English listener: *Aag [fire] wala engine left hai? Toh left laal [red] handle kheencho [pull]!*
- Shared words are plain.
- Example (level 1, en listener): `[{"text":"Teen","kind":"keyword","concept":"THREE","gloss":"three"},{"text":" number button ","kind":"plain"},{"text":"dabao","kind":"keyword","concept":"PRESS","gloss":"press"}]`.

### B11.6 The gloss rule

```python
def should_gloss(level: int, concept: Concept, s: PlayerStats) -> bool:
    if level == 1: return True
    if level == 2: return concept.introduced_in == 2 or s.glossed[concept.id] < GLOSS_THRESHOLD
    return False   # level 3 (and 0 = outside phases: treat as 1)
```

Level 0 (talking in the lobby or prologue) uses the level-1 rule **[ASSUMPTION]**, but exposure is only counted while `phase >= 1`.

After building segments for the listener: for every keyword segment, `heard[c] += 1`; if it carried a gloss, `glossed[c] += 1`. Record `utt.glossed_concepts` / `unglossed_concepts` for credits.

The speaker gets `utterance_echo {transcript_display}` = all tokens through `display_token`, no chips, no glosses.

### B11.7 Exposure, credits and crossover (`exposure.py`)

```python
@dataclass
class PlayerStats:
    heard: Counter; glossed: Counter; understood: Counter; spoken: Counter
    shown: set[str]                # concepts ever shown to this player as a keyword (for the crossover rule)
```

**Credit events.** For each utterance, log `CreditEvent(utterance_id, listener_id, concept, glossed: bool)` for every keyword segment, into `game.action_log` (cleared when an action activates).

**Understood** (on action success, phases 2 and 3 only): for each player P, the concepts C such that some event exists with `listener_id == P`, `concept == C`, `glossed == False`, and that utterance not in P's lifelined set → `understood[C] += 1` (once per concept per action). Both players get credit independently from what they heard.

**Spoken / crossover** (every utterance while PLAYING):

```
for m in utt.listener_matches:            # speaker used the partner's language
    for c in m.concepts:
        if c not in speaker.stats.shown: continue        # must have been shown this concept this game
        speaker.stats.spoken[c] += 1
        if c not in game.crossover_paid[speaker.id]:
            game.crossover_paid[speaker.id].add(c)
            fuel.add(+CROSSOVER_BONUS_S)
            toast(both, kind="crossover", key="toast.crossover", params={"word": display})
```

`shown` is updated whenever the player is shown a keyword segment (as listener). This stops a Hindi speaker who says "left" by habit from farming points before they've ever seen *left* from their partner. Real speech crossover is best effort; it's exact in Mock Mode.

**Exposure persists across retries** (and across phases); a new game (play again) resets it.

## B12. Manual card builder (`app/manual.py`)

`build_card(game, run, tower_lang, mock_or_dev) -> ManualCard`, everything in the Tower's language:

- `phase_name` = phase `name[lang]`. `title` = action `title[lang]`.
- `find_out` (observe actions only): `station_label` = station `name[lang]`; `part_label` = `segments(part.name[lang])` (run the matcher in the Tower's language and turn matches into keyword segments **without glosses**, so keywords get the highlighter); `property_label` = `manual_terms.properties[property][lang]`; `values` = for each option value: `label = segments(concept display in lang)` (Hindi: `display_deva`) and `swatch` = color (RED/GREEN/BLUE/YELLOW), side (LEFT/RIGHT) or yesno (YES/NO).
- `known_from` (branch_on actions): the index (1-based) of the action that observed the variable, and `manual_terms.known_from`.
- `rows`: for each branch (or one row for say-only):
  - `when`: `{value, label, swatch}` (branch_on: label prefixed by `value_prefix_branch_on`, e.g. "आग: बायाँ"); `null` for say-only.
  - `do`: the generated rule label as segments. For each step: `object = manual_name[lang]`; `verb` = `verbs[press|pull|toggle_on|toggle_off|move_down][lang]`; `count` = `times_template` with `count_words` when count > 1 **or** another step/branch of the action has a different count, else empty. Hindi template `{object} {count} {verb}` ("हरा बटन तीन बार दबाओ"), English `{verb} {object} {count}` ("press green button three times"). Multiple steps are joined with `, फिर ` / `, then ` (ordered) or ` + ` (unordered). Then the whole label goes through the matcher → keyword segments (no gloss).
  - `controls`: one `ControlDrawing` per step: type, label, color from `stations.json`; `target` = the object's state after the step (press → `button`, toggle → `toggle on/off`, pull → `handle out`, move_down → `lever down` / `notch +count`); `count`.
  - `order`: `single` (1 step), `ordered`, or `unordered`.
- `hint`, `sticky` from content. `own_words_note` = `own_words` (observe) or `own_words_say` (say-only).
- `progress`: `done` for indices < action_index, `current`, then `upcoming`.
- `last_wrong`: from `game.last_wrong` if it happened during **this** action (built like a rule label from what the Flyer actually did: "हरा बटन ×2"); cleared on activation.
- `stamp = "emergency"` in phase 2; `smudges = true` in phase 3.
- `highlight.circled` = all objects in all rows; `highlight.question` = the observe part's `members`.
- `quick_say` (only when the room is mock, or Dev Mode): `ask`/`say` and each branch's line as `QuickLine{label, text, alt_text}` with `text` = `hi_roman` (Hindi Tower) or `en`, and `alt_text` = Devanagari `hi`.

Privacy: the card contains every branch, never which one is right.

## B13. Speech pipeline (`app/speech/`)

### B13.1 Interfaces

```python
class TranscriptResult(BaseModel):
    transcript: str; items: list[WordItem]; ok: bool; error: str | None = None

class SpeechSession(Protocol):
    async def feed(self, pcm: bytes) -> None: ...
    async def finish(self, timeout_s: float) -> TranscriptResult: ...
    async def abort(self) -> None: ...

def open_session(lang: Lang, on_partial: Callable[[str], Awaitable[None]]) -> SpeechSession
```

`transcribe_mock.MockSession` never gets audio in practice. `say_text` skips sessions entirely: `TranscriptResult(transcript=text, items=tokens without timings, ok=True)`.

### B13.2 Push-to-talk flow (`main.py` + `speech/`)

```
ptt_start (any role, status in LOBBY..PLAYING except DECK; allowed during cinematics):
    if room.channel_holder and holder != me: error channel_busy; return
    if room.mock_speech: error mock_only; return               # mock rooms use say_text
    room.channel_holder = me; broadcast channel{busy_by: role}
    utt_buf = bytearray(); session = open_session(lang, on_partial)
    t_start = monotonic(); schedule(MAX_UTTERANCE_MS + 500, force_end) guarded

binary frame:
    if sender != holder: drop silently
    if len % 2 or len > 6400: drop
    utt_buf += frame; await session.feed(frame)

ptt_end (or force_end):
    if sender != room.channel_holder: ignore silently   # a late/stray ptt_end must never cut off the partner
    release channel -> broadcast channel{busy_by: null}
    duration = len(utt_buf) / 32000
    if duration < 0.3: await session.abort(); speaker: utterance_dropped{too_short}; return
    t_release = monotonic()
    result = await session.finish(TRANSCRIBE_FINAL_TIMEOUT_MS / 1000)
    if not result.ok: speaker: utterance_dropped{transcribe_failed} + toast toast.didnt_catch; return
    if not result.transcript.strip(): speaker: utterance_dropped{no_speech}; return
    finalize_utterance(result, pcm=bytes(utt_buf), released_at=t_release)

finalize_utterance(...):   # shared with say_text
    utt = Utterance(...); tokens; matches (speaker side); listener_matches
    if listener exists:
        segments = build_segments(utt, listener, level = phase if PLAYING..PHASE_OUTRO else 0)
        send listener utterance{...segments, lifeline_available = (phase 3 and PLAYING)}
        update exposure + credit events
    send speaker utterance_echo
    crossover (B11.7)
    latency_ms = now - released_at (real mode) -> log + dev_state
    asyncio.create_task(translate_in_background(utt))
    game.utterances.append(utt); bots.on_utterance(utt)
```

- Talking is allowed during cinematics (push-to-talk is the one input never locked).
- If the listener is a bot, no `utterance` is sent; bots read the matched concepts directly.
- `caption_partial` texts are romanized the same way as the echo, throttled to 5/s.
- A disconnect while holding the channel aborts the session and releases the channel.

### B13.3 Amazon Transcribe streaming (`transcribe_aws.py`)

```python
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler

class AwsSession:
    async def start(self, lang, on_partial):
        client = TranscribeStreamingClient(region=settings.AWS_REGION)
        kwargs = dict(media_sample_rate_hz=16000, media_encoding="pcm")
        if settings.TRANSCRIBE_MULTI_LANG:
            # SPEC-ASSUMPTION: verify the installed SDK exposes these args; else fall back to single
            kwargs.update(identify_multiple_languages=True, language_options="hi-IN,en-US",
                          preferred_language="hi-IN" if lang == "hi" else "en-US")
            vocab = ",".join(v for v in [settings.TRANSCRIBE_VOCAB_HI, settings.TRANSCRIBE_VOCAB_EN] if v)
            if vocab: kwargs["vocabulary_names"] = vocab
        else:
            kwargs["language_code"] = "hi-IN" if lang == "hi" else "en-US"
            v = settings.TRANSCRIBE_VOCAB_HI if lang == "hi" else settings.TRANSCRIBE_VOCAB_EN
            if v: kwargs["vocabulary_name"] = v
        self.stream = await client.start_stream_transcription(**kwargs)
        self.handler = Handler(self.stream.output_stream, on_partial, self.finals)
        self.reader = asyncio.create_task(self.handler.handle_events())

    async def feed(self, pcm): await self.stream.input_stream.send_audio_event(audio_chunk=pcm)

    async def finish(self, timeout_s):
        await self.stream.input_stream.end_stream()
        try: await asyncio.wait_for(self.reader, timeout_s)
        except asyncio.TimeoutError: pass               # use whatever finals arrived
        return TranscriptResult(transcript=" ".join(f.transcript for f in self.finals),
                                items=[i for f in self.finals for i in f.items], ok=True)

class Handler(TranscriptResultStreamHandler):
    async def handle_transcript_event(self, ev):
        for r in ev.transcript.results:
            alt = r.alternatives[0]
            if r.is_partial: await self.on_partial(alt.transcript)
            else: self.finals.append(Final(alt.transcript, [WordItem(token=i.content,
                     start_s=i.start_time, end_s=i.end_time, confidence=getattr(i, "confidence", None),
                     kind="punctuation" if i.item_type == "punctuation" else "pronunciation")
                     for i in alt.items]))
```

- One stream per utterance. Any exception → `ok=False` → "Didn't catch that, try again".
- Single-language is the default (`TRANSCRIBE_MULTI_LANG=0`): each speaker is transcribed in their own `lang`. Hindi speakers' English words then arrive as Devanagari loan spellings, which the shared-word table and the `en.crossover` lists already map (ओवरहेड → overhead, लेफ्ट → left).
- Multi-language identification is opt-in (`TRANSCRIBE_MULTI_LANG=1`). A real-AWS smoke test showed it never switched language on short radio lines (it always returned the preferred language) and roughly tripled finish latency (about 500–760 ms vs 190–240 ms single-language), so it buys nothing for this game's utterance length.
- On startup in real mode, log a warning if the region isn't one where `hi-IN` streaming is supported (keep a small allow-list in `config.py`; verify against AWS docs at deploy time).

### B13.4 Latency

`latency_ms` = time from `ptt_end` received to `utterance` enqueued for the listener. Target < 1500 ms. Log every utterance as JSON `{"evt":"utterance","room","role","lang","ms","chars","matches"}` and keep the last 20 in `dev_state.latencies_ms`.

## B14. Translation and lifelines

### B14.1 Translators (`speech/translate.py`)

```python
class Translator(Protocol):
    async def translate(self, text: str, src: Lang, dst: Lang) -> str
```

- **AwsTranslator:** `boto3.client("translate").translate_text(Text=text, SourceLanguageCode=src, TargetLanguageCode=dst, TerminologyNames=[TRANSLATE_TERMINOLOGY] if set else [])` in `asyncio.to_thread`, timeout 5 s.
- **MockTranslator:** an index of **every authored line**: each `ask`, top-level `say`, branch `say` (all three forms) and each `flyer_examples` triple, aligned by index. Key = `norm_line(text)` (NFC, lowercase, punctuation stripped, spaces collapsed). Value = `{"en": en, "hi": hi_deva}`. Lookup hit → the counterpart in `dst`. Miss → keyword substitution: tokenize, replace each speaker-side keyword with its `dst` form (`hi` → `display_deva`, `en` → `display`), keep the rest. The validator checks that no key maps to two different counterparts.
- **Translation target script:** into Hindi the translation is **Devanagari** (it's the Hindi listener's own material, like the manual); into English it's English **[ASSUMPTION]**.

`translate_in_background(utt)`: `status = pending` → call → `ready` or `failed`, then `translation_event.set()`. Skip when there is no partner listener.

### B14.2 Lifelines (`lifeline {utterance_id}`)

```
require status PLAYING and phase == 3         else error lifeline_not_available
utt = find utterance; require utt.speaker is the partner and utt is among the partner's last 3 utterances
                                              else error lifeline_not_available
if player.id in utt.lifelined_by: resend translation for free (the "show" link); return
require player.lifelines > 0                  else error no_lifelines
if status pending: await wait_for(event, LIFELINE_WAIT_MS)
if not ready: error translation_failed (not decremented); return
player.lifelines -= 1; utt.lifelined_by.add(player.id); phase_stats[3].lifelines_used += 1
player: translation{utterance_id, text, lang: player.lang, lifelines_left}; both: game_state
```

(The lock is released while awaiting the translation; re-check the state afterwards.) Lifelines reset to 3 on Phase 3 entry and on retry. The "show" link re-opening a revealed translation is a client-side feature, but a repeated request is free as well.

## B15. Word deck, clips, report, persistence

### B15.1 Deck (`deck.py`)

Built at ENDING start, per player P with partner Q:

```
for each of the 20 concepts c (order: learned first by understood+spoken desc, then lexicon order):
    word     = Q's language form in Latin: Q.lang == "hi" ? hi.display_roman : en.display
    meaning  = P's language: P.lang == "hi" ? hi.display_deva (meaning_script "deva") : en.display
    understood = P.stats.understood[c]; spoken = P.stats.spoken[c]
    learned  = understood >= 1 or spoken >= 1
    clip_url = clip_for(Q, c)   (null in mock or when there is no good clip)
learned_count = count(learned)
stats = per phase {fuel_left_s, wrong_actions, lifelines_used (P's), attempts, time_s},
        wrong_actions_total, lifelines_used {mine, partner}, total_time_s, fuel_left_final_s
```

### B15.2 Clips (`audio.py`)

- For concept c, look at Q's utterances that have PCM and timed items. Candidates = speaker-side matches of c; score = the min confidence of the matched items. Pick the best.
- Cut `pcm[(start - 0.08) * 32000 : (end + 0.12) * 32000]` (byte offsets, clamped, even-aligned), wrap it in a 44-byte WAV header (PCM16, mono, 16000 Hz), store in `room.clips["c_" + 8 hex]`, URL `/clips/{id}.wav`.
- Clips live in memory for the room's lifetime. The deck is built once, so clips are cut once.

```python
def wav_bytes(pcm: bytes, rate=16000) -> bytes:
    return b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16) + b"data" + struct.pack("<I", len(pcm)) + pcm
```

### B15.3 Mission report (Bedrock)

- When `BEDROCK_MODEL_ID` is set and the room isn't mock: one Converse call per player, in parallel, in that player's language, `maxTokens 400` (`BEDROCK_MAX_TOKENS`; Devanagari needs several tokens per word, 200 cut Hindi reports off), `temperature 0.7`, timeout 5 s.
- Fuel units: the report states fuel as litres **and** seconds. `FUEL_LITRES_PER_S = 1.0` (backend constant in `constants.py`, Part B only; the in-game fuel gauge and every Part A field stay in seconds). The server precomputes both whole numbers so the model never converts: `fuel_left_l = round_half_up(fuel_left_s × FUEL_LITRES_PER_S)`, `fuel_left_s = round_half_up(fuel_left_s)`, rounding .5 up like the client's `Math.round` (not Python's banker's `round`), so 60.5 s reads "61" on the deck stats and in the report.
- Prompt (build spec §15, tightened after a live test where reports came back as Markdown, overlong and with invented facts): "Write an upbeat mission report for a co-op game where two people who don't share a language landed a plane. It is read by one player, the reader (reader_name, the {flyer | tower}); address the reader as "{you | आप / आपने}" in the second person. Language: {Hindi (Devanagari script) | English}. Plain text only: no Markdown, no heading or title, no bullet points, no emoji. Exactly 2 or 3 short sentences, each under 20 words. Use ONLY the facts below and never invent numbers, words or events. Mention both names and the fuel left, written exactly as: {fuel phrase}. {words rule} Use the players' genders for pronouns and, in Hindi, for verb agreement. Facts: {json}."
  - Fuel phrase: en "{fuel_l} litres ({fuel_s} s) of fuel", hi "{fuel_l} लीटर ({fuel_s} सेकंड) ईंधन".
  - Words rule: "learned_words are the words the READER learned (not the partner): credit them to the reader only, mention one or two of them spelled exactly as given, and no other words." If `learned_words` is empty: "learned_words is empty, so do not mention any specific words."
  - Facts = `{flyer, flyer_gender, tower, tower_gender, reader_name, reader_role, reader_gender, fuel_left_l, fuel_left_s, total_time_s (whole seconds, `round_half_up` like the client, so 124.5 → 125), wrong_actions, learned_words: [w1, w2, w3]}` (`learned_words` are the reader's own learned words and may be shorter or empty; the reader is the player the report is for).
- Post-processing (safety net): strip leading Markdown heading lines and any stray `#` / `*`, collapse whitespace. If `stopReason == "max_tokens"`, trim to the last complete sentence: `.`, `!` or `?` followed by whitespace or the end (so `61.5` doesn't count), or `।` / `॥` anywhere (they never appear inside numbers), in each case including any closing quotes or brackets right after the mark. If nothing is left, use the template.
- Fallback templates (used on timeout, error, empty or unusable model output, empty model id or mock):
  - en: "{flyer} and {tower} landed with {fuel_l} litres ({fuel_s} s) of fuel to spare. You learned {n} words, including {w1} and {w2}."
  - hi: "{flyer} और {tower} ने {fuel_l} लीटर ({fuel_s} सेकंड) ईंधन बचाकर विमान उतार लिया। आपने {n} शब्द सीखे, जैसे {w1} और {w2}।"
  - If fewer than 2 words were learned, drop the "including" clause ("You learned {n} words." / "आपने {n} शब्द सीखे।").
- The deck is sent with `report_pending: true` if Bedrock hasn't returned by DECK entry; `deck_report` follows.

### B15.4 DynamoDB (`persistence.py`)

When `DDB_TABLE` is set: `put_item` in a thread at ENDING, failures logged and ignored. Table `wingin_games`, partition key `game_id` (S), on-demand. Item:

```json
{
  "game_id": "g_…", "room": "KXPD", "seed": 42, "demo": false,
  "started_at": "2026-11-14T18:02:11Z", "ended_at": "…", "total_time_s": 412.3,
  "players": [{"name": "Asha", "role": "tower", "lang": "hi", "gender": "female"}, {"name": "Sam", "role": "flyer", "lang": "en", "gender": "male"}],
  "phases": [{"phase": 1, "fuel_left_s": 61.2, "wrong_actions": 2, "lifelines_used": 0, "attempts": 1, "time_s": 98.4}],
  "words": {"p_…": {"RED": {"heard": 6, "glossed": 4, "understood": 2, "spoken": 1}}},
  "latency_ms_p50": 820, "latency_ms_p95": 1310
}
```

Numbers go in as `Decimal`. `scripts/create_table.py` creates the table.

## B16. Bots, dev commands, demo mode

### B16.1 Bots (`bots.py`)

Bots are virtual players (`is_bot = True`, no connection) that call the **same handlers** as real messages (`handle_say_text`, `handle_interact`), so they exercise the real code paths.

- Toggled with `dev bots {flyer, tower}` (Dev Mode) or automatically for `demo.auto_phases`. Turning a bot on for an empty role in LOBBY creates the virtual player (name "Auto Tower" / "Auto Flyer", language = the opposite of the human's, gender `male` for Auto Tower and `female` for Auto Flyer).
- **Auto Tower:** on action activation (+`BOT_DELAY_MS/2`): if the action has `ask` → say it; then `BOT_DELAY_MS` later say the branch line for the rolled value. Say-only → say the `say` line. `branch_on` → the branch line. Line form: `hi_roman` if the bot speaks Hindi, `en` otherwise.
- **Auto Flyer:** when an `ask` utterance from the Tower arrives (or the action activated with an observe and the Tower is a bot), reply 1 s later with the quick-reply answer for the rolled value. When a Tower utterance contains a verb concept (PRESS/PULL/ON/OFF/DOWN), or `BOT_DELAY_MS` after the Auto Tower's instruction, perform the correct steps of the current run in order, 300 ms apart (presses 300 ms apart, all within the debounce window).
- Bots stop when their toggle is off, on PAUSED, and outside PLAYING. Bot timers are generation-guarded. Bots auto-vote for skip, retry and play again.
- Bot speech produces real subtitles and exposure for the human listener (that is what makes demo Phase 2 look alive).

### B16.2 Quick replies (Flyer, Mock/Dev)

`flyer_view.quick_replies` = the current action's `flyer_examples` in the Flyer's language (text = `hi_roman` or `en`, alt_text = `hi`), plus the generated correct answer for the rolled value: concept display + "!" ("Red!" / "Laal!", alt "लाल!"; YES → "Yes!" / "Haan!"). `null` when the room is not mock and Dev Mode is off.

### B16.3 Dev commands (`dev.py`)

Rejected with `dev_disabled` unless `DEV_MODE=1`. Semantics in §A7. `goto_phase n`: bump `gen`, end any cinematic without applying it, set the previous phases' end-states (objects and world as if completed; FIRE_SIDE rolled if needed), then `enter_phase_intro(n)`. `set_seed` in game: restart the current phase with a new `Roller(seed)`.

`dev_state` is broadcast to both players after every handled message or timer (throttled to 4/s).

### B16.4 Demo mode

- `room.demo = DEMO_MODE or create(demo=True)`. Use `demo.json` (§A17): fuel 300 s, the route, forced values preloaded at every phase start, the `phase3_preset`, short prologue/ending, bots on for phase 2.
- **Presenter** messages (`presenter {cmd}`) are accepted in demo rooms from either player without Dev Mode: `next_action` = `complete_action`; `next_phase` = complete the current phase now (→ its outro).
- Demo rooms accept `say_text` even in real mode (the safety net).
- The DynamoDB item is flagged `demo: true`.

## B17. Security, limits, logging

- **Origin check** on the WebSocket and CORS on REST (`ALLOWED_ORIGINS`).
- **Validation:** every inbound message through pydantic (`extra="forbid"`). Unknown `type` → `bad_message`.
- **Rate limits per connection:** 30 text messages/s burst, 15/s sustained; `interact` 12/s; `say_text` 1 per 300 ms; binary frames only while holding the channel, ≤ 15/s. Over the limit → drop and send `rate_limited` at most once per second.
- **Sizes:** text frame ≤ 8 KB, binary ≤ 6.4 KB, utterance buffer ≤ 12.5 s, name ≤ 16 chars, say_text ≤ 300 chars.
- **No secrets in the client:** AWS credentials only on the server (the task role). Nothing about rolled values goes to the Tower (§A2, tested).
- **Logging:** JSON lines (`logging_setup.py`): `room`, `game`, `evt`, plus fields. Events: room_created, join, rejoin, start, state, action_ok, action_wrong, crash, retry, utterance (latency), translate_fail, transcribe_fail, lifeline, deck, persist_fail. Never log raw audio. Transcripts are logged only in Dev Mode.
- **Health:** `/health` returns 200 once content is validated; the ALB uses it.
- **Graceful shutdown:** on SIGTERM, close sockets with code 1012 (clients reconnect to the replacement task; in-memory games are lost, which is accepted for the MVP with exactly one task).

## B18. Testing (pytest)

Test helpers (`conftest.py`): `FakeClock` (patches `monotonic` and the scheduler so timers run deterministically), `FakeSocket` (records every outbound message per player), `make_room(seed, langs, mock=True)`, `say(role, text)`, `click(id, verb)`, `advance(ms)`.

| File | Must cover |
| --- | --- |
| `test_normalize.py` | NFC; ँ→ं; nukta dropped; `।`/`॥`/dashes/quotes stripped; offsets preserved; `don't`→`dont` |
| `test_matcher.py` | हाँ and हां → YES; `3` and ३ → THREE; *kaun si* and कौन सी → WHICH; *twice* → TWO + TIMES (one match, two concepts); "on the left" → LEFT, no ON; "switch two on." → ON; *kheecho* fuzzy → PULL; *do* never fuzzy-matches; Devanagari never fuzzy; shared words (light, लाइट, button, बटन) never match; *baayen* fuzzy → LEFT (not RIGHT) |
| `test_romanize.py` | keyword variant roman (हरी→hari); loanword table (लाइट→light); overrides (करो→karo); fallback samples; digits shown as words; capitalization |
| `test_subtitles.py` | segments cover the whole utterance in order; a Devanagari input yields **no Devanagari** in any segment; listener-language words are plain; the example from the build spec §6.2; the Hinglish example from §6.7 |
| `test_gloss_rule.py` | every combination of level {1,2,3}, `introduced_in` {1,2}, `glossed` {0,1,2,3}; counters increment (heard on every keyword, glossed only when shown with a gloss) |
| `test_judge.py` | press count with the 1.2 s debounce (2 presses in 1 s = 2; 1 press then 1.3 s then 1 = two separate counts); wrong object; wrong toggle direction; ordered steps (A7 wrong order = wrong_order, step 1 kept); unordered steps (C7 either order; C3 counts per lever); partial progress kept after a wrong step; pending finalized by a different object; clicks during the gap / cinematics / on other stations ignored without penalty; pull an already-out handle = no penalty |
| `test_fuel.py` | drains only in PLAYING without a cinematic; frozen during PAUSED; −10 per wrong; crash at 0; retry restores full fuel and lifelines; exposure kept after retry |
| `test_credits.py` | understood only for unglossed keywords that weren't lifelined, only in phases 2–3, once per concept per action; crossover +5 s once per concept per player, only after the concept was shown to the speaker |
| `test_lifelines.py` | 3 per player in phase 3; refused in phases 1–2 and at 0; only the partner's last 3 utterances; decremented only when a translation is delivered; failure → `translation_failed` and not decremented; a second request on the same utterance is free |
| `test_privacy.py` | play complete games (bots, every path, both seeds) and assert: no Tower message has type `flyer_view`/`object_state`; no Tower `cinematic.params` contains `fire_side`/`stopped_side`/`damaged_side`; no Tower `game_state`/`fx`/`toast` contains a rolled value; no Flyer message has type `manual_card` or contains any branch line text; `dev_state` is never sent with `DEV_MODE=0` |
| `test_manual.py` | rule labels: "हरा बटन तीन बार दबाओ", "दो नंबर स्विच चालू करो", "बायाँ लाल लीवर खींचो"; English equivalents; count shown when siblings differ (B3 NO "लाल बटन एक बार दबाओ"); keywords highlighted, no glosses; `quick_say` present only in mock/dev |
| `test_state_machine.py` | `join` without a valid `gender` is rejected (`bad_message`); `gender` appears in `room_state` and survives rejoin, play again and swap roles; LOBBY → PROLOGUE only with both ready and different languages; full sequence of states and cinematic ids; double skip; crash/retry; pause/resume within 60 s; abandon after 60 s; play again; swap roles keeps languages |
| `test_full_game_bots.py` | for every combination of variable values (forced) **and both language pairings** (Flyer en/Tower hi and Flyer hi/Tower en), bots finish the whole game; segments are Latin for both listeners, glosses are in the listener's language, the manual card is in the Tower's language; the deck is produced; mission report falls back to the template |
| `test_mock_translate.py` | every authored line translates to its counterpart in both directions; the keyword-substitution fallback |
| `test_deck.py` | learned = understood ≥ 1 or spoken ≥ 1; ordering; Hindi meanings in Devanagari; clips cut with padding and a valid WAV header |
| `content/validate_content.py` | runs as its own CI step |

## B19. Deployment

### B19.1 `server/Dockerfile`

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server/app ./app
COPY content ./content
ENV CONTENT_DIR=/app/content PORT=8000 DEV_MODE=0 MOCK_SPEECH=0
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--ws-ping-interval", "20", "--ws-ping-timeout", "20"]
```

(Build context = repo root: `docker build -f server/Dockerfile .`.)

### B19.2 `docker-compose.yml` (local dev)

```yaml
services:
  server:
    build: { context: ., dockerfile: server/Dockerfile }
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    environment: { MOCK_SPEECH: "1", DEV_MODE: "1", DEMO_MODE: "0", ALLOWED_ORIGINS: "http://localhost:5173" }
    volumes: [ "./server/app:/app/app", "./content:/app/content" ]
    ports: [ "8000:8000" ]
  client:
    image: node:20
    working_dir: /client
    command: sh -c "npm ci && npm run dev -- --host 0.0.0.0"
    environment: { VITE_DEV_MODE: "1", VITE_PROXY_TARGET: "http://server:8000" }
    volumes: [ "./client:/client", "./content:/content:ro" ]
    ports: [ "5173:5173" ]
    depends_on: [ server ]
```

### B19.3 AWS (recommended: ECS Fargate + ALB + Amplify)

1. ECR repo `wingin-server`; push the image.
2. ECS cluster, task definition: 1 vCPU / 2 GB, port 8000, env `MOCK_SPEECH=0 DEV_MODE=0 AWS_REGION=… BEDROCK_MODEL_ID=… DDB_TABLE=wingin_games ALLOWED_ORIGINS=https://<client domain>`, task role with the IAM policy below, logs to CloudWatch.
3. Service with **desired count 1, max 1** (game state is in memory; never scale out). Deployment: minimum healthy 0%, maximum 100% (so two tasks never run at once).
4. ALB: HTTPS listener (ACM certificate) → target group (HTTP 8000, health check `GET /health`), **idle timeout 300 s**, stickiness not needed with one task.
5. Client on Amplify Hosting with `VITE_WS_URL=wss://api.<domain>/ws`, `VITE_API_URL=https://api.<domain>`, `VITE_DEV_MODE=0`.

IAM for the task role: `transcribe:StartStreamTranscription`, `transcribe:StartStreamTranscriptionWebSocket`, `translate:TranslateText`, `bedrock:InvokeModel`, `dynamodb:PutItem`, `dynamodb:GetItem`. Setup scripts only: `transcribe:CreateVocabulary`, `translate:ImportTerminology`, `dynamodb:CreateTable`.

**Fastest fallback: one EC2 t3.small** running `docker compose -f docker-compose.prod.yml up -d` with Caddy for automatic HTTPS:

```
fade.example.com {
    encode gzip
    handle /ws/*    { reverse_proxy server:8000 }
    handle /api/*   { reverse_proxy server:8000 }
    handle /clips/* { reverse_proxy server:8000 }
    handle /health  { reverse_proxy server:8000 }
    handle          { root * /srv/client; try_files {path} /index.html; file_server }
}
```

The page must be HTTPS (or the microphone is blocked) and the socket must then be `wss://`.

### B19.4 Setup scripts

- `scripts/make_terminology.py`: CSV with header `en,hi`, one row per concept (`en.display`, `hi.display_deva`), then `translate.import_terminology(Name="wingin-terms", MergeStrategy="OVERWRITE", TerminologyData={"File": csv, "Format": "CSV"})`.
- `scripts/make_vocabularies.py`: `wingin-hi` from all Devanagari variants + shared Devanagari spellings (`hi-IN`); `wingin-en` from English variants (`en-US`). On rejection, print a warning and continue.
- `scripts/create_table.py`: create `wingin_games` (PAY_PER_REQUEST) if missing.

### B19.5 CI (`.github/workflows/ci.yml`)

Jobs: `content` (`python content/validate_content.py`), `server` (`pip install -r server/requirements.txt && pytest -q server/tests`), `client` (`npm ci && npm run typecheck && npm run test && npm run build` in `client/`). All required on PRs.

## B20. Backend milestones (aligned with build spec §18)

| Milestone | Backend scope | Done when |
| --- | --- | --- |
| **M0 Scaffold** | Repo layout, compose, every content file from §B4–B5 and §A10/A17, the validator, protocol models | `python content/validate_content.py` prints three passing coverage tables |
| **M1 Playable mock** | Rooms, join/ready, state machine with timed cinematics, judge, fuel, world, manual card (plain), `say_text` with plain segments, quick-say/quick replies, dev room codes | One person finishes the whole game in `/dev/split` |
| **M2 Language engine** | Matcher, romanizer, segments, gloss rule, exposure, lifelines with the mock translator, credits, crossover, `dev_state` exposure | Every §B18 language/judge/credit/lifeline test passes |
| **M3 Look & feel support** | Every effect, the world table, all cinematic params, radar states, `fx` | The client can render every shot list from server cues |
| **M4 Real speech** | Binary frames, channel lock, Transcribe (multi + single), partials, background Translate, latency logs | Two people play by voice with subtitles under 1.5 s |
| **M5 Word deck** | Clips, deck, Bedrock + template, DynamoDB | The end screen plays the partner's real voice |
| **M6 Deploy** | Docker, ECS/ALB (or EC2 + Caddy), IAM, scripts | §B21 passes on the deployed build |
| **M7 Demo polish** | Bots, demo route, forced values, presenter keys, a rehearsed run | The §A17 run-of-show works three times in a row |

## B21. Backend acceptance checklist

- [ ] Server refuses to start when content is invalid; `/health` 200 otherwise.
- [ ] `join` requires `gender`; it shows in `room_state`, the deck (`partner_gender`), the Bedrock facts and the DynamoDB item, and is kept on swap roles.
- [ ] `docker compose up` + `/dev/split`: prologue plays and Phase 1 starts with no other steps.
- [ ] The full game finishes in Mock Mode on **both values of every variable** (forced with `dev force` or seeds), **in both language pairings** (Flyer en/Tower hi and Flyer hi/Tower en). No code picks a language from the role.
- [ ] Wrong action: −10 s, `action_result` with the reason, the Tower gets `used` with the control name in its language, and `last_wrong` on the card.
- [ ] Fuel reaching 0 → `CRASH`; Retry by both → same phase from action 1, full fuel, new rolls, lifelines 3, exposure kept.
- [ ] Phase 1 glosses every keyword; Phase 2 only new or not-yet-learned (per listener); Phase 3 none.
- [ ] Lifelines: 3 per player, full translation, not spent on failure.
- [ ] `cinematic.start_at_ms` is 300 ms ahead; double skip works; `crash` isn't skippable.
- [ ] Refreshing a tab mid-game (token rejoin) resumes with the full snapshot.
- [ ] Real mode: Hindi and English speech produce subtitles within 1.5 s of release; romanized Hindi reads naturally; no Devanagari in any segment.
- [ ] The deck lists learned words; clips play the partner's voice; the report arrives (Bedrock or template).
- [ ] Privacy tests pass; `dev_state` is absent with `DEV_MODE=0`.
- [ ] Demo room: route, forced values, phase 2 auto-play, `N`/`P` presenter keys, 300 s fuel.
- [ ] Deployed over HTTPS/WSS on AWS with exactly one task; two laptops in one room can play.
