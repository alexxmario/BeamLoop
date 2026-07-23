import { useState } from "react";
import { View, type ViewStyle } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import { palette } from "../theme";

/**
 * Diagonal-stripe media placeholder — the design's
 * repeating-linear-gradient(135deg, …) rendered as SVG lines.
 */
export function Stripes({
  colorA = palette.stripeA,
  colorB = palette.stripeB,
  spacing = 18,
  style,
}: {
  colorA?: string;
  colorB?: string;
  spacing?: number;
  style?: ViewStyle;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const lines: number[] = [];
  for (let c = -size.w; c <= size.h + size.w; c += spacing) lines.push(c);

  return (
    <View
      style={[{ overflow: "hidden" }, style]}
      onLayout={(e) =>
        setSize({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
    >
      {size.w > 0 && (
        <Svg width={size.w} height={size.h}>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={colorA} />
          {lines.map((c) => (
            <Line
              key={c}
              x1={0}
              y1={c}
              x2={size.w}
              y2={c + size.w}
              stroke={colorB}
              strokeWidth={spacing / 2}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}
