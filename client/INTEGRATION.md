# Client ↔ server integration guide (for the backend)

The client speaks Part A of `docs/FRONTEND_SPEC.md` (identical in the backend spec) and nothing
else. This page shows you how to point it at your server and prove the contract with the e2e suite.

## 1. Run the client against your server

```bash
cd client && npm install
VITE_DEV_MODE=1 VITE_PROXY_TARGET=http://localhost:8000 npm run dev   # http://localhost:5173
```

The Vite dev server proxies `/api`, `/ws` (WebSocket upgrade) and `/clips` to `VITE_PROXY_TARGET`.
The browser always talks to the same origin (`ws://localhost:5173/ws/{CODE}`).

| Env (client)                   | Default                 | Meaning                                                                           |
| ------------------------------ | ----------------------- | --------------------------------------------------------------------------------- |
| `VITE_PROXY_TARGET`            | `http://localhost:8000` | dev server only: where `/api`, `/ws`, `/clips` go (compose: `http://server:8000`) |
| `VITE_DEV_MODE`                | `1` in `.env.example`   | compiles `/dev/split`, `/dev/scene`, `/dev/cinematic` and the dev panel           |
| `VITE_WS_URL` / `VITE_API_URL` | empty = same origin     | deployed builds only (bypass the proxy)                                           |
| `E2E_SERVER`                   | unset = fake server     | `real` = route nothing; use your server through the proxy                         |
| `E2E_PORT` / `E2E_BASE_URL`    | `5176` / unset          | port of the Vite server Playwright starts / use an already running one            |

Run the server with **`DEV_MODE=1 MOCK_SPEECH=1`** for everything below (dev commands, bots,
`dev_state`, `say_text`, `/ws/TEST` creating rooms on demand, §A4).

## 2. Split view (one person, both screens)

- `http://localhost:5173/dev/split?room=TEST&seed=42`: Tower (Hindi) left, Flyer (English) right.
- `…&bots=both` (or `tower` / `flyer`): the Tower iframe sends `dev bots` after joining.
- Toolbar: new room, swap languages (Flyer Hindi / Tower English), gender per side, bot toggles.
- One tab per role instead: `/r/TEST?role=flyer&lang=en&gender=female&name=Flyer&auto=1`.

## 3. The e2e suite in real mode

```bash
# terminal 1: your server on :8000 with DEV_MODE=1 MOCK_SPEECH=1
# terminal 2:
cd client && npx playwright install chromium
E2E_SERVER=real npm run e2e -- --project=flows split-bots mock-play rejoin lifeline
```

- `--project=flows` (with `=`) matters: Playwright's `--project` is variadic, so
  `--project flows split-bots …` would treat the spec names as project names.
- Without a reachable server the run stops at once: the global setup calls `GET /health` on
  `VITE_PROXY_TARGET` and also refuses a server whose health says `dev_mode`/`mock_speech` false.
  With `E2E_BASE_URL` set (an external Vite) that `/health` check still goes to
  `VITE_PROXY_TARGET`, so it must be the same server the external Vite proxies to.
- Playwright starts its own Vite on **:5176** with your `VITE_PROXY_TARGET`. If something already
  listens on 5176 it is reused, proxy target and all; stop it or set `E2E_PORT`.
- Every flow uses a fresh random room code, so a long-running server doesn't collide.
- In both modes each flow ends with `expectCleanWire` (and `e2e/fakeServer/privacy.ts` is the one
  list of §A9 rules behind it). It fails the flow when:
  - the wire tap saw no frames for the room (a check that sees nothing proves nothing);
  - the client sent a frame that breaks §A5/§A7. `parseC2S` is strict: unknown fields, bad enums,
    an empty `join.token` / `say_text.text` / `update_player.name`, `join.name` outside 1-16
    characters, `say_text` over 300 characters, a frame over 8 KB (counted in bytes), `dev` args
    that don't fit their command (§A7/§A13);
  - the Tower received `flyer_view`, `object_state`, a Flyer-only `fx` (anything but `tower:` /
    `both:`), a cinematic `params` with `fire_side`/`stopped_side`/`damaged_side`, or those keys
    or `FIRE_SIDE` anywhere else (only `dev_state` may carry rolled values, and only when
    `welcome.dev_mode` is true);
  - the Flyer received `manual_card`, `quick_say`/rule rows, an `action_result` with `row_index`
    or `used`, or a `tower:` / unknown `fx`;
  - a socket that never joined received a Flyer-only or Tower-only frame.
    In real mode this is read from the real WebSocket frames, so it checks **your** server. Frames
    that arrive before `join` (`welcome`, the spectator `room_state`, `pong`s) are attributed to the
    socket's role once `join`/`joined` tells it, so nothing stays unchecked. The checkers themselves
    are tested (with cases that must fail) in `tests/e2eCheckers.test.ts`.
