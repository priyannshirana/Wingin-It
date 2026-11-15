# ✈️ Wingin' It!

> **The pilot has fainted. The plane is fine. The language barrier is not.**

One of you is sitting in a toy cockpit full of blinking buttons you've never seen before.
The other has the flight manual, and has never seen the cockpit.
One of you speaks English. The other speaks Hindi.

Hold **Space**, start talking, and land the plane before the fuel runs out.

The game listens to every word and slips the other player live subtitles with the important words translated, like a pocket interpreter. Then it gets lazy, on purpose. Each phase it helps a little less, until by the storm landing you're shouting *"laal!"* and *"press it twice!"* across the table and actually understanding each other.

**Wingin' It! is a translator designed to make itself unnecessary.**

## ▶ Play now: **<https://44-214-130-227.sslip.io>**

Grab a friend who speaks the other language, open the link on two devices, and allow the microphone. For live voice, use <https://44-214-130-227.sslip.io/?voice=1>.

---

## How a round goes

| | You see | You do |
| --- | --- | --- |
| 🧑‍✈️ **Flyer** | A 3D cockpit: lamps, switches, levers, a sleeping captain. No instructions. | Describe what you see, then press, flip and pull what you're told. |
| 🗼 **Tower** | A radar, a fuel gauge and a ring-bound flight manual. No cockpit. | Read the manual, ask the right questions, and talk the Flyer through each step. |

Three phases, and the help fades in each one:

1. **Pilot Down** (signal strong): every keyword comes with its translation in brackets, `laal [red]`.
2. **Engine Fire** (signal weak): only words you haven't learned yet keep their brackets.
3. **Storm Landing** (signal lost): no translations at all, plus three lifelines each for when you're truly stuck.

A wrong move costs fuel, and saying your partner's word for something earns some back. At the end, each player gets a **word deck**: every word their partner taught them, played back in their partner's real voice.

Languages are interchangeable: an English Flyer with a Hindi Tower works exactly as well as the reverse.

## Play it

1. Open the game and click **Start a game**. You get a 4-letter room code, a link and a QR code.
2. Your partner opens the link or enters the code.
3. Each of you picks a role (Flyer or Tower), a language (English or Hindi), a character and a name, then allows the microphone.
4. Both press **Ready**. Hold **Space** to talk and release it to send.

Play in the same room, or turn on live voice (below) and play from anywhere.

### Game modes (URL flags)

Add these to the landing page URL, or use the **Game modes** button on the landing page:

| Flag | What it does |
| --- | --- |
| *(none)* | The real game: real speech, full three-phase run. |
| `?voice=1` | Hear your partner's voice live, as well as the subtitles. Wear headphones. |
| `?demo=1` | A 3-minute scripted run for presenting. **N** completes a step, **P** skips to the end of the phase. |
| `?mock=1` | No microphone: type what you'd say instead of talking. |
| `?demo=1&voice=1` | The scripted demo, and you hear each other live. |
| `?demo=1&mock=1` | The scripted demo with typing: the stage backup if the mic or speech fails. |

`voice` and `mock` don't combine, since mock rooms have no audio.

---

## How it works

```text
 Flyer's browser                    Server (FastAPI)                   Tower's browser
 ───────────────                    ────────────────                   ───────────────
 hold Space ─── mic audio ───────▶  Amazon Transcribe ──▶ language ──▶ subtitles, keywords
                (WebSocket)          (hi-IN / en-US)       engine       and fading glosses
 3D cockpit ◀── world state ──────  game state machine ──────────────▶ manual card + radar
 click a lever ─ interact ───────▶  the judge (right/wrong, fuel)
                                    Translate (lifelines), Bedrock (mission report),
                                    DynamoDB (results)
```

- **Client** (`client/`): Vite, TypeScript (strict), React 19, React Three Fiber with drei and postprocessing, zustand, GSAP, Tailwind v4, and Web Audio with an AudioWorklet. Every 3D object is built from primitives and every sound is procedural, so there are no asset files.
- **Server** (`server/`): Python 3.11, FastAPI, pydantic v2, asyncio and rapidfuzz, plus boto3 for Transcribe streaming, Translate, Bedrock and DynamoDB.
- **Content** (`content/`): the lexicon, the three cockpit stations, phase scripts, cinematics and the demo route, all as JSON checked by a validator.
- **Privacy by design:** the Tower never receives cockpit state or the fire side, and the Flyer never receives the manual. The server sends each player only their own view.

The full design is in [`docs/FRONTEND_SPEC.md`](docs/FRONTEND_SPEC.md) and [`docs/BACKEND_SPEC.md`](docs/BACKEND_SPEC.md). Part A of each is the shared client–server contract, identical in both files.

