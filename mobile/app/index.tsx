import { Redirect } from "expo-router";
import { View } from "react-native";
import { BeamBurst } from "../src/components/BeamBurst";
import { useAuth } from "../src/auth/AuthContext";
import { palette } from "../src/theme";

export default function Index() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.console,
        }}
      >
        <BeamBurst size={96} variant="plain" animated />
      </View>
    );
  }

  return <Redirect href={user ? "/(tabs)/connections" : "/onboarding"} />;
}
