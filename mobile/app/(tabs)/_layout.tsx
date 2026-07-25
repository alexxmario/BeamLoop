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

function PlansIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function LibraryIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5C4.7 20 4 19.3 4 18.5zM20 5.5C20 4.7 19.3 4 18.5 4H13v16h5.5c.8 0 1.5-.7 1.5-1.5z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
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
    { route: "plans", label: "PLANS", Icon: PlansIcon },
    { route: "library", label: "LIBRARY", Icon: LibraryIcon },
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
          justifyContent: "center",
          paddingTop: 12,
          paddingHorizontal: 8,
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
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label.toLocaleLowerCase()}
              style={{
                alignItems: "center",
                gap: 5,
                flex: 1,
                maxWidth: 68,
                ...(i === 1 ? { marginRight: sizes.fab + 8 } : {}),
              }}
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
      <Tabs.Screen name="plans" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="history" />
    </Tabs>
  );
}
