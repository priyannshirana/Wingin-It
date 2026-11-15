import type { ComponentType } from "react";
import type { PartType } from "../../net/protocol";
import { FuelGauge } from "./FuelGauge";
import type { PartProps } from "./kit";
import { Lamp } from "./Lamp";
import { NotchLever } from "./NotchLever";
import { PullHandle } from "./PullHandle";
import { PushButton } from "./PushButton";
import { Screen } from "./Screen";
import { ToggleSwitch } from "./ToggleSwitch";
import { UpDownLever } from "./UpDownLever";

/** Every part type maps to exactly one component (§F9.3). */
export const PART_COMPONENTS: Readonly<Record<PartType, ComponentType<PartProps>>> = {
  PushButton,
  ToggleSwitch,
  PullHandle,
  UpDownLever,
  NotchLever,
  Lamp,
  FuelGauge,
  Screen,
};
