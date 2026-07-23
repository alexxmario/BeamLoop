import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * The design is explicitly reduced-motion aware: its CSS disables every
 * animation under prefers-reduced-motion. Any animated element must check
 * this hook and render its resting state instead.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
