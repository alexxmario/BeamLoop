import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { connectDiscord } from "../../src/api/beamloop";
import { PlatformTile } from "../../src/components/PlatformTile";
import {
  monoTracking,
  palette,
  platformHue,
  sharedStyles as s,
  sizes,
  spacing,
  tracking,
  type,
} from "../../src/theme";

// Not in the imported design (its spectrum covers the six OAuth channels);
// composed from the design's 02b sheet language with the extrapolated
// Discord hue from theme.ts.
export default function ConnectDiscord() {
  const router = useRouter();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await connectDiscord(webhookUrl.trim(), name.trim() || undefined);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save webhook");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.sheet }}
      contentContainerStyle={{
        padding: spacing.xxl,
        paddingTop: 30,
        alignItems: "center",
      }}
      keyboardShouldPersistTaps="handled"
    >
      <PlatformTile platform="discord" size={sizes.tileSheet} />
      <Text
        style={{
          ...type.mono,
          color: platformHue.discord,
          letterSpacing: tracking(monoTracking.label, type.mono.fontSize),
          marginTop: 22,
          marginBottom: spacing.sm,
        }}
      >
        MANUAL CREDENTIALS · NO SIGN-IN
      </Text>
      <Text style={{ ...type.displayMd, color: palette.text }}>
        Paste a webhook
      </Text>
      <Text
        style={{
          ...type.bodySm,
          color: palette.textSecondary,
          textAlign: "center",
          marginTop: spacing.md,
          marginBottom: spacing.xxl,
          maxWidth: 300,
        }}
      >
        In your Discord server: Channel Settings → Integrations → Webhooks →
        New Webhook, then copy its URL here.
      </Text>

      <TextInput
        style={[s.input, { alignSelf: "stretch", marginBottom: spacing.md }]}
        placeholder="https://discord.com/api/webhooks/…"
        placeholderTextColor={palette.textLabel}
        autoCapitalize="none"
        autoCorrect={false}
        value={webhookUrl}
        onChangeText={setWebhookUrl}
      />
      <TextInput
        style={[s.input, { alignSelf: "stretch", marginBottom: spacing.md }]}
        placeholder="Display name (optional, e.g. #announcements)"
        placeholderTextColor={palette.textLabel}
        value={name}
        onChangeText={setName}
      />

      {error && (
        <Text style={[s.errorText, { alignSelf: "stretch", marginBottom: spacing.md }]}>
          {error}
        </Text>
      )}

      <Pressable
        style={[
          s.buttonPrimary,
          { alignSelf: "stretch" },
          (busy || !webhookUrl.trim()) && s.buttonDisabled,
        ]}
        disabled={busy || !webhookUrl.trim()}
        onPress={submit}
      >
        <Text style={s.buttonPrimaryText}>
          {busy ? "Validating…" : "Save webhook"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
