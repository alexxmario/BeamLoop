import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform as RNPlatform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "../src/auth/AuthContext";
import { BeamBurst } from "../src/components/BeamBurst";
import { platformGlyphPath } from "../src/components/platformGlyphs";
import {
  fonts,
  monoTracking,
  palette,
  radius,
  sharedStyles as s,
  sizes,
  spacing,
  spectrum,
  tracking,
  type,
} from "../src/theme";

const SLIDE_COUNT = 4; // 3 design slides + auth (auth is not in the design)

// Brand glyphs on the burst nodes, in spectrum order (matches the beams).
const OAUTH_GLYPHS = [
  platformGlyphPath.tiktok,
  platformGlyphPath.instagram,
  platformGlyphPath.youtube,
  platformGlyphPath.facebook,
  platformGlyphPath.x,
  platformGlyphPath.threads,
];

export default function Onboarding() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const goTo = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setPage(index);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") await signUp(email.trim(), password);
      else await signIn(email.trim(), password);
      router.replace("/(tabs)/connections");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.console }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / width))
        }
      >
        {/* 01 / WELCOME */}
        <Slide
          width={width}
          overline="01 / WELCOME"
          onSkip={() => goTo(3)}
          hero={<BeamBurst size={sizes.burstHero} variant="plain" animated />}
          title={"One upload.\nEvery platform."}
          body="Publish a video or photo to Instagram, YouTube, Facebook, X, Discord, and Telegram — in a single tap."
          dots={page}
          dotIndex={0}
          cta="See how it works"
          onCta={() => goTo(1)}
        />

        {/* 02 / CONNECT */}
        <Slide
          width={width}
          overline="02 / CONNECT"
          onSkip={() => goTo(3)}
          hero={
            <View
              style={{
                width: sizes.burstHero,
                height: sizes.burstHero,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SpectrumHalo size={sizes.burstHero} />
              <BeamBurst
                size={sizes.burstHero}
                variant="labeled"
                glyphs={OAUTH_GLYPHS}
              />
            </View>
          }
          title={"Your channels,\none console."}
          body="Link each account once, then choose exactly where each post goes."
          dots={page}
          dotIndex={1}
          cta="Continue"
          onCta={() => goTo(2)}
        />

        {/* 03 / PUBLISH */}
        <View style={{ width, paddingHorizontal: spacing.heroX, paddingBottom: 40 }}>
          <SlideHeader overline="03 / PUBLISH" onSkip={() => goTo(3)} />
          <View style={{ flex: 1, justifyContent: "center", gap: 14 }}>
            <TimingRow
              icon={
                <View style={timingIconTile(palette.signal)}>
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: palette.console,
                    }}
                  />
                </View>
              }
              title="Post now"
              meta="FIRES IMMEDIATELY"
            />
            <TimingRow
              icon={
                <View style={timingIconTile(spectrum.facebook)}>
                  <Text
                    style={{
                      fontFamily: fonts.monoBold,
                      fontSize: 13,
                      color: palette.console,
                    }}
                  >
                    7:30
                  </Text>
                </View>
              }
              title="Schedule in a tap"
              meta="+1 HOUR · TOMORROW · MONDAY"
            />
            <TimingRow
              icon={
                <View style={timingIconTile(palette.success)}>
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderWidth: 2.5,
                      borderColor: palette.console,
                      borderRadius: 4,
                    }}
                  />
                </View>
              }
              title="Track delivery"
              meta="CHECK EVERY RESULT"
            />
            <Text
              style={{
                ...type.displayLg,
                fontSize: 36,
                lineHeight: 36,
                color: palette.text,
                marginTop: spacing.xxl,
              }}
            >
              Now, or right{"\n"}on time.
            </Text>
            <Text
              style={{
                ...type.body,
                color: palette.textSecondary,
                maxWidth: 320,
              }}
            >
              Pick your channels, send instantly or reserve a smart time, then
              follow every delivery from History.
            </Text>
          </View>
          <Dots active={page} index={2} />
          <Pressable style={s.buttonPrimary} onPress={() => goTo(3)}>
            <Text style={s.buttonPrimaryText}>Connect accounts</Text>
          </Pressable>
          <Pressable onPress={() => goTo(3)}>
            <Text
              style={{
                ...type.monoNav,
                color: palette.text,
                textAlign: "center",
                marginTop: spacing.md,
              }}
            >
              I'll set this up later
            </Text>
          </Pressable>
        </View>

        {/* 04 / SIGN IN — not in the imported design; styled with its tokens */}
        <KeyboardAvoidingView
          style={{ width, paddingHorizontal: spacing.heroX, paddingBottom: 40 }}
          behavior={RNPlatform.OS === "ios" ? "padding" : undefined}
        >
          <SlideHeader overline="04 / SIGN IN" />
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text
              style={{
                ...type.displayXl,
                color: palette.text,
                letterSpacing: tracking(-0.01, type.displayXl.fontSize),
              }}
            >
              Beam in.
            </Text>
            <Text
              style={{
                ...type.body,
                color: palette.textSecondary,
                marginTop: spacing.lg,
                marginBottom: spacing.xxl,
              }}
            >
              {mode === "signup"
                ? "Create your console. Your channels connect right after."
                : "Welcome back to the console."}
            </Text>
            <TextInput
              style={[s.input, { marginBottom: spacing.md }]}
              placeholder="Email"
              placeholderTextColor={palette.textLabel}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={[s.input, { marginBottom: spacing.md }]}
              placeholder="Password (min 8 characters)"
              placeholderTextColor={palette.textLabel}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {error && (
              <Text style={[s.errorText, { marginBottom: spacing.md }]}>
                {error}
              </Text>
            )}
            <Pressable
              style={[s.buttonPrimary, busy && s.buttonDisabled]}
              disabled={busy}
              onPress={submit}
            >
              <Text style={s.buttonPrimaryText}>
                {mode === "signup" ? "Create account" : "Sign in"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode(mode === "signup" ? "login" : "signup")}
            >
              <Text
                style={{
                  ...type.monoNav,
                  color: palette.textMono,
                  textAlign: "center",
                  marginTop: spacing.lg,
                }}
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- pieces

