# Fade — Build Spec (MVP)

Nov 14, 2026 · @Atharva Zaveri

## 0. How to use this spec

This document is the complete build brief for **Fade**, a two-player browser game. An AI coding agent should be able to build a playable MVP from it with no other context. Build it so it runs **fully offline in Mock Mode first** (typed text instead of microphones, no AWS), then switch on the real AWS speech pipeline.

**Rules for the builder**

1. Follow the build milestones in section 18 in order. Milestone M1 must produce something playable end to end in Mock Mode, so the team can see it early.
2. All game content (word list, phases, actions, lines) lives in JSON files under `content/`. Never hard-code lines in components. Copy the lines in sections 7, 9, 10 and 11 **exactly**, including Devanagari.
3. The server is the single source of truth for game state. Clients only send intents ("I clicked button 3", "I said this") and render what the server tells them.
4. Build every 3D object from primitives (drei `RoundedBox`, cylinders, spheres, capsules). No external 3D files are required for the MVP. Asset swaps come later.
5. Generate sound effects procedurally with the Web Audio API (section 14), so no audio downloads are needed.
6. Run the content validator (section 17) in CI and on server start. If it fails, the server refuses to start.
7. When something in this spec is ambiguous, pick the simplest option that keeps the game playable, and leave a `// SPEC-ASSUMPTION:` comment.

**Text and language rule (do not miss):**

- Each player's **own material** (their manual, UI labels, title cards, word-deck header) is in their own language and script. A Hindi Tower reads the manual in Devanagari.
- **Subtitles of the partner's speech are always in Latin (English) letters.** Hindi speech appears as romanized Hindi (*teen number button dabao*), never Devanagari. Glosses are in Latin letters too.
- **The manual never scripts sentences.** It shows the panel, what to find out, and a rule table. Players say everything in their own words.
- **Players may mix English into Hindi (Hinglish)**: *overhead panel*, *engine*, *left*, *switch two*. This is allowed and never penalized (section 6.7).

**Words used in this spec**

| Term | Meaning |
| --- | --- |
| Flyer | The player inside the 3D cockpit. Sees and touches the controls. Default language: English. |
| Tower | The player in the control tower. Has the manual and the radar, never sees the cockpit. Default language: Hindi. |
| Phase | One of the three story chapters (Pilot Down, Engine Fire, Storm Landing). Phase number = signal level. |
| Signal level | How much translation help the subtitles give: 1 = strong, 2 = weak, 3 = lost. |
| Action | One step of a phase: the Tower reads a line, the Flyer acts on a control. 5 to 8 per phase. |
| Concept | One word-list entry, such as RED, with a Hindi form and an English form. 20 in total. |
| Keyword | Any spoken token that matches a concept. |
| Gloss | The translation shown in brackets next to a keyword in a subtitle, for example *laal \[red\]*. |
| Utterance | One push-to-talk transmission: from key down to key up. |
| Station | The panel of controls the Flyer uses in a phase: Overhead, Pedestal, or Front. |

## 1. Product overview

**Fade is a co-op cockpit game where two people who don't share a language must land a plane together, and the translator fades a little more each phase until they're using each other's words.** Pitch line: *a translator designed to make itself unnecessary.*

**Story.** The pilot has passed out mid-flight. The Flyer is a passenger stuck in the cockpit. The Tower is a controller on the ground who has the flight manual. They talk over a push-to-talk radio, and the radio signal degrades as the plane descends into a storm.

**Roles**

|  | Flyer | Tower |
| --- | --- | --- |
| Screen | First-person 3D toy cockpit | 2D control-tower screen: manual, radar, checklist |
| Can see | The controls, the lamps, the window | The manual steps and branches, the radar, fuel |
| Can't see | The manual | The cockpit |
| Does | Describes what they see, operates controls | Asks questions, reads the right instruction |
| Speaks (default) | English | Hindi |

Languages are a lobby setting. All content is authored in both Hindi and English, so either role can use either language. The two players must pick different languages.

**Core loop (one action)**

