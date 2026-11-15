// Hor+ framing floor: the cockpit camera's vertical FOV is 55° (CockpitCanvas) and the shots are
// tuned at 1440×900 (aspect 1.6). On narrower canvases (the /dev/split Flyer iframe is ~720×868)
// a fixed vertical FOV would crop the station sides, so below 1.6 the vertical FOV widens to keep
// the horizontal coverage of 1.6. At 1.6 and wider the FOV stays 55°, so those frames are unchanged.
const BASE_FOV = 55;
const TUNED_ASPECT = 1.6;
const RAD = Math.PI / 180;

/** Vertical FOV (degrees) that keeps at least the horizontal coverage of aspect 1.6 at 55°. */
export function fovForAspect(aspect: number): number {
  if (!(aspect > 0) || aspect >= TUNED_ASPECT) return BASE_FOV;
  const tx = Math.tan((BASE_FOV * RAD) / 2) * TUNED_ASPECT;
  return (2 * Math.atan(tx / aspect)) / RAD;
}
