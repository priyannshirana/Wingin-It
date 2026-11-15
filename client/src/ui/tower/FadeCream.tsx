import { useCue } from "./useCue";
import { Wash } from "./Wash";

/** The ending's fade to cream before the word deck (§F14.4); the title card stays on top. */
export function FadeCream() {
  const on = useCue("fade_cream");
  return (
    <Wash
      on={on}
      testId="fade-cream"
      to={1}
      inS={1.8}
      outS={0.4}
      className="z-[26]"
      background="#F2E8D5"
    />
  );
}
