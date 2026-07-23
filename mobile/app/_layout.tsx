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
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { palette } from "../src/theme";

// Screen groups that require a signed-in user.
const PROTECTED_GROUPS = ["(tabs)", "compose", "connect", "connections"];

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

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
    // Static instance of Archivo at wdth 125 / wght 800 — RN can't do
    // CSS font-stretch, so the design's display face ships as its own file.
    "ArchivoExpanded-ExtraBold": require("../assets/fonts/ArchivoExpanded-ExtraBold.ttf"),
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.console,
        }}
      >
        <ActivityIndicator color={palette.signal} />
      </View>
    );
  }

  return (
    <AuthProvider>
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
        <Stack.Screen
          name="compose"
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <Stack.Screen
          name="connect/discord"
          options={{
            title: "Connect Discord",
            presentation: "modal",
            headerStyle: { backgroundColor: palette.sheet },
          }}
        />
        <Stack.Screen
          name="connect/telegram"
          options={{
            title: "Connect Telegram",
            presentation: "modal",
            headerStyle: { backgroundColor: palette.sheet },
          }}
        />
        <Stack.Screen
          name="connections/callback"
          options={{ headerShown: false }}
        />
      </Stack>
    </AuthProvider>
  );
}
