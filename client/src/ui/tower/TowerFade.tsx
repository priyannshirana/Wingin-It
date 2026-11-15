import { useCue } from "./useCue";
import { Wash } from "./Wash";

/** The prologue's time-skip black and the dimmed frame behind the take-control card (§F14.4). */
export function TowerFade() {
  const black = useCue("fade_black");
  const dim = useCue("fade_dim");
  return (
    <>
      <Wash
        on={black}
        testId="tower-black"
        to={1}
        inS={0.4}
        outS={0.4}
        className="z-[25]"
        background="#000"
      />
      <Wash
        on={dim}
        testId="tower-dim"
        to={0.55}
        inS={0.4}
        outS={0.4}
        className="z-[24]"
        background="#000"
      />
    </>
  );
}
