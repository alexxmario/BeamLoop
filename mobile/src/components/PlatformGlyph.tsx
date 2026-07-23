import Svg, { Path } from "react-native-svg";
import type { Platform } from "../api/types";
import { platformGlyphPath } from "./platformGlyphs";

/**
 * A platform's brand glyph at `size`px, recolorable via `color`. Used inside
 * hue tiles, chips, and status nodes in place of a two-letter monogram.
 */
export function PlatformGlyph({
  platform,
  size,
  color,
}: {
  platform: Platform;
  size: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={platformGlyphPath[platform]} fill={color} />
    </Svg>
  );
}
