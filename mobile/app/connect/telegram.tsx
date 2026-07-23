import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { connectTelegram } from "../../src/api/beamloop";
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

// Not in the imported design — composed from its 02b sheet language with
// the extrapolated Telegram hue from theme.ts.
export default function ConnectTelegram() {
  const router = useRouter();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = botToken.trim().length > 0 && chatId.trim().length > 0;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await connectTelegram(
        botToken.trim(),
        chatId.trim(),
        name.trim() || undefined
      );
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save credentials");
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
      <PlatformTile platform="telegram" size={sizes.tileSheet} />
      <Text
        style={{
          ...type.mono,
          color: platformHue.telegram,
          letterSpacing: tracking(monoTracking.label, type.mono.fontSize),
          marginTop: 22,
          marginBottom: spacing.sm,
        }}
      >
        MANUAL CREDENTIALS · NO SIGN-IN
      </Text>
      <Text style={{ ...type.displayMd, color: palette.text }}>
        Add your bot
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
        Create a bot with @BotFather to get a token, add it to your channel
        or group as an admin, then enter the chat ID.
      </Text>

      <TextInput
        style={[s.input, { alignSelf: "stretch", marginBottom: spacing.md }]}
        placeholder="Bot token from @BotFather"
        placeholderTextColor={palette.textLabel}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={botToken}
        onChangeText={setBotToken}
      />
      <TextInput
        style={[s.input, { alignSelf: "stretch", marginBottom: spacing.md }]}
        placeholder="Chat ID (@channel or -100123456789)"
        placeholderTextColor={palette.textLabel}
        autoCapitalize="none"
        autoCorrect={false}
        value={chatId}
        onChangeText={setChatId}
      />
      <TextInput
        style={[s.input, { alignSelf: "stretch", marginBottom: spacing.md }]}
        placeholder="Display name (optional)"
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
          (busy || !canSubmit) && s.buttonDisabled,
        ]}
        disabled={busy || !canSubmit}
        onPress={submit}
      >
        <Text style={s.buttonPrimaryText}>
          {busy ? "Validating…" : "Save credentials"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
