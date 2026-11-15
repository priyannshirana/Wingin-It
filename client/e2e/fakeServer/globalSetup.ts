// Runs once before the suite. In real mode (E2E_SERVER=real) it fails fast, with a clear message,
// when the backend is not reachable or not in the mode the flow specs need.
import { PROXY_TARGET, REAL } from "./mode";

function flag(body: unknown, key: string): boolean {
  return (
    typeof body === "object" && body !== null && key in body && Reflect.get(body, key) === true
  );
}

export default async function globalSetup(): Promise<void> {
  if (!REAL) return;
  const url = `${PROXY_TARGET}/health`;
  let body: unknown;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new Error(
      `\n\nE2E_SERVER=real, but no game server answers ${url} (${why}).\n` +
        `Start the backend with DEV_MODE=1 MOCK_SPEECH=1 (client/INTEGRATION.md), set ` +
        `VITE_PROXY_TARGET to where it runs, or unset E2E_SERVER to use the fake server.\n`,
      { cause: err },
    );
  }
  const missing = [
    flag(body, "dev_mode") ? null : "DEV_MODE=1",
    flag(body, "mock_speech") ? null : "MOCK_SPEECH=1",
  ].filter((m): m is string => m !== null);
  if (missing.length > 0) {
    throw new Error(
      `\n\nThe server at ${url} is up, but the flow specs need ${missing.join(" and ")} ` +
        `(GET /health answered ${JSON.stringify(body)}).\n`,
    );
  }
}