1. The current step's page opens in the Tower's manual: a drawing of the panel, **what to find out** (for example: Overhead panel → right lamp → color?) and a **rule table** (green → green button, press three times; red → red button, press two times). In the cockpit, the matching lamp changes.
2. The Tower asks for what they need, **in their own words** (“Overhead panel pe daayan wali light ka rang kya hai?”). The manual gives hints, never sentences.
3. The Flyer describes what they see, in their language (“It's green!”).
4. The Tower looks up the rule and tells the Flyer what to do, again in their own words.
5. The Flyer operates the control. Correct = the step ticks and the next one starts. Wrong = buzzer, camera shake, minus 10 seconds of fuel.

Both players hear each other's **real voices** in the room. The game transcribes every transmission and shows the listener a subtitle in the speaker's language, with keywords highlighted and, depending on the signal level, translated.

**The three phases and signal levels**

| Phase | Story | Station | Actions | Signal | Subtitles show |
| --- | --- | --- | --- | --- | --- |
| 1 | Pilot Down | Overhead panel | 7 | Strong | Every keyword highlighted **and** glossed: *teen \[three\] number button dabao \[press\]* |
| 2 | Engine Fire | Center pedestal | 6 | Weak | Every keyword highlighted. Only keywords the listener hasn't learned yet are glossed |
| 3 | Storm Landing | Front panel | 8 | Lost | Every keyword highlighted, **none** glossed. Lifelines (3 per player) reveal a full translation |

**The learning rules this content guarantees**

- Players speak freely, so the game guarantees **concepts**, not exact sentences. Every step forces certain concepts across the radio: the observed value (a color, yes/no, a side), and the target control's color, number or side, the verb and the count.
- Phase 1 steps **force all 15 Phase 1 concepts at least once on every path (the example lines say each at least twice). Phase 2 steps force the 5 new concepts at least once (twice in the example lines). Phase 3 steps force all 20 concepts except WHICH, a question word checked on the example lines only,** and introduce none.
- The manual prints each value and action with its keyword in the Tower's language (लाल, दबाओ, तीन बार), highlighted, so the natural thing to say is the keyword.
- The gloss rule works from what each listener actually heard, so it adapts when someone says it differently.

**End screen.** A word deck per player: the partner-language words they understood without help, each playable in their partner's real recorded voice, plus a short mission report.

## 2. Non-goals and guardrails

The MVP deliberately leaves these out. Do not build them unless section 19 is reached.

- **No walking or free camera.** The Flyer sits in one seat. The camera only moves in scripted moves between fixed shots. No OrbitControls in production builds.
- **No physics engine.** Every control is a click with a scripted animation.
- **No voice streaming between players.** Players sit in the same room and hear each other directly. Audio only goes from each browser to the server for transcription.
- **No AI in the live subtitle loop.** Keyword matching, glossing and the level rules are deterministic Python. Amazon Translate runs once per utterance only to prepare the lifeline translation. Amazon Bedrock is only used for the end-of-game mission report and has a template fallback.
- **No text-to-speech.** Amazon Polly is not used. Translations are shown as subtitles.
- **No accounts or login.** Rooms are joined with a 4-letter code.
- **No mobile layout for the Flyer.** Desktop Chrome is the target. The Tower screen should work on a laptop; a tablet is a bonus.

**Guardrails**

- Keyword highlight style is **the same for every keyword**. Never color the word *laal* red or style colors and numbers differently: that would leak the meaning and break the learning test.
- The Tower client must never receive the Flyer's hidden variables (which lamp is lit, which engine is on fire). The Flyer client must never receive the manual. Send each role only what it needs.
- Only the current station's controls are clickable. Controls on other stations render but ignore clicks.
- During cinematics, all input except push-to-talk is disabled.
- Fun and cartoonish, never scary: crashes end in a cartoon "poof" cloud, no injuries.

## 3. Tech stack and repo layout

A React + Three.js client talks to one Python FastAPI server over a single WebSocket per player.

| Layer | Choice | Notes |
| --- | --- | --- |
| Client build | Vite + TypeScript | `npm create vite@latest client -- --template react-ts` |
| 3D | React Three Fiber, @react-three/drei, @react-three/postprocessing | Use the latest mutually compatible stable versions (R3F v9 needs React 19). Bloom for glowing lamps. |
| Client state | zustand | One store, updated from server messages |
| Cinematics | GSAP timelines | Tweens a camera rig, lights and props |
| 2D UI | Tailwind CSS | Tower screen, HUD, lobby, word deck |
| Fonts | "Baloo 2" (Google Fonts) | Playful, and supports both Latin and Devanagari |
| Server | Python 3.11+, FastAPI, uvicorn, pydantic v2 | One process, game state in memory |
| Speech-to-text | Amazon Transcribe streaming via the `amazon-transcribe` Python SDK | One stream per utterance |
| Translation | Amazon Translate via boto3 | Lifeline translation, prepared once per utterance |
| Report | Amazon Bedrock Converse API via boto3 | Model id from env var, template fallback |
| Storage | Amazon DynamoDB via boto3 | Game results only; optional |
| Fuzzy match | rapidfuzz | Romanized and English keyword matching |
| Romanization | aksharamukha or indic-transliteration | Devanagari to readable Latin for filler words; verify output quality |

**Repo layout**

```
fade/
  README.md                    # how to run mock mode in 2 commands
  docker-compose.yml           # server + client for local dev
  content/
    lexicon.json               # section 7
    phase1_pilot_down.json     # section 9
    phase2_engine_fire.json    # section 10
    phase3_storm_landing.json  # section 11
    validate_content.py        # section 17
  server/
    requirements.txt
    Dockerfile
    app/
      main.py                  # FastAPI app, GET /health, WS /ws/{room_code}, GET /clips/{clip_id}.wav
      config.py                # env vars (section 15)
      protocol.py              # pydantic models for every WS message (section 4)
      rooms.py                 # Room, Player, room registry, 4-letter codes
      game.py                  # state machine, fuel, actions, randomization (section 5)
      content.py               # load + validate content JSON
      language/
        lexicon.py             # normalize, tokenize, match (section 6)
        subtitles.py           # build subtitle segments + gloss rule
        exposure.py            # per-listener word stats
        romanize.py
      speech/
        transcribe_aws.py      # real Transcribe streaming
        transcribe_mock.py     # typed text in, same result shape out
        translate.py           # AWS + mock
      audio.py                 # PCM buffers, WAV encode, word-clip cutting
      deck.py                  # word deck + Bedrock report
      persistence.py           # DynamoDB + no-op
    tests/
  client/
    index.html
    src/
      main.tsx
      App.tsx                  # routes: / , /r/:code , /dev/split
      net/socket.ts            # WS connect/reconnect, send helpers
      net/protocol.ts          # TS types mirroring protocol.py
      state/store.ts           # zustand
      audio/mic.ts             # getUserMedia + worklet + push-to-talk
      audio/pcm-worklet.js     # downsample to 16 kHz Int16
      audio/sfx.ts             # procedural sound effects
      scene/CockpitCanvas.tsx  # <Canvas>, lights, postprocessing
      scene/Cockpit.tsx        # shell, seats, windows, pilot
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
      scene/env/Sky.tsx         # stars, moon, clouds, sunrise
      scene/env/Weather.tsx     # rain, lightning, fog
      scene/env/WingFire.tsx    # fire + smoke particles
      scene/env/Runway.tsx
      scene/env/ExteriorPlane.tsx
      scene/characters/Pilot.tsx
      cinematics/cameraRig.ts   # shots + tween helpers
      cinematics/timelines.ts   # one function per cinematic id
      ui/Lobby.tsx
      ui/FlyerHUD.tsx
      ui/TowerScreen.tsx
      ui/ManualCard.tsx
      ui/Radar.tsx
      ui/Checklist.tsx
      ui/Subtitles.tsx
      ui/PTTIndicator.tsx
      ui/Lifelines.tsx
      ui/TitleCard.tsx
      ui/Toasts.tsx
      ui/WordDeck.tsx
      ui/DevPanel.tsx
```

## 4. Architecture and message protocol

Each browser holds one WebSocket to the server. Speech goes up as raw audio; subtitles, state and cinematic cues come down.

```
 Flyer browser (3D cockpit)                       Tower browser (manual + radar)
   mic PCM 16kHz (while PTT held)                   mic PCM 16kHz (while PTT held)
   intents: interact, lifeline, skip               intents: lifeline, skip
        \                                              /
         \______________ WebSocket (wss) ____________/
                               |
                 FastAPI game server (Python, one process)
                 - Room registry, game state machine, fuel timer
                 - Language engine: match -> gloss rule -> subtitle segments
                 - Utterance store (audio, transcript, word timings, translation)
                    |            |              |              |
          Transcribe stream  Translate     Bedrock         DynamoDB
          (per utterance)    (lifeline)    (report)        (results)
```

**Utterance lifecycle (real mode)**

1. Player holds Space (or the on-screen PTT button). Client sends `ptt_start`. Server grants the channel if free, else replies `channel_busy`.
2. Client streams binary WebSocket frames: mono Int16 little-endian PCM at 16 kHz, 100 ms per frame (3,200 bytes).
3. Server opens a Transcribe stream in the speaker's language (`hi-IN` or `en-US`), forwards frames, and appends them to the utterance buffer. Partial transcripts go back to the speaker only as `caption_partial`.
4. Player releases. Client sends `ptt_end`. Server ends the Transcribe stream and waits for the final result (timeout 4 s).
5. Server builds the Utterance record: transcript, word items with start/end times, matched keywords.
6. Server builds subtitle segments for the listener using the listener's signal level and exposure (section 6), sends `utterance` to the listener and `utterance_echo` to the speaker.
7. In the background, server calls Translate on the transcript and stores the result (used by lifelines and the word deck).
8. Server updates exposure counters (heard, glossed) for the listener.

In Mock Mode, steps 1 to 4 are replaced by a `say_text` message carrying typed text. Everything from step 5 on is identical.

**Utterance record (server)**

```python
class Utterance(BaseModel):
    id: str                 # "u_" + short uuid
    room: str
    speaker_id: str
    speaker_role: Literal["flyer", "tower"]
    lang: Literal["hi", "en"]
    phase: int              # 1..3, also the signal level
    action_id: str | None   # action active when spoken
    transcript: str         # as Transcribe returned it (Devanagari for hi)
    items: list[WordItem]   # token, start_s, end_s, confidence
    matches: list[Match]    # token span -> concept id
    pcm: bytes | None       # raw audio, kept in memory for clips
    translation: str | None # filled in the background
    created_at: float
```

**Client → server messages** (JSON text frames, plus binary audio frames between `ptt_start` and `ptt_end`)

| type | Payload | Who | Effect |
| --- | --- | --- | --- |
| `join` | `{name, role, lang}` | both | Joins the room in the URL. Role is `flyer` or `tower`. |
| `ready` | `{}` | both | Game starts when both are ready and languages differ. |
| `ptt_start` | `{}` | both | Request the radio channel. |
| (binary) | PCM frame | both | Only accepted while holding the channel. |
| `ptt_end` | `{}` | both | Finish the utterance. |
| `say_text` | `{text}` | both | Mock Mode only. Treated as a finished utterance. |
| `interact` | `{object_id, verb, value?}` | flyer | `verb`: `press`, `toggle`, `pull`, `move_down`, `move_up`. |
| `lifeline` | `{utterance_id}` | both | Phase 3 only. Spend one lifeline to reveal that utterance's translation. |
| `skip_cinematic` | `{}` | both | Skips when both players have pressed it. |
| `retry` | `{}` | both | After a crash, restart the current phase. |
| `dev` | `{cmd, args}` | both | Dev Mode only: `complete_action`, `goto_phase`, `set_seed`, `fail_action`. |

**Server → client messages**

| type | Payload | Sent to |
| --- | --- | --- |
| `room_state` | room code, players (name, role, lang, ready, connected), status | both |
| `game_state` | phase, action index, total actions, fuel seconds, lifelines left (per player), signal level | both |
| `flyer_view` | station id, interactive object ids, object states, which lamp is blinking | flyer only |
| `manual_card` | the current action card in the Tower's language (section 13) | tower only |
| `cinematic` | `{id, start_at_ms}` (server clock); also cinematic\_skip {id} when both players have skipped | both |
| `caption_partial` | `{text}` | speaker only |
| `utterance` | `{id, speaker_role, lang, segments[], level, lifeline_available}` | listener |
| `utterance_echo` | `{id, transcript_display}` | speaker |
| `translation` | `{utterance_id, text}` | the player who spent the lifeline |
| `action_result` | `{action_id, success, reason, fuel_delta}` | both |
| `object_state` | `{object_id, state}` | flyer |
| `channel` | `{busy_by: role or null}` | both |
| `toast` | `{kind, text}` (for example CROSSOVER!) | one or both |
| `crash` | `{phase}` | both |
| `deck` | word deck payload (section 13) | each player gets their own |
| `error` | `{code, message}` | one |

The server's clock is the reference. Each `cinematic` message carries `start_at_ms` about 300 ms in the future, so both screens start in sync. Clients estimate clock offset from a `ping`/`pong` on connect.

## 5. Game flow and state machine

A game is a fixed sequence of states driven by the server. Cinematic states advance on a timer (or a double skip); play states advance when the last action of the phase succeeds.

```
LOBBY --both ready, languages differ--> PROLOGUE (cin: prologue)
PROLOGUE --> PHASE_INTRO(1) (cin: p1_intro) --> PLAYING(1)
PLAYING(n) --last action ok--> PHASE_OUTRO(n) (cin: pN_outro)
PHASE_OUTRO(1) --> PHASE_INTRO(2) (cin: p2_intro) --> PLAYING(2)
PHASE_OUTRO(2) --> PHASE_INTRO(3) (cin: p3_intro) --> PLAYING(3)
PHASE_OUTRO(3) (cin: landing) --> ENDING (cin: ending) --> DECK
PLAYING(n) --fuel reaches 0--> CRASH (cin: crash) --both press retry--> PHASE_INTRO(n)
any state --a player disconnects--> PAUSED --same player rejoins within 60 s--> previous state
```

**Fuel (the timer)**

| Phase | Starting fuel | Notes |
| --- | --- | --- |
| 1 | 150 s |  |
| 2 | 150 s |  |
| 3 | 180 s |  |

- Fuel only drains in `PLAYING`. It pauses during cinematics, the in-phase scripted events and `PAUSED`.
- Wrong action: −10 s. Crossover bonus (section 6): +5 s, max once per concept per player.
- Fuel at 0: state `CRASH`. Retry restarts the phase from action 1 with new randomization and full fuel. Word exposure is kept. Lifelines reset to 3.
- The server broadcasts `game_state` once per second while playing, and on every change.

**Randomization**

- Each game has a seed (random, or `?seed=` in Dev Mode). Use one seeded RNG per game.
- Each action can declare a variable with options and weights (sections 9 to 11). The value is rolled when the action becomes active, never earlier.
- Phase 2's `FIRE_SIDE` is rolled once at phase start and reused by actions B1 to B5.

**How an action is judged**

Each action has `expect`: an ordered list of steps (or `unordered: true` for steps that may come in any order). A step is `{object, verb, value?, count?}`.

| Verb | Object type | Rule |
| --- | --- | --- |
| `press` | PushButton | Server counts presses on that object. 1.2 s after the last press, compare the count to `count` (default 1). Equal = step done. Not equal = wrong. |
| `toggle` | ToggleSwitch | New state = opposite of current. If it equals `value` (`on` or `off`) = step done, else wrong. |
| `pull` | PullHandle | One-shot. Handle animates out and stays out. |
| `move_down` | UpDownLever | Lever goes to `down`. |
| `move_down` | NotchLever | Moves one notch down (0 → 1 → 2). Counted like presses: after 1.2 s idle, compare notches moved to `count`. |

- **Wrong** = any interaction on the current station that doesn't match the next expected step. The control plays its animation and snaps back, so its state doesn't change. Completed steps of the current action are kept; partial press or notch counts reset.
- **Right** = when the final step is done: send `action_result` (success), tick the Tower's checklist, play the action's success effects (sections 9 to 11), switch off the observed lamp, then after 1.5 s activate the next action.
- Clicks on controls of other stations are ignored with no penalty.
- Clicks on the current station while no action is active (during the 1.5 s gap) are ignored.

**Observed lamps**

When an action with an `observe` variable starts, the server sets the observed lamp from the rolled value and puts a pulsing white attention ring around it, so the Flyer knows which lamp the Tower is asking about. The lamp itself shows its true rolled state: lit in a color (and blinking at 1 Hz), or dark when the answer is “no, it's off”. When the action ends, the lamp goes dark unless the action says `keep_lamp`.

## 6. Language engine

Every utterance becomes a list of subtitle segments for the listener. Keywords are always highlighted; whether they carry a gloss depends on the phase and on what that listener has already seen.

### 6.1 Normalizing and matching

Run on the speaker's transcript, in the speaker's language.

1. Unicode NFC, lowercase, strip punctuation including Devanagari । and ॥, dashes and quotes. Keep each token's character offsets in the original string.
2. Devanagari only: replace candrabindu ँ with anusvara ं and drop nukta ़ before comparing (so हाँ and हां both match YES).
3. Digits: ASCII `1`–`4` and Devanagari १–४ map to ONE–FOUR. Transcribe often writes numbers as digits.
4. Multi-word variants first, longest first: *kaun sa / kaun si / kaun se* and कौन सा / सी / से → WHICH. English *twice* → TWO + TIMES (one segment, two concepts).
5. Exact single-token match against the speaker language's variants (section 7).
6. Fuzzy match, Latin script only, tokens of 4+ letters: rapidfuzz `ratio >= 85` against variants of 4+ letters. Never fuzzy-match Devanagari or short tokens (*do*, *ek*, *on*).
7. English ON / OFF guard: *on* and *off* only count when the next token is not one of `the, a, an, top, my, your, it, this, that`. This avoids "on the left".
8. Loanwords (light, button, lever, switch, engine, number, pump, fuel, autopilot) are never keywords. In Hindi transcripts they arrive in Devanagari; map them to their English spelling for display using the loanword table in section 7.

### 6.2 Subtitle segments

The server sends the listener `segments`, in order, covering the whole utterance:

```json
[
  {"text": "teen", "kind": "keyword", "concept": "THREE", "gloss": "three"},
  {"text": " number button ", "kind": "plain"},
  {"text": "dabao", "kind": "keyword", "concept": "PRESS", "gloss": null}
]
```

- **Every subtitle is written in Latin (English) letters, whatever language was spoken.** The voice is Hindi; the text is romanized Hindi. When the Tower says “तीन नंबर बटन दबाओ”, the Flyer reads *teen number button dabao*. Devanagari never appears in a subtitle; it exists only inside the server (Transcribe output and matching).
- **How romanizing works:** keyword segments use the romanized form stored with the matched variant (section 7); loanwords use the loanword table (लाइट → light); other words use the filler-word overrides, then the romanizer. English speech shown to a Hindi listener stays as it is.
- **Glosses are in the listener's language, also in Latin letters.** English listener: *teen \[three\]*. Hindi listener: *red \[laal\]*.
- Render: plain text, then each keyword as a chip with one uniform highlight style, gloss in smaller text in square brackets after it. Never color a chip by its meaning.

### 6.3 The gloss rule

```python
GLOSS_THRESHOLD = 2  # config

def should_gloss(level: int, concept: Concept, listener: PlayerStats) -> bool:
    if level == 1:
        return True
    if level == 2:
        return concept.introduced_in == 2 or listener.glossed[concept.id] < GLOSS_THRESHOLD
    return False  # level 3: highlight only, never gloss
```

- The rule is per listener. A Phase 1 word the listener happened to see glossed only once stays glossed in Phase 2.
- After building segments, increment `heard` for every keyword and `glossed` for every keyword shown with a gloss.
- The speaker gets `utterance_echo` with their own transcript (in Latin letters, romanized if Hindi; no glosses) so they know they were heard.

### 6.4 Lifelines (Phase 3)

- Each player has 3 lifelines in Phase 3. Phases 1 and 2 show no lifeline UI.
- The listener taps any of the last 3 subtitles from their partner. If the translation is ready, the server decrements the count and sends `translation`. If it is still running, wait for it (up to 3 s), then send. If Translate fails, send an error and don't decrement.
- The revealed translation shows under that subtitle for 6 s, then collapses to a small "show" link that re-opens it for free.
- Translation text is the full sentence in the listener's language. It is prepared once per utterance in the background (section 4, step 7).

### 6.5 Learning credits (feeds the word deck)

Per player, per concept, keep `heard`, `glossed`, `understood`, `spoken`.

- **Understood:** when an action succeeds in Phase 2 or 3, for each player, every concept that appeared in the partner's utterances during that action, was shown to this player **without** a gloss, and was not in an utterance this player spent a lifeline on gets `understood += 1`. Both players get credit, because success means the Tower also understood the Flyer's report.
- **Spoken (crossover):** after matching in the speaker's language, also match the transcript against the **listener's** language variants plus the concept's `crossover_variants`. Each hit gives the speaker `spoken += 1`, a CROSSOVER! toast and +5 s fuel (once per concept per player per game). This is best effort with real speech recognition and exact in Mock Mode.

### 6.6 Mock Mode translation

Without AWS, `translate.py` first normalizes the text and looks it up in an index of every authored line (both languages, every branch). A hit returns the authored counterpart. A miss falls back to keyword substitution: replace each keyword with its listener-language form and keep the rest as is.

### 6.7 Mixed speech (Hinglish)

Hindi speakers naturally mix in English words, and the game must accept that without breaking or punishing it.

- **Transcription:** run each player's stream with Transcribe multi-language identification (`IdentifyMultipleLanguages`, `LanguageOptions` = `hi-IN,en-US`, the player's own language preferred). English words come back in Latin letters, Hindi in Devanagari. Fallback if that is unreliable: `hi-IN` only, and map Devanagari spellings of English words (ओवरहेड → overhead, लेफ्ट → left) through the shared-words and crossover tables in section 7.
- **Display:** Latin tokens stay as said; Devanagari tokens are romanized. A word that is already in the listener's own language is shown as plain text, with no chip and no gloss, **even if it is a keyword**. Example for an English listener: *Aag \[fire\] wala engine left hai? Toh left laal handle kheencho!*
- **Learning:** a keyword said in the listener's own language gives no exposure to the partner's word (the Flyer heard “left”, not *baayan*). It is never penalized.
- **Shared words** (section 7) are never keywords and never styled, in either language.
- **Crossover bonus** only counts a partner-language keyword the speaker has already been shown in this game, once per concept. So a Hindi speaker saying “left” by habit doesn't farm points.
- The off-language penalty stays a stretch feature (section 19) and must ignore shared words and the patterns above.