- Default mode (`npm run e2e`) needs no backend: `e2e/fakeServer/` answers `/ws` and `/api` inside
  the browser (Playwright `routeWebSocket`). It follows BACKEND_SPEC §B8-§B14 where it models
  something (see the list below), and is not a reference implementation. Yours wins.

**What the fake models** (so you can read it as an executable example of the contract): the §A5
handshake and tokens; PAUSED / resume (§B8.4); the judge of §B9.3 (ignored clicks are a
`bounce:true` `object_state`, never an `error`; the 1200 ms press debounce from the **last** press;
`wrong_object` / `wrong_order` / `wrong_direction` / `wrong_count`; a different object finalizes a
pending count at once; `dev fail_action` = `wrong_object` with `used` = the first expected object);
fuel 150 / 150 / 180 s that also drains in the 1.5 s gap and not in cinematics or PAUSED; CRASH at 0
with the 5 s non-skippable `crash`, `retry_votes`, retry (`p1_intro` 3200 ms with `retry:true`,
`attempt` +1); the in-phase / event cinematics `p1_seat`, `p2_extinguish`, `p3_runway_reveal`,
`lightning_strike` (an `event`: the action waits for it), `p3_touchdown`; lifelines per §B14.2 (a
repeat request resends the translation for free, before the `no_lifelines` check); Latin-only
subtitles (Devanagari is romanized per §B11.3, digits 1-4 become the speaker's number word) and the
speaker's echo; quick-say `text` = `hi_roman` / English with the Devanagari line as `alt_text` for a
Hindi Tower; deck votes per §B8.5 (one current vote each, a later vote replaces, act when both
match, `play_again_votes`).

**Not modelled by the fake** (do not read these as the contract): the real route (4 / 3 / 4
actions per phase here, not A1-A7 / B1-B3 / C1-C8), branching on rolled variables, observe lamp
colors, the Tower's rule rows (the card draws the expected controls), `last_wrong` labels (the
control id, not the manual name), glosses by exposure (levels 0 and 1 gloss everything, level 2 and
3 nothing), crossover fuel, real translation (a tagged echo of the subtitle), the deck (canned, 4
words), the report, push-to-talk and audio, demo mode and presenter keys, the 60 s abandon timer,
radar time animation (it sends the end states of the §B8.3 table only), the prologue "dozes off"
radar change at 17 s, and `welcome.demo` / `POST /api/rooms` options.

| Spec         | What it drives                                                                          | What it needs from the server                                                |
| ------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `split-bots` | `/dev/split?…&seed=42&bots=both`, prologue → deck ≤ 6 min, a screenshot per phase title | `dev bots`, bots vote skip, the whole state machine                          |
| `mock-play`  | two tabs, both pairings: quick-say, a wrong button, then the expected control           | `quick_say` on the card, `dev_state.expected`, judging, `action_result.used` |
| `rejoin`     | join form handshake, taken role, Flyer refresh mid-phase, swap roles at the deck        | tokens, rejoin snapshot, PAUSED/resume, `joined` re-sent after `swap_roles`  |
| `lifeline`   | `goto_phase 3`, three decodes, refusal at 0, a Tower decode; both pairings              | `lifeline_available`, last-3 window, `translation` in the listener's script  |

The Flyer clicks controls with real mouse clicks on the canvas (positions projected from the
live scene, `e2e/kit/cockpit.ts`), and reads the expected steps from the dev panel (`dev_state`).
A press is judged 1.2 s after the last one, so the flow specs wait for the result (on screen or on
the wire); the only fixed pause is the 250 ms between the clicks of one multi-press.

## 4. Message flows the client expects (checklist)

- [ ] **§A5 handshake**: on open send `welcome`, then a spectator `room_state` (the join form
      disables taken roles from it). The client sends 5 `ping`s 100 ms apart, then `join`.
