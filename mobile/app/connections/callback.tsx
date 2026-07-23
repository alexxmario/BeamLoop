import { Redirect } from "expo-router";

/**
 * Landing route for the beamloop://connections/callback deep link.
 *
 * Normally openAuthSessionAsync intercepts the redirect and this route never
 * renders. It exists as a fallback for cold-start deep links (e.g. the user
 * finished connecting in an external browser).
 */
export default function ConnectionsCallback() {
  return <Redirect href="/(tabs)/connections" />;
}