## 7. Word list (lexicon)

The game uses exactly 20 concepts: 15 introduced in Phase 1 and 5 in Phase 2. The first form in each cell is the canonical display form; the rest are matching variants. Store this as `content/lexicon.json`.

| Concept | Phase | English (display, variants) | Hindi romanized (display, variants) | Hindi Devanagari (display, variants) |
| --- | --- | --- | --- | --- |
| RED | 1 | red | laal, lal | लाल |
| GREEN | 1 | green | hara, hari, hare | हरा, हरी, हरे |
| BLUE | 1 | blue | neela, neeli, neele, nila, nili | नीला, नीली, नीले |
| ONE | 1 | one, 1 | ek, 1 | एक, १ |
| TWO | 1 | two, 2 | do, 2 | दो, २ |
| THREE | 1 | three, 3 | teen, tin, 3 | तीन, ३ |
| FOUR | 1 | four, 4 | chaar, char, 4 | चार, ४ |
| PRESS | 1 | press, pressed, pressing | dabao, dabaao, dabaiye, dabana, daba | दबाओ, दबाइए, दबाना, दबा |
| PULL | 1 | pull, pulled, pulling | kheencho, kheecho, khincho, kheenchiye, kheench | खींचो, खींचिए, खींचना, खींच |
| ON | 1 | on | chalu, chaalu | चालू |
| OFF | 1 | off | band, bandh, bund | बंद, बन्द |
| YES | 1 | yes, yeah, yep, yup | haan, haa, han | हाँ, हां |
| NO | 1 | no (display), not, don't, nope | nahi, nahin, nai, mat | नहीं, नही, मत |
| WHICH | 1 | which | kaun sa, kaun si, kaun se, kaunsa, konsa, kon sa | कौन सा, कौन सी, कौन से, कौनसा, कौनसी |
| TIMES | 1 | times (twice = two + times) | baar, bar | बार |
| FIRE | 2 | fire, burning | aag, aagh | आग |
| LEFT | 2 | left | baayan, bayan, baayaan, baayein, baaye | बायाँ, बायां, बाएँ, बाएं, बाईं |
| RIGHT | 2 | right | daayan, dayan, daayaan, daayein, daaye | दायाँ, दायां, दाएँ, दाएं, दाईं |
| YELLOW | 2 | yellow | peela, peeli, peele, pila, pili | पीला, पीली, पीले |
| DOWN | 2 | down | neeche, niche, neechay | नीचे |

**Each Devanagari variant is stored with its romanized form**, so subtitles can show the exact word that was said: `{"deva": "हरी", "roman": "hari"}`.

**Crossover variants (best effort).** How `en-US` Transcribe may spell a Hindi word when the English speaker tries it. Start with: RED *lal, laal, lull*; BLUE *neela, nila*; YELLOW *peela, pila*; FIRE *aag, ag*; THREE *teen*; FOUR *char*; YES *haan, hun*; NO *nahi, nahin*. Hindi speakers saying English words usually come through as Devanagari loan spellings (रेड = red, ग्रीन = green, ब्लू = blue, येलो = yellow, लेफ्ट = left, राइट = right, फायर = fire, डाउन = down, पुल = pull, प्रेस = press, ऑन = on, ऑफ = off, यस = yes, नो = no); add those as the Hindi side's crossover variants.

**Shared words (never keywords, allowed in both languages, displayed in English)**

| English | Devanagari spellings |
| --- | --- |
| light | लाइट, लाईट |
| button | बटन |
| lever | लीवर, लिवर |
| switch | स्विच |
| engine | इंजन, इंजिन |
| number | नंबर, नम्बर |
| pump | पंप, पम्प |
| fuel | फ्यूल |
| autopilot | ऑटोपायलट |

Also shared: overhead, panel, pedestal, front, handle, radio, tower, pilot, runway, gear, flaps, brake, OK. English keyword words (left, right, red, two …) spoken by the Hindi speaker are not on this list; section 6.7 handles them.

**Common filler words (romanizer overrides)**, so subtitles read naturally instead of in academic transliteration: करो karo · या ya · फिर phir · और aur · है hai · हैं hain · में mein · जल jal · रही rahi · रहा raha · अभी abhi · भी bhi · से se · का ka · को ko · वाला wala · वाली wali · ठीक theek · हो ho · गया gaya.

**JSON shape (one entry)**

```json
{
  "id": "GREEN",
  "introduced_in": 1,
  "en": {"display": "green", "variants": ["green"], "crossover": ["ग्रीन"]},
  "hi": {
    "display_roman": "hara",
    "display_deva": "हरा",
    "variants": [
      {"deva": "हरा", "roman": "hara"},
      {"deva": "हरी", "roman": "hari"},
      {"deva": "हरे", "roman": "hare"}
    ],
    "crossover": ["hara", "hurra"]
  }
}
```

## 8. Cockpit world and interactive parts

The cockpit is a chunky, rounded toy built entirely from primitives, with three stations: Overhead (Phase 1), Pedestal (Phase 2) and Front panel (Phase 3). The world stands still; clouds, rain and the runway move past it.

### 8.1 Visual style

- **Look:** a toy plane cockpit in the style of Mario Kart and BOMBANANA!: thick rounded shapes, bevelled edges, saturated colors, a thin dark outline on controls (drei `Outlines`, thickness \~0.004).
- **Materials:** `MeshStandardMaterial`, roughness 0.55, metalness 0. Lamps use emissive color at intensity 2.5 so Bloom makes them glow.
- **Postprocessing:** Bloom (luminance threshold 1.0, intensity 0.8), Vignette (0.35). On a wrong action, a 250 ms red vignette pulse.
- **Palette**

| Use | Hex |
| --- | --- |
| Cockpit shell, seats | #F2E8D5 (cream), seat cushions #E07A5F |
| Panels | #2B2F3A (slate), panel edges #3D4352 |
| Red controls / lamps | #E5484D |
| Green | #30A46C |
| Blue | #3E63DD |
| Yellow | #F5C518 |
| Neutral buttons, levers | #D9D9E0 caps, #8B8D98 shafts |
| Labels | #111111 on light caps, #F5F5F5 on dark panels |
| Exterior plane | #F2E8D5 body, #2EC4B6 stripe |

- **Labels on controls are language-neutral:** digits 1–4, arrows ← →, and simple shapes. No words on any control. Use drei `Text` with the bundled Baloo 2 font.
- Colors must stay distinguishable for color-blind players, so every colored control also differs by position.

### 8.2 Layout and coordinates

Meters, +Y up, the Flyer faces −Z. Origin = cockpit floor center. Tune visually; these numbers are a starting point.

| Element | Placement |
| --- | --- |
| Pilot seat (left) | x −0.5, z 0.3 |
| Flyer seat (right) | x +0.5, z 0.3. Flyer eye at (0.5, 1.3, 0.35) |
| Windshield | Two panes, x −1.1 to 1.1, y 1.2 to 1.9, z −1.15, tilted 20° back |
| Side windows | x ±1.2, y 1.2 to 1.7, z −0.6 to 0.4 |
| Front panel | x −1.0 to 1.0, y 0.8 to 1.15, z −0.95, face tilted 15° toward the Flyer |
| Overhead panel | x −0.6 to 0.6, y 1.95, z −0.55 to 0.05, face angled 35° down |
| Pedestal | x −0.25 to 0.25, y 0.5 to 0.85, z −0.8 to −0.1, sloped top |
| Wings + engines | Outside each side window: wing from x ±1.3 to ±4.0 at y 1.0; engine nacelle with spinning propeller at x ±2.6 |

**Camera shots** (position → look-at target)