function SlideHeader({
  overline,
  onSkip,
}: {
  overline: string;
  onSkip?: () => void;
}) {
  return (
    <View
      style={[s.row, { justifyContent: "space-between", paddingTop: spacing.xxl }]}
    >
      <Text style={s.overline}>{overline}</Text>
      {onSkip ? (
        <Pressable onPress={onSkip}>
          <Text
            style={{
              ...type.mono,
              color: palette.textLabel,
              letterSpacing: tracking(monoTracking.wide, type.mono.fontSize),
            }}
          >
            SKIP
          </Text>
        </Pressable>
      ) : (
        <View />
      )}
    </View>
  );
}

function Slide({
  width,
  overline,
  onSkip,
  hero,
  title,
  body,
  dots,
  dotIndex,
  cta,
  onCta,
}: {
  width: number;
  overline: string;
  onSkip: () => void;
  hero: React.ReactNode;
  title: string;
  body: string;
  dots: number;
  dotIndex: number;
  cta: string;
  onCta: () => void;
}) {
  return (
    <View style={{ width, paddingHorizontal: spacing.heroX, paddingBottom: 40 }}>
      <SlideHeader overline={overline} onSkip={onSkip} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {hero}
        <Text
          style={{
            ...type.displayXl,
            color: palette.text,
            textAlign: "center",
            marginTop: 30,
            letterSpacing: tracking(-0.01, type.displayXl.fontSize),
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            ...type.body,
            color: palette.textSecondary,
            textAlign: "center",
            marginTop: 18,
            maxWidth: 300,
          }}
        >
          {body}
        </Text>
      </View>
      <Dots active={dots} index={dotIndex} />
      <Pressable style={s.buttonPrimary} onPress={onCta}>
        <Text style={s.buttonPrimaryText}>{cta}</Text>
      </Pressable>
    </View>
  );
}

function Dots({ active, index }: { active: number; index: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 7,
        justifyContent: "center",
        marginBottom: 24,
      }}
    >
      {[0, 1, 2, 3].slice(0, SLIDE_COUNT - 1).map((i) => (
        <View
          key={i}
          style={{
            width: (active >= 3 ? index === i : active === i) ? 26 : 6,
            height: 6,
            borderRadius: radius.bar,
            backgroundColor:
              (active >= 3 ? index === i : active === i)
                ? palette.signal
                : palette.dotTrack,
          }}
        />
      ))}
    </View>
  );
}

function TimingRow({
  icon,
  title,
  meta,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <View
      style={[
        s.row,
        {
          gap: spacing.lg,
          backgroundColor: palette.strip,
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: radius.cardLg,
          paddingVertical: 18,
          paddingHorizontal: spacing.xl,
        },
      ]}
    >
      {icon}
      <View>
        <Text style={{ ...type.itemTitle, color: palette.text }}>{title}</Text>
        <Text
          style={{
            ...type.mono,
            color: palette.textMono,
            letterSpacing: tracking(monoTracking.status, type.mono.fontSize),
          }}
        >
          {meta}
        </Text>
      </View>
    </View>
  );
}

const timingIconTile = (bg: string) => ({
  width: 42,
  height: 42,
  borderRadius: radius.input,
  backgroundColor: bg,
  alignItems: "center" as const,
  justifyContent: "center" as const,
});

// The design puts a blurred conic-gradient disc (opacity .12) behind the
// labeled burst. RN has no conic gradients or filter:blur, so this renders
// the spectrum as a faint six-arc ring instead — closest native equivalent.
function SpectrumHalo({ size }: { size: number }) {
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const seg = circumference / 6;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ position: "absolute", opacity: 0.12 }}
    >
      {Object.values(spectrum).map((hue, i) => (
        <Circle
          key={hue}
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke={hue}
          strokeWidth={12}
          strokeDasharray={`${seg} ${circumference - seg}`}
          strokeDashoffset={-i * seg + circumference / 4}
        />
      ))}
    </Svg>
  );
}
