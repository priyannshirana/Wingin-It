import { useCue } from "./useCue";
import { Wash } from "./Wash";

/** The dawn warmth (§F14.4 landing / ending): a sunrise gradient over the screen at 20 %. */
export function DawnWarm() {
  const on = useCue("dawn_warm");
  return (
    <Wash
      on={on}
      testId="dawn-warm"
      to={0.2}
      inS={1.2}
      outS={1.5}
      className="z-[20]"
      background="linear-gradient(to top, #FFB36B 0%, #FFD8A8 45%, #A8D8FF 100%)"
    />
  );
}
