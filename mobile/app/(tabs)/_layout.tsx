import { BlurView } from "expo-blur";
import { Tabs, useRouter } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { BeamBurst } from "../../src/components/BeamBurst";
import {
  fonts,
  palette,
  shadows,
  sizes,
  type,
} from "../../src/theme";

function AccountsIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={1.8} />
      <Path d="M4 21c0-4 4-6 8-6s8 2 8 6" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function HistoryIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2"
        stroke={color}
        strokeWidth={1.8}
      />
    </Svg>
  );
}

// The design's tab bar: blurred console tint, mono labels, and the
// signature center transmit FAB (opens Compose as a modal).
function BeamTabBar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const tabs = [
    { route: "connections", label: "ACCOUNTS", Icon: AccountsIcon },
    { route: "history", label: "HISTORY", Icon: HistoryIcon },
  ];

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: sizes.tabBar + insets.bottom,
      }}
    >
      <BlurView
        intensity={40}
        tint="dark"
        style={{
          flex: 1,
          backgroundColor: palette.tabBar,
          borderTopWidth: 1,
          borderTopColor: palette.borderFaint,
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-around",
          paddingTop: 12,
          paddingHorizontal: 26,
        }}
      >
        {tabs.map(({ route, label, Icon }, i) => {
          const focused =
            state.routes[state.index]?.name === route;
          const color = focused ? palette.text : palette.textLabel;
          return (
            <Pressable
              key={route}
              onPress={() => navigation.navigate(route)}
              style={{ alignItems: "center", gap: 5, width: 80 }}
            >
              <Icon color={color} />
              <Text
                style={{
                  ...type.monoTab,
                  fontFamily: focused ? fonts.monoBold : fonts.mono,
                  color,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </BlurView>
      {/* center transmit FAB */}
      <Pressable
        onPress={() => router.push("/compose")}
        style={[
          {
            position: "absolute",
            left: "50%",
            top: -18,
            marginLeft: -sizes.fab / 2,
            width: sizes.fab,
            height: sizes.fab,
            borderRadius: sizes.fab / 2,
            backgroundColor: palette.signal,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 6,
            borderColor: palette.console,
          },
          shadows.fab,
        ]}
        accessibilityLabel="New post"
      >
        <BeamBurst size={30} variant="glyph" hubFill={palette.console} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <BeamTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.console },
      }}
    >
      <Tabs.Screen name="connections" />
      <Tabs.Screen name="history" />
    </Tabs>
  );
}
