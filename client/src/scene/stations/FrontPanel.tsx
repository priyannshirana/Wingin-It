import { StationGroup } from "../StationGroup";

/** Thin wrapper: the layout comes from stations.json (§F9.3). */
export function FrontPanel() {
  return <StationGroup station="front" />;
}
