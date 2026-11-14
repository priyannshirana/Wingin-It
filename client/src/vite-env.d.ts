/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket base without the room code, e.g. `wss://api.example.com/ws`; empty = same origin. */
  readonly VITE_WS_URL?: string;
  /** REST/clips origin, e.g. `https://api.example.com`; empty = same origin. */
  readonly VITE_API_URL?: string;
  /** `1` compiles in the dev routes and tooling (§F18). */
  readonly VITE_DEV_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
