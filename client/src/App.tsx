import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from "react-router";
import { DEV } from "./config";
import { Home } from "./ui/Home";
import { Lobby } from "./ui/Lobby";

// Dev routes are only compiled when VITE_DEV_MODE=1 (§F4, §F18): `DEV` is a build-time constant,
// so these dynamic imports are dropped from production bundles.
const devRoutes: RouteObject[] = DEV
  ? [
      {
        path: "/dev/split",
        Component: lazy(() => import("./ui/DevSplit").then((m) => ({ default: m.DevSplit }))),
      },
      {
        path: "/dev/scene",
        Component: lazy(() => import("./ui/DevScene").then((m) => ({ default: m.DevScene }))),
      },
      {
        path: "/dev/cinematic",
        Component: lazy(() =>
          import("./ui/DevCinematic").then((m) => ({ default: m.DevCinematic })),
        ),
      },
    ]
  : [];

const router = createBrowserRouter([
  { path: "/", Component: Home },
  // M0: the room route renders the lobby stub; M1 switches Lobby / Flyer / Tower / Deck by status.
  { path: "/r/:code", Component: Lobby },
  ...devRoutes,
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function App() {
  return (
    <Suspense fallback={null}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