| Shot id | Position | Target |
| --- | --- | --- |
| `FLYER_DEFAULT` | (0.5, 1.3, 0.35) | (0.2, 1.0, −1.0) |
| `OVERHEAD` | (0.35, 1.35, 0.25) | (0, 1.95, −0.3) |
| `PEDESTAL` | (0.4, 1.35, 0.25) | (0, 0.75, −0.45) |
| `FRONT` | (0.45, 1.3, 0.3) | (0.1, 0.98, −0.95) |
| `RIGHT_WINDOW` | (0.5, 1.3, 0.35) | (3.0, 1.1, −0.2) |
| `LEFT_WINDOW` | (0.3, 1.3, 0.3) | (−3.0, 1.1, −0.2) |
| `PILOT` | (0.4, 1.35, 0.4) | (−0.5, 1.1, −0.1) |
| `WIDE_INTERIOR` | (0, 1.6, 1.4) | (0, 1.1, −0.8) |
| `EXT_SIDE`, `EXT_CHASE`, `EXT_FRONT_LOW` | Relative to the exterior plane: (6, 1, 4), (0, 1.5, 7), (0, −0.5, −8) | The exterior plane |

The exterior plane is a separate model at world (0, 50, −300) under the same sky. Exterior shots move the camera next to it; the cockpit is simply out of view.

### 8.3 Interactive part types

Each part is a component with props `{id, label, color, state, interactive, blinking}`. Hover = emissive lift + pointer cursor. Click sends `interact` to the server. The visual state only changes when the server confirms with `object_state`; on a wrong action the part plays its motion and springs back.

| Type | Looks like | States | Motion |
| --- | --- | --- | --- |
| PushButton | Rounded square cap 6 × 6 cm (round 9 cm for big ones) | none | Sinks 1.2 cm, 80 ms down, 120 ms up |
| ToggleSwitch | Metal bat on a plate, small status lamp above | `on` (bat up, lamp green) / `off` | Bat flips 50° in 120 ms |
| PullHandle | T-handle on a stem | `in` / `out` | Slides 6 cm toward the Flyer in 250 ms, stays out |
| UpDownLever | Shaft in a slot with a ball knob | `up` / `down` | Rotates 25° in 300 ms |
| NotchLever | Like UpDownLever with 3 tick marks | notch 0, 1, 2 | Each move is 15° with a click |
| Lamp | Dome, radius 3 cm (master: 6 cm) | `off` or a color, plus `blinking` | Blink 1 Hz; off = dark grey, no emissive |
| FuelGauge | Round dial with a needle and red zone | 0–100% | Needle eases to the server's fuel value |

### 8.4 Station inventories

Ids are global and prefixed by station. “Spoken as” is how the manual refers to it.

**Overhead (OH\_), Phase 1**

| Id | Type | Label / color | Initial | Spoken as |
| --- | --- | --- | --- | --- |
| OH\_MASTER\_LAMP | Lamp (big) | center | off | the light |
| OH\_GREEN\_LAMP | Lamp | green, left | off | green light |
| OH\_AP\_LAMP | Lamp | right | off | the light |
| OH\_BTN\_1 … OH\_BTN\_4 | PushButton | white caps, digits 1–4 | — | button one … four |
| OH\_BTN\_RED / OH\_BTN\_GREEN / OH\_BTN\_BLUE | PushButton | colored caps, no label | — | red / green / blue button |
| OH\_SW\_1 … OH\_SW\_4 | ToggleSwitch | digits 1–4 | on, off, on, on | switch one … four |
| OH\_HANDLE\_1 … OH\_HANDLE\_4 | PullHandle | grey, digits 1–4 | in | lever one … four |

OH\_HANDLE\_3 slides the pilot's seat back. OH\_HANDLE\_1 engages the autopilot.

**Pedestal (PD\_), Phase 2**

| Id | Type | Label / color | Initial | Spoken as |
| --- | --- | --- | --- | --- |
| PD\_FIRE\_LAMP\_L / PD\_FIRE\_LAMP\_R | Lamp | red, arrows ← → | lit on the fire side | — |
| PD\_FIRE\_HANDLE\_L / PD\_FIRE\_HANDLE\_R | PullHandle | red, arrows ← → | in | left / right red lever |
| PD\_FUEL\_SW\_L / PD\_FUEL\_SW\_R | ToggleSwitch | yellow, arrows ← → | on, on | left / right yellow switch |
| PD\_EXT\_BTN | PushButton (big, round) | red | — | the red button |
| PD\_LEVER\_1 … PD\_LEVER\_4 | UpDownLever | grey, digits 1–4 | up | lever one … four |
| PD\_PUMP\_GREEN / PD\_PUMP\_YELLOW | ToggleSwitch (round mushroom cap, lit when on) | green / yellow | off, off | green / yellow pump |

PD\_LEVER\_1 = left throttle, PD\_LEVER\_2 = right throttle, PD\_LEVER\_3 = descent, PD\_LEVER\_4 = decoy.

**Front panel (FP\_), Phase 3**

| Id | Type | Label / color | Initial | Spoken as |
| --- | --- | --- | --- | --- |
| FP\_LEVER\_1 … FP\_LEVER\_4 | UpDownLever | grey, digits 1–4 | up | lever one … four |
| FP\_GEAR\_LAMP\_1 … \_3 | Lamp | row of three | off | the three lights |
| FP\_FLAP\_L / FP\_FLAP\_R | NotchLever | arrows ← → | notch 0 | left / right lever |
| FP\_LAND\_SW | ToggleSwitch | yellow | off | yellow switch |
| FP\_BTN\_1 … FP\_BTN\_3 | PushButton | white caps, digits 1–3 | — | button one … three |
| FP\_BTN\_RED / FP\_BTN\_GREEN | PushButton | colored caps | — | red / green button |
| FP\_WARN\_LAMP | Lamp | — | off | the light |
| FP\_FIRE\_LAMP | Lamp | red | off | fire light |
| FP\_BRAKE | PullHandle (big) | red | in | red lever |
| FP\_ENGINE\_SW | ToggleSwitch (big, red guard) | grey | on | engine |
| FP\_FUEL\_GAUGE | FuelGauge | — | full | — |

FP\_LEVER\_1 and FP\_LEVER\_2 = throttles, FP\_LEVER\_3 = decoy, FP\_LEVER\_4 = landing gear.

### 8.5 Characters and props

- **Pilot:** capsule body in a navy uniform, sphere head, pilot cap with a visor, big mustache. Procedural animation only: idle breathing, a slump (head drops 60°, torso leans onto the yoke), and a floating “Zzz” (drei `Text`) while unconscious. When OH\_HANDLE\_3 is pulled, the seat and pilot slide back 0.4 m with a bounce.
- **Yokes:** one in front of each seat (cylinder column + rounded U-shaped grip). Decorative; not clickable.
- **Exterior plane:** capsule fuselage, rounded box wings, two engine nacelles with spinning propellers, tail fin, teal stripe, row of round windows.
- **Wing fire:** particle flames (orange-yellow additive sprites) plus a grey smoke trail, attached to the burning nacelle, both on the cockpit's visible wing and on the exterior plane.
- **Runway:** long dark strip with white center dashes, two rows of edge lights (instanced emissive spheres) and an approach light bar. Hidden until Phase 3.

### 8.6 One layout for the cockpit and the manual

The manual's panel drawings must always match the cockpit, so both are rendered from one file, `content/stations.json`.

- Each station lists its controls as rows on a grid: `id`, `type`, `label` (digit or arrow), `color`, `row`, `col`, default state, and `manual_name` in `hi` and `en` (“हरा बटन” / “green button”).
- The 3D station component maps grid cells to local 3D positions on the panel face. The manual's 2D drawing renders the same grid as an ink drawing. Never place controls by hand in either one.
- Parts that a step can ask about (a lamp, the fire, the gear lights) carry a `part_name` used in the manual's “find out” breadcrumb.
- The validator (section 17) checks that every `expect` object and every `find_out` part exists in `stations.json`, and that every control a rule names is visible in that phase's drawing.

## 9. Phase 1 — Pilot Down

Night, cruising altitude, alarms blaring, the pilot slumped over the controls. Station: Overhead. Signal: strong (everything glossed). Fuel: 150 s. Seven actions introduce the 15 Phase 1 concepts, each heard at least twice on every branch path.

**How to read the action tables.** “Ask” is the question the manual tells the Tower to say. Each branch row is what the Tower says when the Flyer reports that value, and what the Flyer must then do. Lines are given in Devanagari, romanized Hindi (used in Mock Mode and for the validator) and English. The manual shows the line in the Tower's language with keywords highlighted.

**These lines are examples, not what the manual shows.** The Tower's manual shows a rule table (section 13.3) and players speak in their own words. The lines are used by Mock Mode quick-say, the bots and the content validator, and they show what each step must get across. Each action also needs `find_out`: the station, the part and the property the Tower must learn (for P1\_A1: Overhead → big center lamp → color), with `hi` and `en` labels. The rule-table rows come from each branch's `when` value and its `expect` steps.

**Content JSON shape (one action)**

```json
{
  "id": "P1_A1",
  "title": {"en": "Silence the master alarm", "hi": "मास्टर अलार्म बंद करो"},
  "observe": {"var": "MASTER_COLOR", "object": "OH_MASTER_LAMP",
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
  "flyer_examples": {"en": ["The red one!", "Blue!"], "hi": ["लाल वाली!", "नीली!"]},
  "on_success": ["sfx:alarm_stop", "light:alarm_to_amber"]
}
```

Actions with no question use `"say"` and `"expect"` at the top level instead of `ask` and `branches`.

### P1\_A1 — Silence the master alarm

Observe `MASTER_COLOR`: RED or BLUE (50/50), shown on OH\_MASTER\_LAMP.

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Ask | कौन सी लाइट जल रही है — लाल या नीली? *(Kaun si light jal rahi hai — laal ya neeli?)* | Which light is on — red or blue? | — |
| If RED | एक नंबर बटन दबाओ — तीन नहीं! *(Ek number button dabao — teen nahi!)* | Press button one — not three! | OH\_BTN\_1 press ×1 |
| If BLUE | तीन नंबर बटन दबाओ — एक नहीं! *(Teen number button dabao — ek nahi!)* | Press button three — not one! | OH\_BTN\_3 press ×1 |

Flyer might say: “The red one!” / “लाल वाली!”. On success: the alarm stops and the pulsing red cabin light fades to a soft amber over 1 s.

### P1\_A2 — Power the autopilot

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Say | दो नंबर स्विच चालू करो। *(Do number switch chalu karo.)* | Turn switch two on. | OH\_SW\_2 toggle → on |

Flyer might say: “Switch two is on.” / “दो चालू हो गया।”. On success: a small screen on the overhead boots up (teal glow with a plane icon).

### P1\_A3 — Slide the pilot back

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Say | तीन नंबर लीवर खींचो — चार नहीं! *(Teen number lever kheencho — chaar nahi!)* | Pull lever three — not four! | OH\_HANDLE\_3 pull |

Flyer might say: “Pulled! The pilot moved!”. On success: in-phase cinematic `p1_seat` (section 12): the pilot's seat slides back with a bounce and he snores.

### P1\_A4 — Check the green light

Observe `GREEN_LIT`: YES or NO (50/50), shown on OH\_GREEN\_LAMP (lit green or dark).

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Ask | हरी लाइट चालू है — हाँ या नहीं? *(Hari light chalu hai — haan ya nahi?)* | Is the green light on — yes or no? | — |
| If YES | एक नंबर स्विच बंद करो। *(Ek number switch band karo.)* | Turn switch one off. | OH\_SW\_1 toggle → off |
| If NO | तीन नंबर स्विच बंद करो। *(Teen number switch band karo.)* | Turn switch three off. | OH\_SW\_3 toggle → off |

Flyer might say: “No, it's off.” / “नहीं!”. On success: a warning beep stops and the green lamp goes dark.

