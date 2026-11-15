// Which server the flow specs talk to (client/INTEGRATION.md).

/** E2E_SERVER=real: no routing; the Vite proxy forwards to the teammate's server. */
export const REAL = process.env.E2E_SERVER === "real";

/** Where the Vite dev server proxies /ws, /api and /clips in real mode. */
export const PROXY_TARGET = (process.env.VITE_PROXY_TARGET ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);