- [ ] **§A5 tokens**: `joined.token` is stored as `sessionStorage["wingin:token:{CODE}:{role}"]`.
      A `join` with that token re-binds the slot; send the full rejoin snapshot (game_state,
      flyer_view | manual_card, history, cinematic, channel, deck). Re-send `joined` after a swap.
- [ ] **§A8 room_state**: `block_reason`, `can_start`, `play_again_votes`; `connected` per player.
- [ ] **§A9 privacy**: the table above; cinematic `params` filtered per role (§A10).
- [ ] **§A10 cinematics**: `start_at_ms = server_now + 300`, `duration_ms` from `cinematics.json`;
      `skip_votes` per vote, `cinematic_skip` when both (bots vote at once). The client seeks late
      starts using the clock from your `pong`s (`server_ms`).
- [ ] **§A11 World** in every `flyer_view`, equal to the timeline end state (no jumps).
- [ ] **§A16 activating an action**: lamp `object_state`, `flyer_view.interactive`, `manual_card`,
      `game_state{action_active:true}`. Clickable = in `interactive` **and** not `input_locked`.
- [ ] **§A16 wrong action**: `object_state{bounce:true}`, `action_result` (Tower gets `used`),
      `manual_card` with `last_wrong`, `game_state` with fuel −10.
- [ ] **§B9.3 ignored clicks**: inactive, in the 1.5 s gap, in a cinematic or on another station is
      `object_state{bounce:true}`, no `error`, no penalty. Press counts finalize 1.2 s after the last.
- [ ] **§A16 lifeline**: `translation` to the spender, `game_state` to both; errors from §A15.
      A repeat request on a line already decoded resends the translation for free, **before** the
      `no_lifelines` check (§B14.2).
- [ ] **§A13 dev_state** on every change in Dev Mode (the dev panel and the specs read `expected`).
- [ ] **§A15 errors**: every code maps to a toast; `room_not_found` sends the client home.

## 5. Dev panel (backtick in any room tab, §F18.4)

Hotkeys while it is open: **N** `complete_action`, **F** `fail_action`, **1 2 3** `goto_phase`,
**K** `skip_cinematic` (also the Skip overlay's hotkey in Dev Mode). Buttons: +60 s fuel
(`add_fuel`), bots Tower / Flyer (`bots`), set seed (`set_seed`), force a var (`force`), and
"send Devanagari" (client-only: quick-say sends `alt_text`). It renders `dev_state`: status,
action, seed, vars, forced, expected steps, pending count, fuel, exposure, last utterance, latency.

## 6. Gotchas

- **Proxy**: only `/api`, `/ws`, `/clips` are proxied. `GET /health` from the browser hits Vite,
  not you, so the home page's DEMO badge never lights up in dev (known client issue below).
- **StrictMode double connect**: React runs effects twice in dev; the socket is a module singleton
  per room code, so you should see **one** socket per tab. Two = a client bug, tell us.
- **Split-view iframes share sessionStorage**: tokens are keyed by role for that reason. A
  refreshed iframe rejoins with its own role's token; two tabs never share one.
- **Autoplay**: iframes start without a gesture and show "Click to enable sound" until clicked.
  It doesn't block messages.
- **Pointer lock in iframes** (free look, §F10.3, pending): browsers only grant it after a click
  inside the iframe, and `allow` lists don't cover it. Test free look in a full tab.
- **Headless GPU**: the flows run headless Chromium with the real GPU (`--enable-gpu`, Metal on
  macOS). Software GL (SwiftShader, typical on Linux CI) stalls the Flyer during the prologue.
- **Mock rooms have no PTT**: `say_text` only; binary frames are never sent there.

## 7. Known client issues found while building this kit

- In `/dev/split` (Flyer iframe ≈ 720 × 868) the `OVERHEAD` station shot crops the left column
  (`OH_BTN_1` lands at x ≈ −60 px), so the Flyer can't click it; full tabs at 1440 × 900 and
  1280 × 720 frame every control. `mock-play` therefore uses two tabs.
- `getHealth()` fetches same-origin `/health`, which the Vite proxy doesn't forward. **Confirmed**
  at `client/src/net/api.ts:88-90` plus `client/vite.config.ts:14-18` (only `/api`, `/ws`, `/clips`
  are proxied); being fixed separately.
- The `/dev/split` `OVERHEAD` crop above is being fixed separately too.
