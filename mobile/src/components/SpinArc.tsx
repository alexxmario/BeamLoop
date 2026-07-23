import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { motion, palette } from "../theme";

/**
 * The design's bl-spin loader: a faint ring with a quarter-arc that spins.
 * Freezes (static arc) under reduced motion.
 */
export function SpinArc({
  size = 18,
  color,
  trackColor = palette.spinTrackLight,
}: {
  size?: number;
  color: string;
  trackColor?: string;
}) {
  const reducedMotion = useReducedMotion();
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: motion.spin,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, rotation]);

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        transform: [
          {
            rotate: rotation.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", "360deg"],
            }),
          },
        ],
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 18 18">
        <Circle cx={9} cy={9} r={7} fill="none" stroke={trackColor} strokeWidth={2.5} />
        <Path
          d="M9 2 a7 7 0 0 1 7 7"
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}