### P1\_A5 — Reset the radio

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Say | नीला बटन दो बार दबाओ। *(Neela button do baar dabao.)* | Press the blue button two times. | OH\_BTN\_BLUE press ×2 |

Flyer might say: “Blue, twice. Done.”. On success: the radio static on both screens drops for a moment and the signal icon flashes full.

### P1\_A6 — Read the autopilot light

Observe `AP_COLOR`: GREEN or RED (50/50), shown on OH\_AP\_LAMP. Keep the lamp lit after success (`keep_lamp`), turned steady green.

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Ask | कौन सी लाइट जल रही है — हरी या लाल? *(Kaun si light jal rahi hai — hari ya laal?)* | Which light is on — green or red? | — |
| If GREEN | हरा बटन तीन बार दबाओ। *(Hara button teen baar dabao.)* | Press the green button three times. | OH\_BTN\_GREEN press ×3 |
| If RED | लाल बटन दो बार दबाओ। *(Laal button do baar dabao.)* | Press the red button two times. | OH\_BTN\_RED press ×2 |

Flyer might say: “Green!” / “लाल है!”. On success: OH\_AP\_LAMP turns steady green with a soft chime.

### P1\_A7 — Engage the autopilot

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Say | चार नंबर स्विच बंद करो, फिर एक नंबर लीवर खींचो। ऑटोपायलट चालू? हाँ? *(Chaar number switch band karo, phir ek number lever kheencho. Autopilot chalu? Haan?)* | Turn switch four off, then pull lever one. Autopilot on? Yes? | 1. OH\_SW\_4 toggle → off. 2. OH\_HANDLE\_1 pull. (In this order.) |

Flyer might say: “Yes! Autopilot is on!” / “हाँ! चालू!”. On success: phase complete, cinematic `p1_outro`.

## 10. Phase 2 — Engine Fire

An explosion rocks the plane and one engine catches fire. Station: Pedestal. Signal: weak (only new or not-yet-learned keywords glossed). Fuel: 150 s. Six actions introduce the 5 new concepts (FIRE, LEFT, RIGHT, YELLOW, DOWN), each heard at least twice on every path, and reuse Phase 1 words.

**Phase variable `FIRE_SIDE`:** LEFT or RIGHT (50/50), rolled at phase start. It sets which wing burns, which PD\_FIRE\_LAMP is lit, and the correct branch in B1, B2 and B4. The manual for B2 and B4 shows both branches labelled “if the fire is left / right”; the Tower already learned the side in B1.

### P2\_B1 — Pull the fire handle

Observe `FIRE_SIDE`: shown by the burning wing and PD\_FIRE\_LAMP\_L or \_R.

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Ask | आग कौन से इंजन में है — बायाँ या दायाँ? *(Aag kaun se engine mein hai — baayan ya daayan?)* | Which engine has the fire — left or right? | — |
| If LEFT | बायाँ लाल लीवर खींचो — दायाँ नहीं! *(Baayan laal lever kheencho — daayan nahi!)* | Pull the left red lever — not right! | PD\_FIRE\_HANDLE\_L pull |
| If RIGHT | दायाँ लाल लीवर खींचो — बायाँ नहीं! *(Daayan laal lever kheencho — baayan nahi!)* | Pull the right red lever — not left! | PD\_FIRE\_HANDLE\_R pull |

Flyer might say: “Right! The right engine!” / “दायाँ! दायाँ इंजन!”. On success: the handle pops out with a clunk and the fire lamp flickers.

### P2\_B2 — Cut the fuel

Branch on `FIRE_SIDE` (same side as the fire).

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| If LEFT | बायाँ पीला स्विच बंद करो। *(Baayan peela switch band karo.)* | Turn the left yellow switch off. | PD\_FUEL\_SW\_L toggle → off |
| If RIGHT | दायाँ पीला स्विच बंद करो। *(Daayan peela switch band karo.)* | Turn the right yellow switch off. | PD\_FUEL\_SW\_R toggle → off |

Flyer might say: “Yellow switch is off.”. On success: the fuel-flow hiss stops; the flames shrink by half.

### P2\_B3 — Fire the extinguisher

Observe `STILL_BURNING`: YES 70% / NO 30%, rolled when the action starts. YES: flames stay. NO: flames die to smoke at action start.

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Ask | आग अभी भी है — हाँ या नहीं? *(Aag abhi bhi hai — haan ya nahi?)* | Is the fire still there — yes or no? | — |
| If YES | लाल बटन दो बार दबाओ। *(Laal button do baar dabao.)* | Press the red button two times. | PD\_EXT\_BTN press ×2 |
| If NO | लाल बटन एक बार दबाओ। *(Laal button ek baar dabao.)* | Press the red button one time. | PD\_EXT\_BTN press ×1 |

Flyer might say: “Yes, still burning!” / “हाँ, अभी भी!”. On success: in-phase cinematic `p2_extinguish`: whoosh, white foam burst on the wing, flames out, smoke thins to a wisp.

### P2\_B4 — Shut the burning engine

Branch on `FIRE_SIDE`.

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| If LEFT | एक नंबर लीवर नीचे करो। *(Ek number lever neeche karo.)* | Move lever one down. | PD\_LEVER\_1 move\_down |
| If RIGHT | दो नंबर लीवर नीचे करो। *(Do number lever neeche karo.)* | Move lever two down. | PD\_LEVER\_2 move\_down |

Flyer might say: “Lever one is down.”. On success: that engine's propeller spins down and stops; the plane yaws slightly toward it (camera roll 4°, eases back).

### P2\_B5 — Start the backup pump

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Say | हरा पंप चालू करो — पीला नहीं! *(Hara pump chalu karo — peela nahi!)* | Turn the green pump on — not yellow! | PD\_PUMP\_GREEN toggle → on |

Flyer might say: “Green pump on!”. On success: the pump lights up and the engine hum steadies.

### P2\_B6 — Start the descent

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Say | तीन नंबर लीवर नीचे करो — चार नहीं! *(Teen number lever neeche karo — chaar nahi!)* | Move lever three down — not four! | PD\_LEVER\_3 move\_down |

Flyer might say: “Three is down. We're going down!”. On success: phase complete, cinematic `p2_outro`.

## 11. Phase 3 — Storm Landing

Rain, lightning and a runway somewhere in the fog. Station: Front panel. Signal: lost (keywords highlighted, never glossed; 3 lifelines per player). Fuel: 180 s. Eight actions use **all 20 concepts** and introduce none.

