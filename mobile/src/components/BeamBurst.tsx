import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { motion, palette, spectrumOrder } from "../theme";

const AnimatedLine = Animated.createAnimatedComponent(Line);

/**
 * The signature motif: a bright source fanning out to six channels.
 * Geometry is lifted from the design (viewBox 200, hub at center, nodes on
 * a 78-radius ring starting at -90° in 60° steps, spectrum order).
 *
 * variant "plain"   — onboarding hero: dot nodes + halo ring, beams pulse
 * variant "labeled" — brand-logo nodes, solid beams
 * variant "glyph"   — thick mini burst for the tab-bar transmit button
 */
interface BeamBurstProps {
  size: number;
  variant?: "plain" | "labeled" | "glyph";
  animated?: boolean;
  glyphs?: string[]; // labeled variant: 24×24 brand paths, spectrum order
  monograms?: string[]; // labeled variant fallback, spectrum order
  hubFill?: string;
}

const NODE_ANGLES = [0, 1, 2, 3, 4, 5].map((i) => ((-90 + i * 60) * Math.PI) / 180);
const nodeXY = (r: number) =>
  NODE_ANGLES.map((a) => ({
    x: 100 + r * Math.cos(a),
    y: 100 + r * Math.sin(a),
  }));

export function BeamBurst({
  size,
  variant = "plain",
  animated = false,
  glyphs,
  monograms,
  hubFill = palette.signal,
}: BeamBurstProps) {
  const reducedMotion = useReducedMotion();
  const shouldAnimate = animated && !reducedMotion;

  const beamOpacities = useRef(
    spectrumOrder.map(() => new Animated.Value(1))
  ).current;

  useEffect(() => {
    if (!shouldAnimate) {
      beamOpacities.forEach((v) => v.setValue(1));
      return;
    }
    const loops = beamOpacities.map((value, i) => {
      value.setValue(0.25);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: motion.beam / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(value, {
            toValue: 0.25,
            duration: motion.beam / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      );
      const timer = setTimeout(() => loop.start(), i * motion.beamStagger);
      return { loop, timer };
    });
    return () => {
      loops.forEach(({ loop, timer }) => {
        clearTimeout(timer);
        loop.stop();
      });
    };
  }, [shouldAnimate, beamOpacities]);

  const isGlyph = variant === "glyph";
  const isLabeled = variant === "labeled";
  const nodeRadius = isGlyph ? 0 : isLabeled ? 15 : 9;
  const nodes = nodeXY(isGlyph ? 70 : 78);
  const strokeWidth = isGlyph ? 10 : isLabeled ? 3 : 2.5;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 200 200">
        {nodes.map((n, i) => (
          <AnimatedLine
            key={`beam-${i}`}
            x1={100}
            y1={100}
            x2={n.x}
            y2={n.y}
            stroke={spectrumOrder[i]}
            strokeWidth={strokeWidth}
            strokeOpacity={shouldAnimate ? beamOpacities[i] : 1}
          />
        ))}
        {!isGlyph &&
          nodes.map((n, i) => (
            <Circle
              key={`node-${i}`}
              cx={n.x}
              cy={n.y}
              r={nodeRadius}
              fill={spectrumOrder[i]}
            />
          ))}
        {isLabeled &&
          glyphs?.map((d, i) => {
            const g = 20; // glyph box; 24×24 path scaled to fit the node
            const n = nodes[i]!;
            return (
              <G
                key={`glyph-${i}`}
                transform={`translate(${n.x - g / 2}, ${n.y - g / 2}) scale(${g / 24})`}
              >
                <Path d={d} fill={palette.console} />
              </G>
            );
          })}
        {isLabeled &&
          !glyphs &&
          monograms?.map((label, i) => (
            <SvgText
              key={`label-${i}`}
              x={nodes[i]!.x}
              y={nodes[i]!.y + 4}
              fontFamily="JetBrainsMono_700Bold"
              fontSize={11}
              fill={palette.console}
              textAnchor="middle"
            >
              {label}
            </SvgText>
          ))}
        <Circle cx={100} cy={100} r={isGlyph ? 20 : isLabeled ? 20 : 19} fill={hubFill} />
        {variant === "plain" && (
          <Circle
            cx={100}
            cy={100}
            r={28}
            fill="none"
            stroke={palette.signal}
            strokeWidth={1.5}
            opacity={0.3}
          />
        )}
      </Svg>
    </View>
  );
}