## Run it locally

**Requirements:** Node 20+ and Python 3.11+. AWS credentials are only needed for real speech.

```bash
# Server (mock speech + dev tools by default)
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000 --reload

# Client (in another terminal)
cd client
npm install
echo "VITE_DEV_MODE=1" > .env.local
npm run dev            # serves on localhost:5173
```

Or run both with `docker compose up`.

Open <http://localhost:5173/dev/split?room=TEST&seed=42> to see both screens side by side, with bots and a dev panel for skipping steps, adding fuel and jumping phases.

**Real speech locally:** run the server with `MOCK_SPEECH=0`, AWS credentials and a region where Transcribe streams `hi-IN`.

## Tests

```bash
# server
cd server && pytest -q
ruff check server scripts content && ruff format --check server scripts content   # from repo root
cd server && mypy --strict app
python content/validate_content.py

# client
cd client
npm run typecheck && npm run lint && npm run format:check
npm test               # unit tests (vitest)
npm run e2e            # Playwright, against a built-in fake server
```

The e2e kit can also test a real backend: `E2E_SERVER=real npm run e2e -- --project=flows split-bots mock-play rejoin lifeline`. See [`client/INTEGRATION.md`](client/INTEGRATION.md).

CI (`.github/workflows/ci.yml`) runs the content validator, the server checks and the client checks on every push and pull request.

## Deploy

The live build runs on a single EC2 instance with Docker Compose and [Caddy](https://caddyserver.com) for automatic HTTPS. HTTPS matters because browsers only allow the microphone on secure pages.

```bash
docker compose -f docker-compose.prod.yml up -d
```

- Set the domain in `Caddyfile`, and `ALLOWED_ORIGINS` to match.
- The server's IAM role needs `transcribe:StartStreamTranscription*`, `translate:TranslateText`, `bedrock:InvokeModel` and `dynamodb:PutItem`/`GetItem`.
- One-time setup: `scripts/create_table.py`, `scripts/make_terminology.py` and `scripts/make_vocabularies.py`.
- Run exactly one server: game state lives in memory.

The full list of environment variables is in `docs/BACKEND_SPEC.md` §B3, and the ECS Fargate + ALB alternative is in §B19.

### Built-in cost and abuse protection

- Per-IP limits on new rooms and connections, and per-connection message and audio rate limits.
- Rooms close when a player has been gone for 60 seconds, and after an hour at most.
- Daily caps on Transcribe minutes, Translate calls and Bedrock reports. When a cap is hit, the game falls back to typing and a template report instead of spending more.

See §B22 for the defaults.

---

## Project layout

```text
client/     browser game: React + three.js scene, Tower UI, audio, e2e kit
server/     FastAPI game server: rooms, state machine, judge, language engine, speech
content/    lexicon, stations, phase scripts, cinematics, demo route, validator
scripts/    AWS setup: DynamoDB table, Translate terminology, Transcribe vocabularies
docs/       frontend and backend specs (shared contract in Part A)
```

## License

The code is released under the [MIT License](LICENSE).

**Fonts** are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org), which allows bundling and redistribution with software:

- **Baloo 2**, © 2019 The Baloo 2 Project Authors ([EkType/Baloo2](https://github.com/EkType/Baloo2)). It's bundled as `client/public/fonts/Baloo2-Bold.ttf`, with its license in [`client/public/fonts/OFL.txt`](client/public/fonts/OFL.txt), and is also loaded through `@fontsource/baloo-2`.
- **Kalam**, © 2014 Indian Type Foundry, loaded through `@fontsource/kalam`.

**Third-party libraries** keep their own licenses:

| | Libraries | License |
| --- | --- | --- |
| Client | React, three.js, React Three Fiber, drei, @react-three/postprocessing, zustand, Tailwind CSS | MIT |
| | postprocessing | Zlib |
| | qrcode.react | ISC |
| | GSAP | [GSAP Standard "no charge" License](https://gsap.com/standard-license) (free, including for commercial use) |
| Server | FastAPI, pydantic, RapidFuzz | MIT |
| | Uvicorn | BSD-3-Clause |
| | boto3, amazon-transcribe | Apache-2.0 |
| | orjson | Apache-2.0 or MIT |

Speech, translation and the mission report use Amazon Transcribe, Amazon Translate and Amazon Bedrock under the deploying account's AWS terms. There are no third-party art or audio assets: every model is built from primitives and every sound is generated in code.

---

Built for a hackathon by two people who once had to explain "the red button, no, the *other* red button" to each other.
