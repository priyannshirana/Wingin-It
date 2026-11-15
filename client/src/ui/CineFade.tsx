import { useStore } from "../state/store";

// The Flyer's full-screen fades (§F14.2), driven by cues so seeking and skipping stay exact:
// black and a dimmed frame (prologue, 0.4 s), cream (ending, 0.8 s).
export function CineFade() {
  const black = useStore((s) => s.cues.fade_black === true);
  const dim = useStore((s) => s.cues.fade_dim === true);
  const cream = useStore((s) => s.cues.fade_cream === true);
  return (
    <>
      <div
        data-testid="cine-fade"
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-20 bg-black transition-opacity duration-[400ms] ease-in-out"
        style={{ opacity: black ? 1 : dim ? 0.55 : 0 }}
      />
      <div
        data-testid="cine-cream"
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-20 bg-cream transition-opacity duration-[800ms] ease-in-out"
        style={{ opacity: cream ? 1 : 0 }}
      />
    </>
  );
}
