import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken, unregisterPushToken } from "./api/beamloop";

/**
 * Push registration for publish outcomes.
 *
 * BeamLoop schedules posts and publishes video asynchronously, so a post
 * routinely settles minutes or hours after the app was closed. The server
 * sends through Expo's push service; this module only obtains the token and
 * hands it over.
 *
 * Every function here is best-effort. Notifications are a convenience on top
 * of History, which remains the source of truth, so nothing in the app should
 * fail because a token could not be obtained.
 */

// Show an alert even if the app happens to be foregrounded when a scheduled
// post lands — otherwise the user sees nothing at all.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let lastRegisteredToken: string | null = null;

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    // Present in builds made by EAS, absent in some dev contexts.
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId
  );
}

/**
 * Obtain the Expo push token and register it against the signed-in account.
 *
 * `askIfNeeded: false` refreshes an already-granted token without ever showing
 * a permission dialog, which is what we want on launch. Pass true only at a
 * moment where the prompt makes obvious sense — right after someone schedules
 * a post, not on first open.
 */
export async function registerForPushNotifications(
  { askIfNeeded }: { askIfNeeded: boolean } = { askIfNeeded: false }
): Promise<boolean> {
  try {
    // Simulators cannot receive push notifications.
    if (!Device.isDevice) return false;

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      // Never re-prompt when the user has already said no: iOS won't show the
      // dialog a second time, and asking would just be a silent no-op.
      if (!askIfNeeded || !existing.canAskAgain) return false;
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return false;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Publishing updates",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const id = projectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      id ? { projectId: id } : undefined
    );
    if (!token) return false;

    // The token is stable across launches; only tell the server when it moves.
    if (token !== lastRegisteredToken) {
      await registerPushToken(token);
      lastRegisteredToken = token;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Detach this device from the account being signed out, so the next person to
 * use the phone doesn't receive the previous account's publishing updates.
 */
export async function unregisterForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    const id = projectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      id ? { projectId: id } : undefined
    );
    if (token) await unregisterPushToken(token);
  } catch {
    // Sign-out must never be blocked by a failed cleanup call.
  } finally {
    lastRegisteredToken = null;
  }
}
