import { findControl } from "../../content/stations";
import type { ControlDrawing as ControlDrawingData } from "../../net/protocol";
import { ControlGlyph } from "./ControlGlyph";

const SIZE = 68; // ≥ 64 px (§F12.3 item 4)

// A big ink drawing of one control in its TARGET state, with a chunky ×count badge.
export function ControlDrawing({ control }: { control: ControlDrawingData }) {
  const def = findControl(control.object_id)?.control;
  return (
    <span
      className="relative inline-flex shrink-0"
      data-testid="control-drawing"
      data-object-id={control.object_id}
    >
      <svg viewBox="-32 -32 64 64" width={SIZE} height={SIZE} aria-hidden="true">
        <ControlGlyph
          type={control.type}
          state={control.target}
          color={control.color}
          label={control.label}
          big={def?.size === "big"}
          style={def?.style ?? null}
          weight={1.3}
        />
      </svg>
      {control.count > 1 && (
        <span
          data-testid="count-badge"
          className="absolute -right-2 -bottom-1 rounded-full border-2 border-white bg-ink px-2 font-display text-base leading-6 font-extrabold text-white shadow"
        >
          ×{control.count}
        </span>
      )}
    </span>
  );
}