**Schema reminders.** Actions whose branch depends on an earlier roll (Phase 2's B2 and B4) use `"branch_on": "FIRE_SIDE"` instead of `observe` + `ask`. Actions that start with a scripted event use `"on_start": ["event:lightning_strike"]`. Steps that may happen in any order use `"unordered": true` on the action.

### P3\_C1 — Lower the landing gear

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Say | चार नंबर लीवर नीचे करो। *(Chaar number lever neeche karo.)* | Move lever four down. | FP\_LEVER\_4 move\_down |

On success: a heavy clunk and a short shake; the three gear lamps light up according to `GEAR_OK` (rolled now, YES 50%: green, green, green; NO 50%: green, green, red).

### P3\_C2 — Confirm the gear

Observe `GEAR_OK` on FP\_GEAR\_LAMP\_1–3. Keep the lamps after success; any red lamp turns green.

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Ask | तीन हरी लाइट चालू हैं — हाँ या नहीं? *(Teen hari light chalu hain — haan ya nahi?)* | Are three green lights on — yes or no? | — |
| If YES | हरा बटन एक बार दबाओ। *(Hara button ek baar dabao.)* | Press the green button one time. | FP\_BTN\_GREEN press ×1 |
| If NO | लाल बटन दो बार दबाओ। *(Laal button do baar dabao.)* | Press the red button two times. | FP\_BTN\_RED press ×2 |

Flyer might say: “No! Two green, one red!” / “नहीं, एक लाल है!”.

### P3\_C3 — Set the flaps

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Say | बायाँ लीवर दो बार नीचे करो, दायाँ लीवर एक बार! *(Baayan lever do baar neeche karo, daayan lever ek baar!)* | Move the left lever down two times, and the right lever one time! | FP\_FLAP\_L move\_down ×2 and FP\_FLAP\_R move\_down ×1 (any order) |

On success: a motor whirr; the nose dips slightly (camera pitch −3°, eases back over 2 s).

### P3\_C4 — Landing lights

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Say | पीला स्विच चालू करो। *(Peela switch chalu karo.)* | Turn the yellow switch on. | FP\_LAND\_SW toggle → on |

On success: in-phase cinematic `p3_runway_reveal`: two warm light cones cut through the rain, fog thins, and the runway's edge lights appear far ahead.

### P3\_C5 — Lightning strike

On start: event `lightning_strike` (section 12): flash, thunder, panels flicker for 1 s. Then observe `WARN_COLOR`: BLUE or RED (50/50) on FP\_WARN\_LAMP, blinking.

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Ask | कौन सी लाइट जल रही है — नीली या लाल? *(Kaun si light jal rahi hai — neeli ya laal?)* | Which light is on — blue or red? | — |
| If BLUE | एक नंबर बटन दबाओ — तीन नहीं! *(Ek number button dabao — teen nahi!)* | Press button one — not three! | FP\_BTN\_1 press ×1 |
| If RED | तीन नंबर बटन दबाओ — एक नहीं! *(Teen number button dabao — ek nahi!)* | Press button three — not one! | FP\_BTN\_3 press ×1 |

On success: panels stop flickering, a reassuring chime.

### P3\_C6 — Fire scare

Observe `FIRE_BACK`: YES or NO (50/50) on FP\_FIRE\_LAMP (lit red or dark). If YES, a small flicker of flame reappears on the damaged wing.

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Ask | आग है — हाँ या नहीं? *(Aag hai — haan ya nahi?)* | Is there a fire — yes or no? | — |
| If YES | लाल बटन दो बार दबाओ! *(Laal button do baar dabao!)* | Press the red button two times! | FP\_BTN\_RED press ×2 |
| If NO | हरा बटन एक बार दबाओ। *(Hara button ek baar dabao.)* | Press the green button one time. | FP\_BTN\_GREEN press ×1 |

On success: any flame is snuffed with a puff of white; the fire lamp goes dark.

### P3\_C7 — Throttles to idle

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Say | एक नंबर और दो नंबर लीवर नीचे करो। *(Ek number aur do number lever neeche karo.)* | Move lever one and lever two down. | FP\_LEVER\_1 and FP\_LEVER\_2 move\_down, any order (`unordered`) |

On success: in-phase cinematic `p3_touchdown` (fuel paused): the runway rushes in, the wheels hit with a bounce, tires screech, sparks fly. The plane is still rolling fast when C8 starts.

### P3\_C8 — Brake and shut down

| Line | Hindi | English | Flyer must |
| --- | --- | --- | --- |
| Say | लाल लीवर खींचो! फिर इंजन बंद करो! *(Laal lever kheencho! Phir engine band karo!)* | Pull the red lever! Then turn the engine off! | 1. FP\_BRAKE pull. 2. FP\_ENGINE\_SW toggle → off. (In this order.) |

On success: phase complete, cinematic `landing`, then `ending`, then the word deck.

### Coverage check for Phase 3

Every concept appears in the Tower's lines on every branch path (verified with a script; section 17 makes it permanent).

| Concept | Actions (guaranteed lines) |
| --- | --- |
| RED | C5 ask, C8 |
| GREEN | C2 ask |
| BLUE | C5 ask |
| YELLOW | C4 |
| ONE | C5 (both branches), C7 |
| TWO | C3, C7 |
| THREE | C2 ask, C5 (both branches) |
| FOUR | C1 |
| PRESS | C2, C5, C6 (all branches) |
| PULL | C8 |
| ON | C2 ask, C4 |
| OFF | C8 |
| YES | C2 ask, C6 ask |
| NO | C2 ask, C5, C6 ask |
| WHICH | C5 ask |
| TIMES | C2 and C6 (all branches), C3 |
| FIRE | C6 ask |
| LEFT | C3 |
| RIGHT | C3 |
| DOWN | C1, C3, C7 |

## 12. Cinematics and camera

Every cinematic is a GSAP timeline that drives a camera rig, lights, props and sounds on the Flyer's screen, with a matching 2D timeline on the Tower's screen. The server cues both with `cinematic {id, start_at_ms}`; a client that starts late seeks the timeline forward so both stay in sync.

### 12.1 Camera rig and helpers

- `cameraRig` holds `position`, `target`, `roll` (degrees), `pitchOffset` and `shake` (0–1). Every frame: `camera.position = position + shakeOffset`, `camera.lookAt(target + pitchOffset)`, then rotate by `roll` around the view axis.
- Shake is your own noise-based offset (amplitude 0.03 m × `shake`), not drei `CameraShake`, so it composes with tweens. `shake` decays to its resting value (0, or 0.15 during Phase 3 turbulence).
- Helpers used by all timelines: `moveTo(shot, seconds, ease = "power2.inOut")`, `cut(shot)`, `shakeFor(amount, seconds)`, `rollTo(deg, seconds)`, `flash(color, ms)` (full-screen overlay), `setLightRig(name, seconds)`, `titleCard(key, seconds)`, `sfx(name)`.
- Skip: when both players have pressed skip, the server sends `cinematic_skip`; clients call `timeline.progress(1)` so every end state is applied.
- Inputs other than push-to-talk are disabled while any cinematic runs.

### 12.2 Light rigs

| Rig | Used in | Setup |
| --- | --- | --- |
| `night_alarm` | Prologue, Phase 1 until A1 succeeds | Hemisphere sky #2A3A6A / ground #10121A at 0.5; warm cabin point light 0.6; red point light pulsing 0 → 2.5 at 1.2 Hz |
| `night_calm` | Rest of Phase 1, Phase 2 calm moments | Same base, red pulse replaced by soft amber 0.8; moonlight directional #9FB4FF at 0.6 |
| `fire` | Phase 2 | `night_calm` + orange point light at the fire-side window, intensity flickering 1.2–2.2 with noise; slow red pulse 0.5 Hz |
| `storm` | Phase 3 | Dark blue hemisphere 0.3, no moon; lightning = directional white light spiking to 6 |
| `dawn` | Landing, ending | Low directional #FFB36B at 1.2, sky gradient orange to pale blue |

### 12.3 Shot lists

Times are seconds from the cinematic's start. Title cards show each player's own language.

**`prologue` (12 s)**

1. 0–3: `EXT_CHASE`. The toy plane cruises at night over moonlit clouds. Engine hum. The FADE logo fades in and out (0.5–2.5).
2. 3–6: cut to `WIDE_INTERIOR`. The pilot yawns, stretches, then at 5.0 slumps onto the yoke. Camera rolls 0 → 6° as the plane dips.
3. 6–7: master alarm loop starts; light rig `night_alarm`.
4. 7–8.5: fast whip (0.5 s) to `FLYER_DEFAULT`; “Zzz” floats above the pilot.
5. 8.5–10: radio crackle. Tower: radar blip turns red, a MAYDAY stamp slams onto the screen.
6. 10–12: title card “PHASE 1 — PILOT DOWN” / “चरण 1 — पायलट बेहोश” with “SIGNAL: STRONG ▮▮▮” / “सिग्नल: तेज़”.
7. Then `p1_intro` (1.2 s): `moveTo(OVERHEAD, 1.2)`. Tower: the first manual card slides in.

**`p1_seat` (3 s, in-phase)**: `moveTo(PILOT, 0.6)`; the seat and pilot slide back 0.4 m with an elastic ease; snore sound and a bigger “Zzz”; `moveTo(OVERHEAD, 0.6)`.

**`p1_outro` (6 s)**

1. 0–2: `OVERHEAD`. Every overhead lamp turns green one by one (0.15 s apart). Light rig to `night_calm`.
2. 2–4: `moveTo(FLYER_DEFAULT, 1.5)`, `rollTo(0, 1.5)`. Clouds part, the moon appears, a short relieved music sting.
3. 4–6: cut to `EXT_SIDE`: the plane flies level. Tower: checklist all green, “AUTOPILOT ENGAGED” banner.

**`p2_intro` (9 s)**

1. 0–1: `EXT_SIDE` continues. At 0.8, the `FIRE_SIDE` engine explodes: `flash(white, 60)`, boom, an expanding orange fireball, then flames and a smoke trail.
2. 1–2.5: cut to `FLYER_DEFAULT`; `shakeFor(1.0, 1.2)`; light rig `fire`; fire-bell alarm.
3. 2.5–5: whip to `LEFT_WINDOW` or `RIGHT_WINDOW` (the fire side) and hold on the burning wing.
4. 5–6: back to `FLYER_DEFAULT`.
5. 6–8: title card “PHASE 2 — ENGINE FIRE” / “चरण 2 — इंजन में आग”, “SIGNAL: WEAK ▮▮” / “सिग्नल: कमज़ोर”. Radio static ambience steps up.
6. 8–9: `moveTo(PEDESTAL, 1.0)`.
7. Tower: CSS screen shake 0.6 s, radar blip shows a fire icon and “ENGINE FIRE”. **The Tower screen never shows which side.**

**`p2_extinguish` (3 s, in-phase)**: `moveTo(fire-side window, 0.5)`; white foam burst particles for 0.8 s; flames scale to 0 over 1 s; smoke thins to a wisp; `moveTo(PEDESTAL, 0.6)`.

**`p2_outro` (8 s)**

1. 0–2: `PEDESTAL`. Engine hum drops; nose down (pitchOffset −5°).
2. 2–4: `moveTo(FLYER_DEFAULT, 1.2)`. Clouds darken; first raindrops on the glass.
3. 4–6.5: cut to `EXT_CHASE`: the plane, one propeller stopped, sinks into black storm clouds; distant lightning.
4. 6.5–8: cut inside; rain gets heavy. Light rig to `storm` over 1.5 s.

**`p3_intro` (7 s)**

1. 0–2: `FLYER_DEFAULT`. Rain streaks, turbulence: `shake` resting value 0.15 for the whole phase until touchdown.
2. 2: lightning double flash; thunder 0.8 s later.
3. 2.5–5: title card “PHASE 3 — STORM LANDING” / “चरण 3 — तूफ़ान में लैंडिंग”, “SIGNAL: LOST ▮” / “सिग्नल: गायब”. The subtitle bar glitches; three lifeline dots appear.
4. 5–7: `moveTo(FRONT, 1.5)`. Tower: radar shows the runway and a glide-path line.

**`lightning_strike` (1.5 s, event)**: directional light to 6 for 70 ms, off 60 ms, 4 for 50 ms; thunder after 0.3 s; station lamps flicker randomly for 1 s; `shakeFor(0.4, 0.5)`. The action's observed lamp starts blinking when this ends.

**`p3_runway_reveal` (4 s, in-phase)**: two warm spotlights from the nose fade in over 0.5 s; fog density 0.035 → 0.012 over 2 s; the runway group becomes visible at z −600 with its edge lights fading in; camera glances out the windshield (`FLYER_DEFAULT`) and returns to `FRONT`.

**`p3_touchdown` (6 s, in-phase, fuel paused)**

1. 0–2: `FLYER_DEFAULT`. The runway slides from z −600 to under the plane; approach lights streak past.
2. 2: touchdown. Camera bumps down 8 cm and back in 200 ms, tire screech, sparks under both side windows, `shakeFor(0.6, 1.0)`.
3. 2–5: the runway keeps streaming past at high speed; rain lightens; turbulence stops.
4. 5–6: `moveTo(FRONT, 1.0)`. The runway keeps streaming until C8 succeeds.

**`landing` (7 s)**

1. 0–3: `FLYER_DEFAULT`. The runway decelerates to a stop (ease out), brake squeal, nose dips +4° and settles, engines spool down. Rain stops, clouds part. Light rig to `dawn`.
2. 3–5: cut to `EXT_FRONT_LOW`: the plane stopped on the runway at sunrise, a wisp of smoke from the damaged engine.
3. 5–7: cut to `WIDE_INTERIOR`: the pilot wakes, lifts his head, looks around; a “?” pops above him.
4. Tower: radar blip parks on the runway, “LANDED” stamp, confetti.

**`ending` (6 s)**: slow orbit around the plane at dawn (`EXT_CHASE` path), title “YOU LANDED!” / “लैंडिंग सफल!” with fuel left and total time; both screens fade to the word deck.

**`crash` (5 s)**: `flash(white, 120)`; cut to `EXT_SIDE`: the plane spirals down cartoon-style leaving a corkscrew of smoke and vanishes into a big cartoon “POOF” cloud. Text “OUT OF FUEL” / “ईंधन ख़त्म” and a Retry button on both screens.

### 12.4 Action feedback (not cinematics, no input lock)

| Event | Flyer screen | Tower screen | Sound |
| --- | --- | --- | --- |
| Correct action | Control animates; green edge flash on the station; progress pip fills | Checklist row ticks ✓ | Chime |
| Wrong action | Control springs back; `shakeFor(0.5, 0.35)`; red vignette pulse; fuel needle drops | Row flashes ✗ with “Flyer used: switch 3” (control name in the Tower's language) | Buzzer |
| Crossover | Toast “CROSSOVER! +5s” | Same toast | Sparkle |
| Fuel under 20 s | Fuel dial pulses red | Fuel bar pulses red | Low-fuel beep every 2 s |

## 13. Screens and UI

Four screens: Lobby, Flyer (3D + HUD), Tower (2D), and Word Deck. All UI text appears in the viewing player's language; every UI string lives in one `strings.ts` with `en` and `hi` keys.

### 13.1 Lobby

- Landing page: the FADE logo over a looping `EXT_CHASE` shot of the toy plane. Buttons: **Create room** and **Join with code**.
- Create: server returns a 4-letter code (no I, O, 0, 1). Show the code large, the link `/r/CODE`, and a QR code (`qrcode.react`).
- Join form: name, role cards (Flyer: “You're in the cockpit”; Tower: “You have the manual”), language toggle English / हिन्दी. A role already taken is disabled.
- Both players press Ready. Start is blocked with a message if both chose the same language.
- Show a setup tip: “Sit back to back. No peeking at each other's screens.”
- Before Ready, ask for microphone permission (real mode) and show a mic level meter so players can test it.

### 13.2 Flyer HUD (over the 3D canvas)

| Area | Content |
| --- | --- |
| Top left | Signal bars and label (STRONG / WEAK / LOST), phase name |
| Top center | Progress pips, one per action; current one pulses |
| Top right | Fuel: seconds plus a thin bar (the 3D fuel dial is on the front panel too) |
| Bottom center | Subtitle stack: last 3 Tower utterances, newest at the bottom; older ones at 60% and 35% opacity. Each line has a small TOWER tag. |
| Above subtitles | While transmitting: your live partial caption. After sending: “You: …” echo in grey for 3 s |
| Bottom right | Push-to-talk indicator: idle (mic icon, “Hold SPACE to talk”), transmitting (red pulse), channel busy (amber, “Tower is talking”) |
| Bottom left (Phase 3) | Three lifeline dots and “Tap a subtitle to decode it” |
| Top center overlay | Toasts and title cards |

Subtitle chips: keyword chips share one style (white text on a translucent slate pill with a thin underline). Glosses are smaller, in square brackets, in a muted yellow after the chip. Font size: 26 px for the newest line.

### 13.3 Tower screen (2D, designed for 1440 × 900, works down to 1280 × 720)

| Column | Width | Content |
| --- | --- | --- |
| Left | 30% | Circular radar with a sweeping line and the plane blip (green = fine, amber = warning, red = emergency); runway icon and glide-path line in Phase 3. Below it: fuel bar with seconds, signal bars, phase title. |
| Center | 45% | The open **flight manual** (two-page spread, see below) for the current action. Progress dots and the “pichhli baar” (last try) note live on its pages; there is no separate checklist. |
| Right | 25% | Subtitles from the Flyer (last 5), lifeline dots in Phase 3, push-to-talk indicator and live partial caption. |

**Manual design: a ring-bound flight manual**

- **Look:** a real ring-bound flight manual lying open on the tower desk (dark slate desk, a coffee mug and a pencil as decoration). Chunky cartoon style that matches the cockpit. Original design: do not copy any other game's art. Reference mockup: [Fade — Tower Screen Mockup](https://claude.ai/artifact/LiQSo1SexmZ1uMGz54yWQp).
- **Language:** everything on the manual is in the Tower's own language and script (Devanagari for a Hindi Tower), with an optional small English helper line. Fonts: Baloo 2 for print and Kalam for handwriting (both support Devanagari and Latin).
- **No scripted sentences.** The manual gives what to find out and a rule. The Tower decides how to ask and how to say the instruction. A handwritten reminder says so (“अपने शब्दों में पूछो”, ask in your own words).
- **Left page, panel drawing:** a black-ink drawing of the phase's station, rendered from the same layout data as the 3D cockpit (section 8.6), with control labels in the Tower's language. This step's controls are circled in orange dashed pencil; the part to ask about carries a “?”. It shows layout and default positions only, never the live state. Under it: a handwritten hint and a yellow sticky note with the step's tip.
- **Right page, the step:**
  1. Step pill (“कदम 6 / 7”), phase name, and a short module title (“ऑटोपायलट लाइट”).
  2. **पता करो (find out):** a breadcrumb of chips, station → part → property, ending with the possible values (color swatches, ←/→, yes/no). Example: *ओवरहेड पैनल → दाईं लाइट → रंग?*
  3. **नियम (rule):** a table with columns *if the value is* (swatch + keyword) · *have the Flyer do* (short label) · *control* (small ink drawing of the control in its target state, with ×count). Steps with no question show a single row “करवाओ” (have them do) with no condition column.
- **Rule labels are generated, not written:** from each `expect` step, in the Tower's language, keywords highlighted. Object name from the control's `manual_name` (“हरा बटन”, “तीन नंबर स्विच”, “बायाँ लाल हैंडल”). Verb: press → दबाओ, pull → खींचो, toggle on → चालू करो, toggle off → बंद करो, move\_down → नीचे करो (English: press, pull, turn on, turn off, move down). Count above 1 → “तीन बार” / “three times”.
- **Keywords:** a yellow highlighter mark (#FFE066) behind every keyword, identical for all of them.
- **Progress:** colored phase tabs on the right page edge (1 teal, 2 orange, 3 blue; current one larger) and progress dots at the bottom (done = black, current = phase color, upcoming = beige). After a wrong action, a red handwritten note appears under the table: *पिछली बार: हरा बटन ×2 ✗* (last try: green button twice, wrong).
- **Phase flavor:** Phase 2 pages carry a red rotated stamp (“आपातकाल” / EMERGENCY). Phase 3 pages get a few rain-drop smudges.
- **Motion:** a 0.4 s page-turn when the next step starts; the matching row gets a green check stamp on success.
- **Colors:** ink #1F1F1F, pages #F7F0E0 (left) and #FBF6EA (right), pencil orange #C2410C, sticky note #FFF1A8.
- `manual_card` payload: `{action_id, index, total, phase, station, title, find_out: {chips, values}, rows: [{when?: {value, label, swatch}, do: segments, control_drawing}], hint, sticky, last_wrong?}`, all in the Tower's language.

### 13.4 Word deck (end screen, one per player)

- Header: “Your partner taught you **N** words” / “आपके साथी ने आपको **N** शब्द सिखाए”. N = concepts with `understood >= 1` or `spoken >= 1`.
- Mission report: 2–3 sentences from Bedrock (section 15) in the player's language, with a template fallback.
- Card grid: learned words first, then the rest greyed under “Still learning”. Each card: the word in the partner's language large (romanized for Hindi words), its meaning in the player's language, badges “✓ Understood ×n” and “★ You said it” (crossover), and a ▶ button that plays the partner's own recorded voice saying the word, when a clip exists.
- Stats row: fuel left per phase, wrong actions, lifelines used, total time.
- Buttons: **Play again** (same room, roles kept, new seed) and **Swap roles**.
- `deck` payload: `{partner_name, learned_count, words: [{concept, word, word_script, meaning, understood, spoken, clip_url}], report, stats}`.

**Clips:** for each concept, pick the partner's spoken item with the highest Transcribe confidence that matched it; cut its PCM from start − 0.08 s to end + 0.12 s; encode WAV; serve at `GET /clips/{clip_id}.wav`. Clips live in memory for the room's lifetime. Mock Mode has no clips, so the ▶ button is hidden.

## 14. Audio: microphone pipeline and sound effects

The microphone is only used for transcription; players hear each other directly in the room. All game sounds are synthesized with the Web Audio API, so no audio files are needed.

### 14.1 Microphone and push-to-talk

1. `getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true}})`. This needs HTTPS or `localhost`.
2. An AudioWorklet (`pcm-worklet.js`) receives 48 kHz Float32 frames, low-pass filters and downsamples to 16 kHz, converts to Int16 little-endian, and posts 1,600-sample (100 ms) chunks to the main thread.
3. Keep a 200 ms rolling pre-roll buffer at all times. On push-to-talk start, send the pre-roll first so the first syllable isn't cut off.
4. Push-to-talk: hold Space (ignore key repeat; ignore when a text input has focus) or press and hold the on-screen mic button. Release ends the utterance.
5. Limits: utterances under 300 ms are discarded; utterances auto-end at 12 s.
6. Local radio sounds: a short click-in at start, a squelch at release, both quiet.
7. While either player holds the channel, duck all game ambience (engine, rain, static) by 50% so voices stay clear.
8. Show a mic level meter in the lobby and a tiny one inside the PTT indicator.

### 14.2 Sound effects (procedural recipes)

| Name | Recipe | Used for |
| --- | --- | --- |
| `alarm_master` | Square wave alternating 880/660 Hz every 250 ms, gain 0.12, loop | Phase 1 until A1 |
| `fire_bell` | Triangle 1200 Hz, amplitude-modulated at 12 Hz, loop | Phase 2 intro until B3 |
| `warning_beep` | Sine 1000 Hz, 120 ms, once per second | Observed warnings |
| `click` | 5 ms white noise burst, high-pass 2 kHz | Buttons, switches |
| `clunk` | Sine 90 Hz with 150 ms decay + a little noise | Levers, handles, gear |
| `chime` | Sines 880 + 1320 Hz, 400 ms decay | Correct action |
| `buzzer` | Sawtooth 110 Hz, 350 ms, low-pass 800 Hz | Wrong action |
| `boom` | 1.2 s brown noise, low-pass sweeping 1200 → 100 Hz, plus sine 50 Hz | Engine explosion |
| `whoosh` | White noise, band-pass sweeping 400 → 3000 Hz over 0.8 s | Extinguisher |
| `engine_hum` | Two detuned sawtooths 70/72 Hz, low-pass 300 Hz, loop; drop pitch 15% when one engine stops | Always in flight |
| `static` | White noise, band-pass 1.5 kHz; gain 0 in Phase 1, 0.02 in Phase 2, 0.04 in Phase 3 | Radio ambience (must stay quiet) |
| `rain` | Pink noise, low-pass 6 kHz, gain 0.08, loop | Phase 3 |
| `thunder` | 2.5 s brown noise with slow attack and a rumbling 4 Hz LFO | Lightning |
| `screech` | Sawtooth 1800 Hz with fast vibrato + noise, 0.6 s | Touchdown |
| `squeal` | Sine 2400 Hz with slow vibrato, 1.5 s fade | Braking |
| `snore` | Filtered noise with a 0.4 Hz swell | Pilot |
| `sparkle` | Quick arpeggio 1046, 1318, 1568 Hz | Crossover toast |
| `low_fuel` | Two short 600 Hz beeps every 2 s | Fuel under 20 s |
| `radio_in` / `radio_out` | Short band-passed noise click / squelch | Push-to-talk |

Keep the overall game volume low: two laptops play sound in the same room while the players talk. Settings: master volume slider and a mute toggle on both screens. Design all recipes so they can later be swapped for recorded files (Kenney audio packs are a good source) without code changes elsewhere.

## 15. AWS services and deployment

The game uses four AWS services in the backend and runs on AWS for the demo. Every AWS call sits behind an interface with a mock implementation, so the game also runs with no AWS account.

### 15.1 Configuration (server env vars)

| Variable | Default | Meaning |
| --- | --- | --- |
| `MOCK_SPEECH` | `1` | `1` = typed text, no Transcribe/Translate/Bedrock. `0` = real AWS. |
| `DEV_MODE` | `1` locally, `0` in prod | Enables dev messages, split view, debug panel |
| `AWS_REGION` | `us-east-1` | Must support Transcribe streaming for `hi-IN`. Check the Transcribe supported-languages table first. |
| `TRANSCRIBE_VOCAB_HI` / `TRANSCRIBE_VOCAB_EN` | empty | Optional custom vocabulary names |
| `TRANSLATE_TERMINOLOGY` | empty | Optional custom terminology name, for example `fade-terms` |
| `BEDROCK_MODEL_ID` | empty | Any text model enabled in the account. Empty = template report. |
| `DDB_TABLE` | empty | DynamoDB table for results. Empty = don't persist. |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS and WebSocket origin check |
| `GLOSS_THRESHOLD` | `2` | Section 6.3 |

Client env: `VITE_WS_URL` (for example `wss://api.example.com/ws`), `VITE_DEV_MODE`.

### 15.2 Services

**Amazon Transcribe (streaming)** with the `amazon-transcribe` Python SDK:

```python
client = TranscribeStreamingClient(region=REGION)
stream = await client.start_stream_transcription(
    language_code="hi-IN" if lang == "hi" else "en-US",
    media_sample_rate_hz=16000,
    media_encoding="pcm",
    vocabulary_name=VOCAB or None,
)
# feed: await stream.input_stream.send_audio_event(audio_chunk=frame)
# end:  await stream.input_stream.end_stream()
# read results in a TranscriptResultStreamHandler subclass:
#   partial results -> caption_partial to the speaker
#   final results   -> keep alternatives[0].transcript and .items (content, start_time, end_time, confidence)
```

One stream per utterance. If a stream fails, send the speaker an error toast (“Didn't catch that, try again”) and discard the utterance.

**Amazon Translate**: `translate_text(Text, SourceLanguageCode="hi" | "en", TargetLanguageCode=the other, TerminologyNames=[...])`, run in a thread pool right after each utterance. Script `scripts/make_terminology.py` builds a CSV (`en,hi` header, one row per concept's display forms) from `lexicon.json` and imports it with `import_terminology`.

**Amazon Bedrock**: Converse API, `maxTokens` 200, temperature 0.7. One call per player at the end of the game, in that player's language. Prompt: “Write a 2–3 sentence, upbeat mission report for a co-op game where two people who don't share a language landed a plane. Mention the names, fuel left and two or three words the player learned. Language: {lang}. Facts: {json}.” Timeout 5 s, then the template: “{flyer} and {tower} landed with {fuel}s of fuel to spare. You learned {n} words, including {w1} and {w2}.”

**Amazon DynamoDB**: table `fade_games`, partition key `game_id` (string), on-demand billing. One item per finished game: room, timestamps, players (name, role, language), per-phase stats (fuel left, wrong actions, lifelines used, attempts) and per-player word stats.

**Optional setup script** `scripts/make_vocabularies.py`: creates Transcribe custom vocabularies from the lexicon (Devanagari variants for `hi-IN`, English variants for `en-US`). If the language or a phrase is rejected, print a warning and continue.

**IAM permissions for the server role:** `transcribe:StartStreamTranscription`, `transcribe:StartStreamTranscriptionWebSocket`, `translate:TranslateText`, `bedrock:InvokeModel`, `dynamodb:PutItem`, `dynamodb:GetItem`. For the setup scripts only: `transcribe:CreateVocabulary`, `translate:ImportTerminology`.

### 15.3 Deployment

**Recommended: ECS Fargate + Amplify**

1. Server: build the Docker image, push to ECR, run **exactly one** Fargate task (1 vCPU, 2 GB). Game state lives in memory, so never scale above one task.
2. Put it behind an Application Load Balancer with an HTTPS listener (ACM certificate), idle timeout 300 s, health check `GET /health`.
3. Client: `npm run build`, host on AWS Amplify Hosting (or S3 + CloudFront), with `VITE_WS_URL` pointing at the ALB's `wss://` address.

**Fastest fallback: one EC2 instance** (t3.small) running `docker compose` with Caddy in front for automatic HTTPS on a domain, serving the built client and proxying `/ws` and `/clips` to the server.

The page must be served over HTTPS or the browser blocks the microphone, and the WebSocket must then be `wss://`.

**Latency target:** from releasing push-to-talk to the subtitle appearing on the partner's screen in under 1.5 s. Log this per utterance and show it in the dev panel.

## 16. Dev mode, debug tools and demo mode

One person must be able to see and play the whole game on one laptop with no microphone and no AWS. That is what Dev Mode is for.

### 16.1 Split view (the first thing to build after the core)

`/dev/split?room=TEST&seed=42` shows two iframes side by side: Tower on the left (`/r/TEST?role=tower&lang=hi&name=Tower&auto=1`), Flyer on the right (`/r/TEST?role=flyer&lang=en&name=Flyer&auto=1`). `auto=1` joins and readies automatically, so the game starts as soon as the page loads.

### 16.2 Mock talking

- With `MOCK_SPEECH=1`, the push-to-talk indicator becomes a text box: type and press Enter to transmit (`say_text`).
- **Quick-say buttons:** every line on the Tower's manual card has a small ▶ that sends that exact line. They send the romanized line by default; a dev-only toggle sends the Devanagari version from the content file, so both matching paths get exercised. Players never see it.
- **Quick replies for the Flyer:** chips built from the current action's `flyer_examples`, plus the correct answer for the rolled value (“Red!”).

### 16.3 Bots

- **Auto Tower:** reads the ask line, waits 2 s, then reads the branch line that matches the rolled value. Lets one person test the Flyer side.
- **Auto Flyer:** after the Tower's instruction, performs the correct steps 2 s later. Lets one person test the Tower side and watch every cinematic.
- Both bots send real `say_text` and `interact` messages, so they exercise the same code paths. Toggled from the dev panel.

### 16.4 Dev panel (toggle with the backtick key)

- Live state: room status, phase, action id, rolled variables, expected steps, fuel.
- Exposure table per player: concept × heard / glossed / understood / spoken.
- Last utterance: transcript, matches, segments sent, latency.
- Buttons and hotkeys: complete action (N), fail action (F), go to phase 1/2/3 (1, 2, 3), skip cinematic (K), set seed, add 60 s fuel, toggle bots.

### 16.5 Demo mode (for the 3-minute pitch)

`DEMO_MODE=1` on the server (or `?demo=1` when creating the room) uses a shorter route:

| Part | What happens | Approx. time |
| --- | --- | --- |
| Prologue | Shortened to 6 s | 0:06 |
| Phase 1 | Actions A1, A3, A7 only, played live with full glosses | 0:45 |
| Phase 2 | Auto-played highlight: `p2_intro`, Auto Flyer does B1 and B3, `p2_extinguish`, `p2_outro` | 0:30 |
| Phase 3 | Actions C4, C5, C7, C8 played live with no glosses, one lifeline used on purpose | 1:00 |
| Landing + deck | `landing`, short `ending`, word deck with partner-voice playback | 0:30 |

Demo mode gives 300 s of fuel per phase and enables presenter hotkeys (N to complete an action, P to jump to the next phase) without showing the dev panel. The coverage rules in section 17 apply to the full game only.

## 17. Content validation and acceptance tests

The learning design only works if the content obeys its word rules, so a validator enforces them on every server start and in CI. The scripted lines in sections 9 to 11 already pass these rules in all three forms (Devanagari, romanized Hindi, English).

### 17.1 `content/validate_content.py`

It imports the server's real matcher (`server/app/language/lexicon.py`), so it tests the same code the game runs. Checks:

1. **Lexicon:** exactly 20 concepts, unique ids, `introduced_in` is 1 or 2, every Hindi variant has both `deva` and `roman`, no variant maps to two concepts within a language, no loanword equals a variant.
2. **Actions:** each phase has 5 to 8 actions; every referenced object exists on that phase's station; each verb suits its object type; counts are 1 or more; `observe` option values match the branches' `when` values exactly; every line exists in `hi`, `hi_roman` and `en`.
3. **Paths:** enumerate every combination of variable values (one value per variable, so `FIRE_SIDE` is shared by B1, B2 and B4). For each path, collect the Tower lines that will be spoken: every `ask`, every top-level `say`, and the branch line chosen by that path.
4. **Word rules, checked on every path, both on the required concepts of each step (derived from the observed value and the expect steps: color, number, side, verb, count) and on the example lines in all three forms:**
   - Phase 1 lines contain only Phase 1 concepts, and each Phase 1 concept occurs at least 2 times.
   - Phase 2: each Phase 2 concept occurs at least 2 times.
   - Phase 3: every one of the 20 concepts occurs at least once. For required concepts (derived from observe options and expect steps) the bar is at least once per path in every phase, and WHICH is exempt.
5. **Mock translation index:** no two different lines normalize to the same text with different counterparts.

The script prints a coverage table per phase and exits non-zero on any failure.

### 17.2 Unit tests (pytest)

- Matcher: हाँ and हां → YES; digit `3` and ३ → THREE; *kaun si* → WHICH; *twice* → TWO + TIMES; “on the left” gives LEFT but not ON; *kheecho* fuzzy-matches PULL; *do* never fuzzy-matches anything.
- Gloss rule: every combination of level, `introduced_in` and `glossed` count from section 6.3.
- Action judge: press counts with the 1.2 s debounce; wrong object; wrong toggle direction; ordered vs unordered steps; partial progress kept after a wrong step.
- Credits: understood is given only for unglossed keywords without a lifeline; crossover gives +5 s once per concept.
- Lifelines: decrement only when a translation is delivered; refused outside Phase 3 and at 0.
- Role privacy: the Tower's outgoing messages never contain rolled variables; the Flyer's never contain `manual_card`.

### 17.3 Acceptance checklist (end to end)

- [ ] `docker compose up`, open `/dev/split`: the prologue plays and Phase 1 starts with no other steps.
- [ ] The full game can be finished in Mock Mode using quick-say buttons, on both values of every variable (force them with seeds).
- [ ] A wrong action plays the buzzer and shake, removes 10 s of fuel, and the Tower sees “Flyer used …”.
- [ ] Fuel reaching 0 plays the crash, and Retry restarts that phase with full fuel.
- [ ] Phase 1 subtitles gloss every keyword; Phase 2 glosses only new or not-yet-learned keywords; Phase 3 glosses none. The highlight style is identical everywhere.
- [ ] Phase 3 lifelines: 3 per player, reveal the full translation, not used up when a translation fails.
- [ ] Cinematics start within about 200 ms of each other on two browsers; double skip works.
- [ ] Refreshing a tab mid-game rejoins the room and resumes.
- [ ] Real mode: Hindi and English speech both produce subtitles within 1.5 s of release; romanized Hindi reads naturally.
- [ ] The word deck lists learned words and plays the partner's recorded voice.
- [ ] The deployed build works over HTTPS on AWS with two laptops in one room.

## 18. Build milestones

Build in this order. M1 is the first time the team sees the game; everything after it adds polish or real speech on top of a working loop.

1. **M0 — Scaffold.** Repo layout from section 3, `docker-compose.yml`, all content JSON written from sections 7, 9, 10 and 11, validator passing. *Done when:* `python content/validate_content.py` prints three passing coverage tables.
2. **M1 — Playable in Mock Mode.** Server rooms, state machine, action judge and fuel. Client lobby, the cockpit shell with all three stations built from primitives (no effects yet), the Tower screen with manual card and checklist, text talking, quick-say buttons, plain subtitles, `/dev/split`. Cinematics can be simple camera moves with title cards. *Done when:* one person can finish the whole game in split view.
3. **M2 — Language engine.** Matcher, segments, gloss rule, exposure counters, keyword chips, Phase 3 lifelines with mock translation, credits, dev-panel exposure table. *Done when:* the unit tests in 17.2 pass and the subtitles fade correctly across the three phases.
4. **M3 — Look and feel.** Light rigs, sky, clouds, wing fire, rain, lightning, runway, the pilot, every cinematic in section 12, action feedback, all procedural sounds. *Done when:* the full game in split view looks and sounds like the shot lists.
5. **M4 — Real speech.** Microphone worklet, push-to-talk, channel lock, Transcribe streaming for `hi-IN` and `en-US`, background Translate, latency logging. *Done when:* two people on two laptops can play by voice with subtitles under 1.5 s.
6. **M5 — Word deck.** Word clips, deck screen, Bedrock report with fallback, DynamoDB write. *Done when:* the end screen plays the partner's real voice for learned words.
7. **M6 — Deploy.** Fargate + ALB + Amplify (or the EC2 fallback) over HTTPS. *Done when:* the acceptance checklist in 17.3 passes on the deployed build.
8. **M7 — Demo polish.** Demo mode, bots, presenter hotkeys, a rehearsed run with a fixed seed.

## 19. Stretch features (not MVP)

Only start these once the acceptance checklist passes.

- **Off-language penalty:** switch Transcribe to multi-language identification (`IdentifyMultipleLanguages` with `hi-IN` and `en-US`), mark words spoken in the listener's language that weren't earned in-game with “⚠ off-language” in the subtitle, and subtract 5 s of fuel.
- **Personal fade:** in Phase 2, also drop glosses for words this player has already *understood*, not just seen.
- **Remote play:** voice between players over WebRTC, so they don't need to be in the same room.
- **Second episode:** “Nani's Kitchen” on the same engine: a new station, word list and phases.
- **3D Tower room:** a small control-tower scene behind the Tower's 2D panels.
- **More language pairs:** Spanish–English first (no romanization step needed).
- **Shareable word deck:** export the deck as an image.
- **Asset upgrade:** swap primitives for CC0 models (Kenney, Quaternius, KayKit) and Mixamo animations for the pilot.
