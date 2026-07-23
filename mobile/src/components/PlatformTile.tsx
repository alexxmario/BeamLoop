import { View } from "react-native";
import type { Platform } from "../api/types";
import { palette, platformHue } from "../theme";
import { PlatformGlyph } from "./PlatformGlyph";

/**
 * Hue-coded brand tile: the platform's logo glyph centered on its channel hue.
 * The design sizes the corner radius at ~28% of the tile; the glyph fills ~54%.
 */
export function PlatformTile({
  platform,
  size,
}: {
  platform: Platform;
  size: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        backgroundColor: platformHue[platform],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <PlatformGlyph
        platform={platform}
        size={Math.round(size * 0.54)}
        color={palette.console}
      />
    </View>
  );
}
