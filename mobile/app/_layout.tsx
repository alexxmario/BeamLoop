import {
  Archivo_400Regular,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from "@expo-google-fonts/archivo";
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { NoticeProvider } from "../src/components/Notice";
import { palette } from "../src/theme";

// Hold the native splash until the display fonts are ready. Without this the
// launch sequence flashes an empty screen between the splash and the first
// frame that can actually be typeset.
void SplashScreen.preventAutoHideAsync();

// Screen groups that require a signed-in user.
const PROTECTED_GROUPS = [
  "(tabs)",
  "account",
  "compose",
  "connect",
  "connections",
  "library",
  "plans",
];

// Reactively keep navigation in sync with auth state: if the session goes away
// (sign out, account deletion, or an expired token) while the user is on a
// protected screen, eject them to onboarding. Without this, setUser(null)
// changes state but never navigates, stranding the user on the tabs.
function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inProtected = PROTECTED_GROUPS.includes(segments[0] as string);
    if (!user && inProtected) {
      router.replace("/onboarding");
    }
  }, [user, loading, segments, router]);

  // A publishing update is only useful if it lands you on the post it's about.
  // Handles both a tap while running and a cold start from a notification.
  useEffect(() => {
    if (!user) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as
        | { type?: string }
        | undefined;
      if (data?.type === "post-settled") router.navigate("/(tabs)/history");
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const subscription =
      Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [user, router]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
    // Static instance of Archivo at wdth 125 / wght 800 — RN can't do
    // CSS font-stretch, so the design's display face ships as its own file.
    "ArchivoExpanded-ExtraBold": require("../assets/fonts/ArchivoExpanded-ExtraBold.ttf"),
  });

  useEffect(() => {
    // Font loading can also fail; either way we must let the splash go, or the
    // app would sit on it forever.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    // The native splash is still up; render a matching surface so there is no
    // pale frame underneath it.
    return <View style={{ flex: 1, backgroundColor: palette.console }} />;
  }

  return (
    <AuthProvider>
      <NoticeProvider>
        <AuthGate />
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: palette.console },
            headerTintColor: palette.text,
            contentStyle: { backgroundColor: palette.console },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="library" options={{ headerShown: false }} />
          <Stack.Screen
            name="plans"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="account"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="compose"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="connections/callback"
            options={{ headerShown: false }}
          />
        </Stack>
      </NoticeProvider>
    </AuthProvider>
  );
}
