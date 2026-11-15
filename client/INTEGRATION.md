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
E2E_SERVER=real npm run e2e -- --project flows split-bots mock-play rejoin lifeline
```

- Without a reachable server the run stops at once: the global setup calls `GET /health` on
  `VITE_PROXY_TARGET` and also refuses a server whose health says `dev_mode`/`mock_speech` false.
- Playwright starts its own Vite on **:5176** with your `VITE_PROXY_TARGET`. If something already
  listens on 5176 it is reused, proxy target and all; stop it or set `E2E_PORT`.
- Every flow uses a fresh random room code, so a long-running server doesn't collide.
- In both modes each flow ends with `expectCleanWire`: every client frame parses against §A7, and
  the Tower socket never received `flyer_view`, `object_state`, a Flyer-only `fx` or a cinematic
  with `fire_side`/`stopped_side`/`damaged_side`; the Flyer never received `manual_card` (§A9).
  In real mode this is read from the real WebSocket frames, so it checks **your** server.
- Default mode (`npm run e2e`) needs no backend: `e2e/fakeServer/` answers `/ws` and `/api` inside
  the browser (Playwright `routeWebSocket`). It is a tiny script (2 one-step actions per phase,
  judged at once, fire always on the right), not a reference implementation. Yours wins.

| Spec         | What it drives                                                                          | What it needs from the server                                                |
| ------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `split-bots` | `/dev/split?…&seed=42&bots=both`, prologue → deck ≤ 6 min, a screenshot per phase title | `dev bots`, bots vote skip, the whole state machine                          |
| `mock-play`  | two tabs, both pairings: quick-say, a wrong button, then the expected control           | `quick_say` on the card, `dev_state.expected`, judging, `action_result.used` |
| `rejoin`     | join form handshake, taken role, Flyer refresh mid-phase, swap roles at the deck        | tokens, rejoin snapshot, PAUSED/resume, `joined` re-sent after `swap_roles`  |
| `lifeline`   | `goto_phase 3`, three decodes, refusal at 0, a Tower decode; both pairings              | `lifeline_available`, last-3 window, `translation` in the listener's script  |

The Flyer clicks controls with real mouse clicks on the canvas (positions projected from the
live scene, `e2e/kit/cockpit.ts`), and reads the expected step from the dev panel (`dev_state`).

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
- [ ] **§A16 lifeline**: `translation` to the spender, `game_state` to both; errors from §A15.
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
- `getHealth()` fetches same-origin `/health`, which the Vite proxy doesn't forward.
