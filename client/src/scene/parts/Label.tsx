import { Text } from "@react-three/drei";
import { FONT_URL, LABEL_LIGHT, LABEL_SIZE } from "./kit";

interface Props {
  text: string | null;
  position: [number, number, number];
  color?: string;
  size?: number;
}

/** A digit / arrow label (troika can't shape Devanagari, so labels are digits and arrows only). */
export function Label({ text, position, color = LABEL_LIGHT, size = LABEL_SIZE }: Props) {
  if (!text) return null;
  return (
    <Text
      font={FONT_URL}
      fontSize={size}
      color={color}
      anchorX="center"
      anchorY="middle"
      position={position}
    >
      {text}
    </Text>
  );
}
