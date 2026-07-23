import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Line,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import {
  fetchConnections,
  uploadPhotos,
  uploadVideo,
  type PickedMedia,
} from "../src/api/beamloop";
import {
  PLATFORM_LABELS,
  isComingSoon,
  type Connection,
  type Platform,
  type PostPlacement,
  type PostRecord,
} from "../src/api/types";
import { PlatformGlyph } from "../src/components/PlatformGlyph";
import { Stripes } from "../src/components/Stripes";
import { useReducedMotion } from "../src/hooks/useReducedMotion";
import { useAuth } from "../src/auth/AuthContext";
import {
  deleteIdea,
  listIdeas,
  saveIdea,
  type ContentIdea,
} from "../src/ideas";
import {
  deleteChannelGroup,
  listChannelGroups,
  saveChannelGroup,
  type ChannelGroup,
} from "../src/channelGroups";
import {
  fonts,
  monoTracking,
  motion,
  palette,
  platformHue,
  radius,
  sharedStyles as s,
  sizes,
  spacing,
  spectrumOrder,
  tracking,
  type,
} from "../src/theme";

// Per-channel crop preview geometry from the design (90px wide, height by AR).
const AR_PREVIEW: Record<Platform, { label: string; height: number }> = {
  tiktok: { label: "9:16", height: 150 },
  instagram: { label: "4:5", height: 112 },
  youtube: { label: "16:9", height: 52 },
  facebook: { label: "1:1", height: 90 },
  x: { label: "16:9", height: 52 },
  threads: { label: "4:5", height: 112 },
  discord: { label: "1:1", height: 90 },
  telegram: { label: "1:1", height: 90 },
};

const X_LIMIT = 280;
const PLATFORM_CAPTION_LIMITS: Partial<Record<Platform, number>> = {
  x: X_LIMIT,
  discord: 2000,
  telegram: 1024,
};
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

// This is an idempotency identifier, not a credential. Keeping generation
// local avoids adding a native crypto dependency solely for request replay.
function createIdempotencyKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function tomorrowMorning() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
}

function nextMondayMorning() {
  const date = new Date();
  const days = ((8 - date.getDay()) % 7) || 7;
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date;
}

function formatSchedule(iso: string, compact = false) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: compact ? undefined : "short",
    month: compact ? undefined : "short",
    day: compact ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Media {
  kind: "video" | "photos";
  items: PickedMedia[];
}

type PreflightLevel = "pass" | "warn" | "block";
interface PreflightCheck {
  label: string;
  detail: string;
  level: PreflightLevel;
}

function buildPreflightChecks(input: {
  connections: Connection[];
  selected: Platform[];
  media: Media | null;
  caption: string;
  overrides: Partial<Record<Platform, string>>;
  placements: Partial<Record<Platform, PostPlacement>>;
  scheduledAt: string | null;
  launchDrop: boolean;
}): PreflightCheck[] {
  const {
    connections,
    selected,
    media,
    caption,
    overrides,
    placements,
    scheduledAt,
    launchDrop,
  } = input;
  const checks: PreflightCheck[] = [];
  const live = new Set(connections.map((connection) => connection.platform));
  const unavailable = selected.filter((platform) => !live.has(platform));

  checks.push(
    selected.length === 0
      ? { label: "Destinations", detail: "Choose at least one channel", level: "block" }
      : unavailable.length
        ? {
            label: "Destinations",
            detail: `${unavailable.map((p) => PLATFORM_LABELS[p]).join(", ")} needs reconnecting`,
            level: "block",
          }
        : {
            label: "Destinations",
            detail: `${selected.length} live channel${selected.length === 1 ? "" : "s"}`,
            level: "pass",
          }
  );

  if (!media) {
    checks.push({ label: "Media", detail: "Add a video or photos", level: "block" });
  } else {
    const first = media.items[0];
    const dimensions = first?.width && first?.height ? ` · ${first.width}×${first.height}` : "";
    const oversized = media.items.some((item) => (item.size ?? 0) > MAX_VIDEO_BYTES);
    checks.push(
      oversized
        ? { label: "Media", detail: "A file is larger than 500 MB", level: "block" }
        : {
            label: "Media",
            detail:
              media.kind === "video"
                ? `Video ready${dimensions}`
                : `${media.items.length} photo${media.items.length === 1 ? "" : "s"} ready${dimensions}`,
            level: "pass",
          }
    );
  }

  if (!caption.trim()) {
    checks.push({ label: "Caption", detail: "Write a shared caption", level: "block" });
  } else {
    const over = selected.find((platform) => {
      const limit = PLATFORM_CAPTION_LIMITS[platform];
      return Boolean(limit && (overrides[platform]?.trim() || caption.trim()).length > limit);
    });
    checks.push(
      over
        ? {
            label: "Caption",
            detail: `${PLATFORM_LABELS[over]} exceeds its ${PLATFORM_CAPTION_LIMITS[over]}-character limit`,
            level: "block",
          }
        : {
            label: "Caption",
            detail: "Fits every selected channel",
            level: "pass",
          }
    );
  }

  if (selected.includes("instagram")) {
    const placement = placements.instagram ?? "timeline";
    const label = placement === "timeline" ? "Post" : placement === "reels" ? "Reel" : "Story";
    if (placement === "reels" && media?.kind !== "video") {
      checks.push({ label: "Instagram", detail: "Reels require a video", level: "block" });
    } else {
      const first = media?.items[0];
      const ratio = first?.width && first?.height ? first.width / first.height : undefined;
      const verticalWarning =
        (placement === "reels" || placement === "stories") &&
        ratio !== undefined &&
        (ratio < 0.5 || ratio > 0.62);
      checks.push({
        label: "Instagram",
        detail: verticalWarning ? `${label} selected · source may crop vertically` : `${label} selected`,
        level: verticalWarning ? "warn" : "pass",
      });
    }
  }

  if (scheduledAt) {
    const tooSoon = new Date(scheduledAt).getTime() < Date.now() + 5 * 60 * 1000;
    checks.push({
      label: launchDrop ? "Launch Drop" : "Timing",
      detail: tooSoon
        ? "Choose a time at least five minutes away"
        : launchDrop
          ? `${selected.length} channels locked to ${formatSchedule(scheduledAt)}`
          : `Scheduled for ${formatSchedule(scheduledAt)}`,
      level: tooSoon || (launchDrop && selected.length < 2) ? "block" : "pass",
    });
  } else {
    checks.push({ label: "Timing", detail: "Ready to publish now", level: "pass" });
  }

  return checks;
}

type Step =
  | { name: "edit" }
  | { name: "transmitting" }
  | { name: "done"; post: PostRecord; elapsedMs: number };

function assetToMedia(asset: ImagePicker.ImagePickerAsset): PickedMedia {
  const fallbackExt = asset.type === "video" ? "mp4" : "jpg";
  return {
    uri: asset.uri,
    name: asset.fileName ?? `upload.${fallbackExt}`,
    type:
      asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg"),
    size: asset.fileSize ?? undefined,
    width: asset.width,
    height: asset.height,
    durationMs: asset.duration ?? undefined,
  };
}

// iPhone photos are HEIC, which downstream platform processing can't decode.
// Re-encode every picked photo to JPEG before upload.
async function assetToJpegMedia(
  asset: ImagePicker.ImagePickerAsset
): Promise<PickedMedia> {
  const out = await manipulateAsync(asset.uri, [], {
    compress: 0.9,
    format: SaveFormat.JPEG,
  });
  const base = (asset.fileName ?? "photo").replace(/\.[^.]+$/, "");
  return {
    uri: out.uri,
    name: `${base}.jpg`,
    type: "image/jpeg",
    size: asset.fileSize ?? undefined,
    width: out.width,
    height: out.height,
  };
}

export default function ComposeModal() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [media, setMedia] = useState<Media | null>(null);
  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<Set<Platform>>(new Set());
  const [overrides, setOverrides] = useState<Partial<Record<Platform, string>>>({});
  const [placements, setPlacements] = useState<Partial<Record<Platform, PostPlacement>>>({});
  const [overrideEditor, setOverrideEditor] = useState<Platform | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [launchDrop, setLaunchDrop] = useState(false);
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [channelGroups, setChannelGroups] = useState<ChannelGroup[]>([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [step, setStep] = useState<Step>({ name: "edit" });
  const [error, setError] = useState<string | null>(null);
  // Keep this key if the network drops so a manual retry cannot publish twice.
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);

  const refreshIdeas = useCallback(() => {
    if (user) setIdeas(listIdeas(user.id));
  }, [user]);

  useEffect(() => refreshIdeas(), [refreshIdeas]);

  const refreshChannelGroups = useCallback(() => {
    if (user) setChannelGroups(listChannelGroups(user.id));
  }, [user]);

  useEffect(() => refreshChannelGroups(), [refreshChannelGroups]);

  useEffect(() => {
    if (!scheduledAt || selected.size < 2) setLaunchDrop(false);
  }, [scheduledAt, selected]);

  const applyChannelGroup = (platforms: Platform[]) => {
    const live = new Set(connections.map((connection) => connection.platform));
    const available = platforms.filter((platform) => live.has(platform));
    const missing = platforms.filter((platform) => !live.has(platform));
    setSelected(new Set(available));
    setIdempotencyKey(createIdempotencyKey());
    setError(
      available.length === 0
        ? "None of the channels in that group are connected yet."
        : missing.length
          ? `${missing.map((platform) => PLATFORM_LABELS[platform]).join(", ")} was skipped because it isn't connected.`
          : null
    );
  };

  const saveCurrentIdea = () => {
    if (!user || !caption.trim()) {
      setError("Write a caption before saving it as an idea.");
      return;
    }
    try {
      saveIdea(user.id, caption);
      refreshIdeas();
      setError(null);
      setIdeasOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that idea");
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchConnections()
        .then((all) => {
          const connected = all.filter(
            (c) => c.connected && !isComingSoon(c.platform)
          );
          setConnections(connected);
          // Don't preselect — the user chooses which channels to post to.
          // (Any selection already made this session is kept.)
          setSelected((prev) => {
            const live = new Set(connected.map((c) => c.platform));
            return new Set([...prev].filter((p) => live.has(p)));
          });
        })
        .catch((e) => {
          setConnections([]);
          setError(e instanceof Error ? e.message : "Couldn't load your connections");
        });
    }, [])
  );

  const pick = async (kind: Media["kind"]) => {
    setError(null);
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kind === "video" ? ["videos"] : ["images"],
        allowsMultipleSelection: kind === "photos",
        selectionLimit: 10,
        quality: 0.9,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open your media library");
      return;
    }
    if (result.canceled || result.assets.length === 0) return;
    if (kind === "video") {
      const video = result.assets[0];
      if (video?.fileSize && video.fileSize > MAX_VIDEO_BYTES) {
        setError("Choose a video smaller than 500 MB.");
        return;
      }
      setIdempotencyKey(createIdempotencyKey());
      setMedia({ kind, items: result.assets.map(assetToMedia) });
      return;
    }
    try {
      const items = await Promise.all(result.assets.map(assetToJpegMedia));
      setIdempotencyKey(createIdempotencyKey());
      setPlacements((prev) =>
        prev.instagram === "reels" ? { ...prev, instagram: "timeline" } : prev
      );
      setMedia({ kind, items });
    } catch {
      setError("Couldn't process that photo. Try a different one.");
    }
  };

  const toggle = (platform: Platform) => {
    setIdempotencyKey(createIdempotencyKey());
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const publish = async () => {
    if (!media) return;
    setStep({ name: "transmitting" });
    setError(null);
    const started = Date.now();
    try {
      const options = {
        title: caption.trim(),
        platforms: [...selected],
        overrides,
        placements,
        scheduledAt: scheduledAt ?? undefined,
        launchDrop,
      };
      const { post } =
        media.kind === "video"
          ? await uploadVideo(media.items[0]!, options, idempotencyKey)
          : await uploadPhotos(media.items, options, idempotencyKey);
      setStep({ name: "done", post, elapsedMs: Date.now() - started });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setStep({ name: "edit" });
    }
  };

  const reset = () => {
    setMedia(null);
    setIdempotencyKey(createIdempotencyKey());
    setCaption("");
    setOverrides({});
    setPlacements({});
    setScheduledAt(null);
    setLaunchDrop(false);
    setOverrideEditor(null);
    setError(null);
    setStep({ name: "edit" });
  };

  const selectedList = [...selected];
  const tooLongPlatforms = selectedList.filter((platform) => {
    const limit = PLATFORM_CAPTION_LIMITS[platform];
    return Boolean(limit && (overrides[platform]?.trim() || caption.trim()).length > limit);
  });
  const preflightChecks = buildPreflightChecks({
    connections,
    selected: selectedList,
    media,
    caption,
    overrides,
    placements,
    scheduledAt,
    launchDrop,
  });
  const canPost = !preflightChecks.some((check) => check.level === "block");

  if (step.name === "transmitting") {
    return (
      <TransmitScreen
        platforms={selectedList}
        scheduled={Boolean(scheduledAt)}
        launchDrop={launchDrop}
      />
    );
  }
  if (step.name === "done") {
    return (
      <SuccessScreen
        post={step.post}
        elapsedMs={step.elapsedMs}
        onViewPosts={() => {
          router.back();
          router.push("/(tabs)/history");
        }}
        onPostAnother={reset}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.console }}>
      {/* nav — pad by the top inset so Close clears the status bar / notch */}
      <View
        style={[
          s.row,
          {
            justifyContent: "space-between",
            paddingHorizontal: 24,
            paddingTop: insets.top + spacing.sm,
            paddingBottom: spacing.rowPad,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        >
          <Text style={{ ...type.monoNav, color: palette.textMono }}>Close</Text>
        </Pressable>
        <Text style={{ ...type.displayNav, color: palette.text }}>New post</Text>
        <Pressable
          onPress={() => {
            refreshIdeas();
            setIdeasOpen(true);
          }}
          hitSlop={8}
          style={{ minWidth: 48, alignItems: "flex-end" }}
        >
          <Text style={{ ...type.monoNav, color: palette.signal }}>Ideas · {ideas.length}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.screenX, gap: 18, paddingBottom: 160 }}
        keyboardShouldPersistTaps="handled"
      >
        <ChannelGroupsBar
          connections={connections}
          selected={selectedList}
          groups={channelGroups}
          onApply={applyChannelGroup}
          onManage={() => {
            refreshChannelGroups();
            setGroupsOpen(true);
          }}
        />

        {/* media + per-channel previews */}
        <View>
          <Text style={[s.sectionLabel, { marginBottom: 10 }]}>
            Preview for each channel
          </Text>
          {media ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={[s.row, { gap: 10, alignItems: "flex-start" }]}>
                {connections.map((c) => (
                  <CropPreview
                    key={c.platform}
                    platform={c.platform}
                    media={media}
                    selected={selected.has(c.platform)}
                    onPress={() => toggle(c.platform)}
                  />
                ))}
              </View>
            </ScrollView>
          ) : (
            <AddMediaCard onPick={pick} />
          )}
          {media && (
            <Pressable
              onPress={() => {
                setMedia(null);
                setIdempotencyKey(createIdempotencyKey());
              }}
              hitSlop={8}
            >
              <Text
                style={{
                  ...type.monoMeta,
                  color: palette.textLabel,
                  marginTop: spacing.sm,
                }}
              >
                {media.kind === "video"
                  ? `1 VIDEO · ${media.items[0]?.name}`
                  : `${media.items.length} PHOTO${media.items.length === 1 ? "" : "S"}`}{" "}
                — TAP TO REPLACE
              </Text>
            </Pressable>
          )}
        </View>

        {/* shared caption */}
        <View
          style={{
            backgroundColor: palette.strip,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: radius.card,
            padding: spacing.cardPad,
          }}
        >
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
            <Text style={s.sectionLabel}>Shared caption</Text>
            <Text style={{ ...type.monoMeta, color: palette.textMono }}>
              {caption.length}
            </Text>
          </View>
          <TextInput
            style={{
              fontFamily: type.bodySm.fontFamily,
              fontSize: type.bodySm.fontSize,
              color: palette.text,
              minHeight: 72,
              textAlignVertical: "top",
              padding: 0,
            }}
            placeholder="One caption for every channel…"
            placeholderTextColor={palette.textLabel}
            multiline
            maxLength={2200}
            value={caption}
            onChangeText={(text) => {
              setCaption(text);
              setIdempotencyKey(createIdempotencyKey());
            }}
          />
          <Pressable
            onPress={saveCurrentIdea}
            disabled={!caption.trim()}
            style={{ alignSelf: "flex-start", marginTop: spacing.md }}
          >
            <Text
              style={{
                ...type.monoMeta,
                color: caption.trim() ? palette.signal : palette.textLabel,
              }}
            >
              + SAVE TO IDEAS
            </Text>
          </Pressable>
        </View>

        {/* per-platform override */}
        <OverrideCard
          platforms={selectedList}
          overrides={overrides}
          placements={placements}
          mediaKind={media?.kind ?? null}
          editor={overrideEditor}
          onPick={setOverrideEditor}
          onChange={(platform, text) => {
            setOverrides((prev) => ({ ...prev, [platform]: text }));
            setIdempotencyKey(createIdempotencyKey());
          }}
          onPlacement={(platform, placement) => {
            setPlacements((prev) => ({ ...prev, [platform]: placement }));
            setIdempotencyKey(createIdempotencyKey());
          }}
        />

        {selected.has("instagram") && (
          <InstagramDestinationCard
            mediaKind={media?.kind ?? null}
            value={placements.instagram ?? "timeline"}
            onChange={(placement) => {
              setPlacements((prev) => ({ ...prev, instagram: placement }));
              setIdempotencyKey(createIdempotencyKey());
            }}
          />
        )}

        <ScheduleCard
          value={scheduledAt}
          onChange={(value) => {
            setScheduledAt(value);
            if (!value) setLaunchDrop(false);
            setIdempotencyKey(createIdempotencyKey());
          }}
        />

        {scheduledAt && selected.size >= 2 && (
          <LaunchDropCard
            active={launchDrop}
            channelCount={selected.size}
            scheduledAt={scheduledAt}
            onChange={(active) => {
              setLaunchDrop(active);
              setIdempotencyKey(createIdempotencyKey());
            }}
          />
        )}

        <PreflightCard checks={preflightChecks} />

        {error && <Text style={s.errorText}>{error}</Text>}
        {connections.length === 0 && !error && (
          <Pressable
            onPress={() => router.replace("/(tabs)/connections")}
            style={[s.buttonSecondary, { alignItems: "center" }]}
          >
            <Text style={s.buttonSecondaryText}>Connect an account to start posting</Text>
          </Pressable>
        )}
        {tooLongPlatforms.length > 0 && (
          <Text style={s.errorText}>
            {PLATFORM_LABELS[tooLongPlatforms[0]!]} needs a caption of{
              " "
            }{PLATFORM_CAPTION_LIMITS[tooLongPlatforms[0]!]!} characters or fewer. Add a
            platform-specific caption above.
          </Text>
        )}
      </ScrollView>

      {/* hero transmit */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <LinearGradient
          colors={["transparent", palette.console, palette.console]}
          style={{
            paddingTop: 40,
            paddingHorizontal: spacing.screenX,
            paddingBottom: 26 + insets.bottom,
          }}
        >
          <View style={[s.row, { gap: spacing.rowPad }]}>
            <Pressable
            onPress={publish}
              disabled={!canPost}
              style={[
                {
                  flex: 1,
                  height: sizes.btnHero,
                  borderRadius: radius.btnHero,
                  backgroundColor: palette.signal,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                },
                !canPost && s.buttonDisabled,
              ]}
            >
              <LinearGradient
                colors={[...spectrumOrder]}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 6,
                }}
              />
              <Text style={{ ...type.buttonHero, color: palette.console }}>
                {launchDrop && scheduledAt
                  ? `Lock drop · ${formatSchedule(scheduledAt, true)}`
                  : scheduledAt
                  ? `Schedule · ${formatSchedule(scheduledAt, true)}`
                  : selected.size > 0 && selected.size === connections.length
                  ? `Post to all ${selected.size}`
                  : `Post to ${selected.size || "…"}`}
              </Text>
            </Pressable>
          </View>
          <View style={[s.row, { justifyContent: "center", gap: 8, marginTop: spacing.rowPad }]}>
            {selectedList.map((p) => (
              <View
                key={p}
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  backgroundColor: platformHue[p],
                }}
              />
            ))}
          </View>
        </LinearGradient>
      </View>
      <IdeasSheet
        visible={ideasOpen}
        ideas={ideas}
        onClose={() => setIdeasOpen(false)}
        onUse={(idea) => {
          setCaption(idea.text);
          setIdempotencyKey(createIdempotencyKey());
          setIdeasOpen(false);
        }}
        onDelete={(idea) => {
          if (!user) return;
          deleteIdea(user.id, idea.id);
          refreshIdeas();
        }}
      />
      <ChannelGroupsSheet
        visible={groupsOpen}
        groups={channelGroups}
        selected={selectedList}
        onClose={() => setGroupsOpen(false)}
        onApply={(group) => {
          applyChannelGroup(group.platforms);
          setGroupsOpen(false);
        }}
        onSave={(name) => {
          if (!user) return;
          try {
            saveChannelGroup(user.id, name, selectedList);
            refreshChannelGroups();
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't save that group");
          }
        }}
        onDelete={(group) => {
          if (!user) return;
          deleteChannelGroup(user.id, group.id);
          refreshChannelGroups();
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------- pieces

function ChannelGroupsBar({
  connections,
  selected,
  groups,
  onApply,
  onManage,
}: {
  connections: Connection[];
  selected: Platform[];
  groups: ChannelGroup[];
  onApply: (platforms: Platform[]) => void;
  onManage: () => void;
}) {
  const live = connections.map((connection) => connection.platform);
  const social = live.filter((platform) => platform !== "discord" && platform !== "telegram");
  const community = live.filter((platform) => platform === "discord" || platform === "telegram");
  const options = [
    { id: "all", name: "All live", platforms: live },
    ...(social.length ? [{ id: "social", name: "Social", platforms: social }] : []),
    ...(community.length ? [{ id: "community", name: "Community", platforms: community }] : []),
    ...groups.slice(0, 4),
  ];
  const selectedKey = [...selected].sort().join(",");

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Text style={s.sectionLabel}>Smart channel groups</Text>
        <Pressable onPress={onManage} hitSlop={8}>
          <Text style={{ ...type.monoMeta, color: palette.signal }}>MANAGE +</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={[s.row, { gap: spacing.sm }]}>
          {options.map((group) => {
            const active =
              group.platforms.length > 0 &&
              [...group.platforms].sort().join(",") === selectedKey;
            return (
              <Pressable
                key={group.id}
                onPress={() => onApply(group.platforms)}
                disabled={group.platforms.length === 0}
                style={{
                  paddingHorizontal: spacing.rowPad,
                  paddingVertical: 9,
                  borderRadius: radius.pill,
                  backgroundColor: active ? palette.signal : palette.strip,
                  borderWidth: 1,
                  borderColor: active ? palette.signal : palette.borderStrong,
                  opacity: group.platforms.length ? 1 : 0.45,
                }}
              >
                <Text
                  style={{
                    ...type.monoMeta,
                    color: active ? palette.console : palette.textSecondary,
                  }}
                >
                  {group.name} · {group.platforms.length}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function ChannelGroupsSheet({
  visible,
  groups,
  selected,
  onClose,
  onApply,
  onSave,
  onDelete,
}: {
  visible: boolean;
  groups: ChannelGroup[];
  selected: Platform[];
  onClose: () => void;
  onApply: (group: ChannelGroup) => void;
  onSave: (name: string) => void;
  onDelete: (group: ChannelGroup) => void;
}) {
  const [name, setName] = useState("");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            maxHeight: "78%",
            backgroundColor: palette.sheet,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            paddingTop: spacing.lg,
            paddingHorizontal: spacing.screenX,
            paddingBottom: 34,
            gap: spacing.lg,
          }}
        >
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <View>
              <Text style={s.sectionLabel}>Smart groups</Text>
              <Text style={{ ...type.displayTitle, color: palette.text, marginTop: 4 }}>
                Your fastest combinations.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ ...type.monoNav, color: palette.textMono }}>Done</Text>
            </Pressable>
          </View>

          <View
            style={{
              backgroundColor: palette.strip,
              borderWidth: 1,
              borderColor: palette.border,
              borderRadius: radius.card,
              padding: spacing.rowPad,
              gap: spacing.md,
            }}
          >
            <Text style={{ ...type.bodySm, color: palette.textSecondary }}>
              Save the {selected.length} currently selected channel{selected.length === 1 ? "" : "s"}.
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Launch team, Communities, Client A…"
              placeholderTextColor={palette.textLabel}
              maxLength={28}
              style={s.input}
            />
            <Pressable
              onPress={() => {
                onSave(name);
                if (name.trim() && selected.length) setName("");
              }}
              disabled={!name.trim() || selected.length === 0}
              style={[s.buttonPrimary, (!name.trim() || !selected.length) && s.buttonDisabled]}
            >
              <Text style={s.buttonPrimaryText}>Save current selection</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {groups.length === 0 ? (
              <Text style={{ ...type.bodySm, color: palette.textSecondary, textAlign: "center" }}>
                Your custom groups will appear here. All Live, Social, and Community are always ready.
              </Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {groups.map((group) => (
                  <View
                    key={group.id}
                    style={{
                      backgroundColor: palette.strip,
                      borderRadius: radius.card,
                      padding: spacing.rowPad,
                      borderWidth: 1,
                      borderColor: palette.border,
                      gap: spacing.sm,
                    }}
                  >
                    <View style={[s.row, { justifyContent: "space-between" }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...type.itemTitleSm, color: palette.text }}>{group.name}</Text>
                        <Text style={{ ...type.monoMeta, color: palette.textLabel, marginTop: 3 }}>
                          {group.platforms.map((platform) => PLATFORM_LABELS[platform]).join(" · ")}
                        </Text>
                      </View>
                      <Pressable onPress={() => onDelete(group)} hitSlop={8}>
                        <Text style={{ ...type.monoMeta, color: palette.danger }}>DELETE</Text>
                      </Pressable>
                    </View>
                    <Pressable onPress={() => onApply(group)}>
                      <Text style={{ ...type.monoMeta, color: palette.signal }}>USE GROUP ›</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function IdeasSheet({
  visible,
  ideas,
  onClose,
  onUse,
  onDelete,
}: {
  visible: boolean;
  ideas: ContentIdea[];
  onClose: () => void;
  onUse: (idea: ContentIdea) => void;
  onDelete: (idea: ContentIdea) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            maxHeight: "76%",
            backgroundColor: palette.sheet,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            paddingTop: spacing.lg,
            paddingHorizontal: spacing.screenX,
            paddingBottom: 34,
          }}
        >
          <View style={[s.row, { justifyContent: "space-between", marginBottom: spacing.lg }]}>
            <View>
              <Text style={s.sectionLabel}>Your idea shelf</Text>
              <Text style={{ ...type.displayTitle, color: palette.text, marginTop: 4 }}>
                Ready when inspiration hits.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ ...type.monoNav, color: palette.textMono }}>Done</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {ideas.length === 0 ? (
              <View
                style={{
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: palette.borderDashed,
                  borderRadius: radius.card,
                  padding: spacing.xxl,
                }}
              >
                <Text style={{ ...type.bodySm, color: palette.textSecondary, textAlign: "center" }}>
                  Write a caption, tap Save to Ideas, and it will wait here for your next post.
                </Text>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {ideas.map((idea) => (
                  <View
                    key={idea.id}
                    style={{
                      backgroundColor: palette.strip,
                      borderRadius: radius.card,
                      borderWidth: 1,
                      borderColor: palette.border,
                      padding: spacing.rowPad,
                      gap: spacing.md,
                    }}
                  >
                    <Text numberOfLines={5} style={{ ...type.bodySm, color: palette.text }}>
                      {idea.text}
                    </Text>
                    <View style={[s.row, { justifyContent: "space-between" }]}>
                      <Pressable
                        onPress={() => onUse(idea)}
                        style={{
                          backgroundColor: palette.signal,
                          borderRadius: radius.pill,
                          paddingHorizontal: spacing.rowPad,
                          paddingVertical: 7,
                        }}
                      >
                        <Text style={{ ...type.monoMeta, color: palette.console }}>USE THIS IDEA</Text>
                      </Pressable>
                      <Pressable onPress={() => onDelete(idea)} hitSlop={8}>
                        <Text style={{ ...type.monoMeta, color: palette.danger }}>DELETE</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CropPreview({
  platform,
  media,
  selected,
  onPress,
}: {
  platform: Platform;
  media: Media;
  selected: boolean;
  onPress: () => void;
}) {
  const ar = AR_PREVIEW[platform];
  const photoUri = media.kind === "photos" ? media.items[0]?.uri : null;
  return (
    <Pressable onPress={onPress} style={{ opacity: selected ? 1 : 0.35 }}>
      <View
        style={{
          width: 90,
          height: ar.height,
          borderRadius: radius.input,
          borderWidth: 2,
          borderColor: selected ? platformHue[platform] : palette.borderStrong,
          overflow: "hidden",
          backgroundColor: palette.stripeA,
        }}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <Stripes style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        )}
        {/* hue chip */}
        <View
          style={{
            position: "absolute",
            left: 6,
            top: 6,
            width: 20,
            height: 20,
            borderRadius: 6,
            backgroundColor: platformHue[platform],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PlatformGlyph platform={platform} size={12} color={palette.console} />
        </View>
        {/* AR badge */}
        <View
          style={{
            position: "absolute",
            left: 6,
            bottom: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 5,
            backgroundColor: palette.badgeScrim,
          }}
        >
          <Text style={{ fontFamily: fonts.mono, fontSize: 9, color: palette.text }}>
            {ar.label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// Not in the imported design (it assumes media exists): entry point to the
// picker, styled with the design's dashed queue-slot pattern.
function AddMediaCard({ onPick }: { onPick: (kind: Media["kind"]) => void }) {
  return (
    <View
      style={{
        borderWidth: 1.5,
        borderColor: palette.borderDashed,
        borderStyle: "dashed",
        borderRadius: radius.chip,
        padding: spacing.cardPad,
        gap: spacing.md,
      }}
    >
      <Text
        style={{
          ...type.mono,
          color: palette.success,
          letterSpacing: tracking(monoTracking.status, type.mono.fontSize),
          textAlign: "center",
        }}
      >
        + ADD YOUR CONTENT
      </Text>
      <View style={[s.row, { gap: 10 }]}>
        {(["video", "photos"] as const).map((kind) => (
          <Pressable
            key={kind}
            onPress={() => onPick(kind)}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: radius.tile,
              backgroundColor: palette.strip,
              borderWidth: 1,
              borderColor: palette.borderStrong,
              alignItems: "center",
            }}
          >
            <Text style={{ ...type.buttonSm, color: palette.text }}>
              {kind === "video" ? "Video" : "Photos"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function InstagramDestinationCard({
  mediaKind,
  value,
  onChange,
}: {
  mediaKind: Media["kind"] | null;
  value: PostPlacement;
  onChange: (placement: PostPlacement) => void;
}) {
  const options: Array<{
    value: PostPlacement;
    label: string;
    detail: string;
    videoOnly?: boolean;
  }> = [
    { value: "timeline", label: "Post", detail: "Feed" },
    { value: "reels", label: "Reel", detail: "9:16 video", videoOnly: true },
    { value: "stories", label: "Story", detail: "24-hour story" },
  ];

  return (
    <View
      style={{
        backgroundColor: palette.strip,
        borderWidth: 1,
        borderColor: platformHue.instagram,
        borderRadius: radius.card,
        padding: spacing.cardPad,
        gap: spacing.md,
      }}
    >
      <View style={[s.row, { gap: spacing.sm }]}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.badge,
            backgroundColor: platformHue.instagram,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PlatformGlyph platform="instagram" size={16} color={palette.console} />
        </View>
        <View>
          <Text style={s.sectionLabel}>Instagram destination</Text>
          <Text style={{ ...type.itemTitleSm, color: palette.text, marginTop: 2 }}>
            Choose exactly where it appears.
          </Text>
        </View>
      </View>
      <View style={[s.row, { gap: spacing.sm }]}>
        {options.map((option) => {
          const disabled = Boolean(option.videoOnly && mediaKind !== "video");
          const active = value === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: "center",
                borderRadius: radius.tile,
                backgroundColor: active ? platformHue.instagram : palette.sheet,
                borderWidth: 1,
                borderColor: active ? platformHue.instagram : palette.borderStrong,
                opacity: disabled ? 0.38 : 1,
              }}
            >
              <Text
                style={{
                  ...type.buttonSm,
                  color: active ? palette.console : palette.text,
                }}
              >
                {option.label}
              </Text>
              <Text
                style={{
                  ...type.monoMeta,
                  color: active ? palette.console : palette.textLabel,
                  marginTop: 2,
                }}
              >
                {option.detail}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {mediaKind !== "video" && (
        <Text style={{ ...type.monoMeta, color: palette.textLabel }}>
          Add a video to unlock Reel.
        </Text>
      )}
    </View>
  );
}

function OverrideCard({
  platforms,
  overrides,
  placements,
  mediaKind,
  editor,
  onPick,
  onChange,
  onPlacement,
}: {
  platforms: Platform[];
  overrides: Partial<Record<Platform, string>>;
  placements: Partial<Record<Platform, PostPlacement>>;
  mediaKind: Media["kind"] | null;
  editor: Platform | null;
  onPick: (p: Platform | null) => void;
  onChange: (p: Platform, text: string) => void;
  onPlacement: (p: Platform, placement: PostPlacement) => void;
}) {
  const text = editor ? overrides[editor] ?? "" : "";
  const captionLimit = editor ? PLATFORM_CAPTION_LIMITS[editor] : undefined;
  const overLimit = Boolean(captionLimit && text.length > captionLimit);
  const supportsPlacement = editor === "facebook";
  const placementOptions: PostPlacement[] =
    mediaKind === "video"
      ? ["timeline", "reels", "stories"]
      : ["timeline", "stories"];

  return (
    <View
      style={{
        backgroundColor: palette.strip,
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: radius.card,
        paddingVertical: spacing.rowPad,
        paddingHorizontal: spacing.cardPad,
        gap: spacing.md,
      }}
    >
      {editor ? (
        <>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <View style={[s.row, { gap: 10 }]}>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: radius.badge,
                  backgroundColor: platformHue[editor],
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <PlatformGlyph platform={editor} size={15} color={palette.console} />
              </View>
              <Text style={{ ...type.itemTitleSm, color: palette.text }}>
                {PLATFORM_LABELS[editor]} caption override
              </Text>
            </View>
            <Text
              style={{
                ...type.monoMeta,
                color:
                  captionLimit
                    ? overLimit
                      ? palette.danger
                      : palette.warning
                    : palette.textMono,
              }}
            >
              {captionLimit ? `${text.length} / ${captionLimit}` : text.length}
            </Text>
          </View>
          <TextInput
            style={{
              fontFamily: type.bodyXs.fontFamily,
              fontSize: type.bodyXs.fontSize,
              color: palette.textSecondary,
              minHeight: 48,
              textAlignVertical: "top",
              padding: 0,
            }}
            placeholder={`A shorter cut just for ${PLATFORM_LABELS[editor]}…`}
            placeholderTextColor={palette.textLabel}
            multiline
            value={text}
            onChangeText={(t) => onChange(editor, t)}
          />
          {supportsPlacement && (
            <View style={{ gap: spacing.sm }}>
              <Text style={s.sectionLabel}>Publish as</Text>
              <View style={[s.row, { gap: spacing.sm, flexWrap: "wrap" }]}>
                {placementOptions.map((placement) => {
                  const active = (placements[editor] ?? "timeline") === placement;
                  return (
                    <Pressable
                      key={placement}
                      onPress={() => onPlacement(editor, placement)}
                      style={{
                        paddingHorizontal: spacing.rowPad,
                        paddingVertical: 7,
                        borderRadius: radius.pill,
                        backgroundColor: active ? platformHue[editor] : palette.sheet,
                        borderWidth: 1,
                        borderColor: active ? platformHue[editor] : palette.borderStrong,
                      }}
                    >
                      <Text
                        style={{
                          ...type.monoMeta,
                          color: active ? palette.console : palette.textSecondary,
                          textTransform: "uppercase",
                        }}
                      >
                        {placement}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <Pressable onPress={() => onPick(null)} hitSlop={8}>
            <Text style={{ ...type.bodyXs, color: palette.textMono }}>Done</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={[s.row, { gap: spacing.sm }]}>
            <Text style={{ fontSize: 18, lineHeight: 20, color: palette.link }}>
              +
            </Text>
            <Text style={{ ...type.itemTitleSm, color: palette.link }}>
              Customize a platform
            </Text>
          </View>
          <View style={[s.row, { gap: spacing.sm, flexWrap: "wrap" }]}>
            {platforms.map((p) => {
              const has = Boolean(
                overrides[p]?.trim() || (placements[p] && placements[p] !== "timeline")
              );
              return (
                <Pressable
                  key={p}
                  onPress={() => onPick(p)}
                  style={{
                    paddingHorizontal: spacing.rowPad,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    backgroundColor: has ? platformHue[p] : palette.sheet,
                    borderWidth: 1,
                    borderColor: has ? platformHue[p] : palette.borderStrong,
                  }}
                >
                  <PlatformGlyph
                    platform={p}
                    size={15}
                    color={has ? palette.console : palette.textSecondary}
                  />
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

function ScheduleCard({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState(() => tomorrowMorning().toISOString());
  const hourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  const options: Array<{ label: string; value: string | null }> = [
    { label: "Now", value: null },
    { label: "+1 hour", value: hourFromNow.toISOString() },
    { label: "Tomorrow · 9", value: tomorrowMorning().toISOString() },
    { label: "Next Mon · 9", value: nextMondayMorning().toISOString() },
  ];

  return (
    <View
      style={{
        backgroundColor: palette.strip,
        borderWidth: 1,
        borderColor: value ? palette.signal : palette.border,
        borderRadius: radius.card,
        padding: spacing.cardPad,
        gap: spacing.md,
      }}
    >
      <View style={[s.row, { justifyContent: "space-between", gap: spacing.md }]}>
        <View>
          <Text style={s.sectionLabel}>When</Text>
          <Text style={{ ...type.itemTitleSm, color: palette.text, marginTop: 4 }}>
            {value ? formatSchedule(value) : "Post immediately"}
          </Text>
        </View>
        {value && (
          <View
            style={{
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: radius.pill,
              backgroundColor: palette.signal,
            }}
          >
            <Text style={{ ...type.monoMeta, color: palette.console }}>SCHEDULED</Text>
          </View>
        )}
      </View>
      <View style={[s.row, { gap: spacing.sm, flexWrap: "wrap" }]}>
        {options.map((option) => {
          const active =
            option.value === null
              ? value === null
              : Boolean(
                  value &&
                    Math.abs(
                      new Date(value).getTime() - new Date(option.value).getTime()
                    ) < 5 * 60 * 1000
                );
          return (
            <Pressable
              key={option.label}
              onPress={() => onChange(option.value)}
              style={{
                paddingHorizontal: spacing.rowPad,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: active ? palette.signal : palette.sheet,
                borderWidth: 1,
                borderColor: active ? palette.signal : palette.borderStrong,
              }}
            >
              <Text
                style={{
                  ...type.monoMeta,
                  color: active ? palette.console : palette.textSecondary,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            if (value) setCustomValue(value);
            setCustomOpen(true);
          }}
          style={{
            paddingHorizontal: spacing.rowPad,
            paddingVertical: 8,
            borderRadius: radius.pill,
            backgroundColor: palette.sheet,
            borderWidth: 1,
            borderColor: palette.borderStrong,
          }}
        >
          <Text style={{ ...type.monoMeta, color: palette.textSecondary }}>Custom…</Text>
        </Pressable>
      </View>
      <CustomScheduleSheet
        visible={customOpen}
        value={customValue}
        onChange={setCustomValue}
        onClose={() => setCustomOpen(false)}
        onConfirm={() => {
          onChange(customValue);
          setCustomOpen(false);
        }}
      />
    </View>
  );
}

function LaunchDropCard({
  active,
  channelCount,
  scheduledAt,
  onChange,
}: {
  active: boolean;
  channelCount: number;
  scheduledAt: string;
  onChange: (active: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!active)}
      style={{
        borderRadius: radius.card,
        borderWidth: 1.5,
        borderColor: active ? palette.signal : palette.borderStrong,
        backgroundColor: active ? palette.signalDim : palette.strip,
        padding: spacing.cardPad,
        overflow: "hidden",
      }}
    >
      <LinearGradient
        colors={active ? [...spectrumOrder] : [palette.borderStrong, palette.borderStrong]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: 4 }}
      />
      <View style={[s.row, { justifyContent: "space-between", gap: spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              ...type.mono,
              color: active ? palette.signal : palette.textMono,
              letterSpacing: tracking(monoTracking.overline, type.mono.fontSize),
            }}
          >
            LAUNCH DROP
          </Text>
          <Text style={{ ...type.itemTitleSm, color: palette.text, marginTop: 5 }}>
            Release all {channelCount} together.
          </Text>
          <Text style={{ ...type.bodyXs, color: palette.textSecondary, marginTop: 4 }}>
            BeamLoop uploads now and coordinates every channel for {formatSchedule(scheduledAt)}.
          </Text>
        </View>
        <View
          style={{
            width: 48,
            height: 28,
            borderRadius: 14,
            padding: 3,
            alignItems: active ? "flex-end" : "flex-start",
            backgroundColor: active ? palette.signal : palette.barTrack,
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: active ? palette.console : palette.textLabel,
            }}
          />
        </View>
      </View>
    </Pressable>
  );
}

function PreflightCard({ checks }: { checks: PreflightCheck[] }) {
  const blocks = checks.filter((check) => check.level === "block").length;
  const warnings = checks.filter((check) => check.level === "warn").length;
  const ready = blocks === 0;
  const accent = ready ? (warnings ? palette.warning : palette.success) : palette.danger;

  return (
    <View
      style={{
        backgroundColor: palette.strip,
        borderWidth: 1,
        borderColor: accent,
        borderRadius: radius.card,
        padding: spacing.cardPad,
        gap: spacing.md,
      }}
    >
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <View>
          <Text style={s.sectionLabel}>Post preflight</Text>
          <Text style={{ ...type.itemTitleSm, color: palette.text, marginTop: 4 }}>
            {ready ? (warnings ? "Ready with one note." : "Cleared for launch.") : `${blocks} item${blocks === 1 ? "" : "s"} to fix.`}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: radius.pill,
            backgroundColor: accent,
          }}
        >
          <Text style={{ ...type.monoMeta, color: palette.console }}>
            {ready ? "READY" : "HOLD"}
          </Text>
        </View>
      </View>
      <View style={{ gap: 9 }}>
        {checks.map((check) => {
          const color =
            check.level === "pass"
              ? palette.success
              : check.level === "warn"
                ? palette.warning
                : palette.danger;
          return (
            <View key={check.label} style={[s.row, { gap: spacing.sm, alignItems: "flex-start" }]}>
              <View
                style={{
                  width: 17,
                  height: 17,
                  borderRadius: 9,
                  backgroundColor: check.level === "pass" ? color : "transparent",
                  borderWidth: check.level === "pass" ? 0 : 1.5,
                  borderColor: color,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.monoBold,
                    fontSize: 10,
                    lineHeight: 12,
                    color: check.level === "pass" ? palette.console : color,
                  }}
                >
                  {check.level === "pass" ? "✓" : check.level === "warn" ? "!" : "×"}
                </Text>
              </View>
              <Text style={{ ...type.bodyXs, color: palette.textSecondary, flex: 1 }}>
                <Text style={{ fontFamily: fonts.semibold, color: palette.text }}>{check.label}: </Text>
                {check.detail}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CustomScheduleSheet({
  visible,
  value,
  onChange,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const selected = new Date(value);
  const dates = Array.from({ length: 30 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const times = Array.from({ length: 36 }, (_, index) => 6 * 60 + index * 30);
  const tooSoon = selected.getTime() < Date.now() + 5 * 60 * 1000;

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: palette.sheet,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            paddingTop: spacing.lg,
            paddingHorizontal: spacing.screenX,
            paddingBottom: 34,
            gap: spacing.lg,
          }}
        >
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <View>
              <Text style={s.sectionLabel}>Custom slot</Text>
              <Text style={{ ...type.displayTitle, color: palette.text, marginTop: 4 }}>
                {formatSchedule(value)}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ ...type.monoNav, color: palette.textMono }}>Close</Text>
            </Pressable>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={s.sectionLabel}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={[s.row, { gap: spacing.sm }]}>
                {dates.map((date) => {
                  const active = sameDay(date, selected);
                  return (
                    <Pressable
                      key={date.toISOString()}
                      onPress={() => {
                        date.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                        onChange(date.toISOString());
                      }}
                      style={{
                        minWidth: 66,
                        alignItems: "center",
                        paddingVertical: 9,
                        borderRadius: radius.pill,
                        backgroundColor: active ? palette.signal : palette.strip,
                        borderWidth: 1,
                        borderColor: active ? palette.signal : palette.borderStrong,
                      }}
                    >
                      <Text
                        style={{
                          ...type.monoMeta,
                          color: active ? palette.console : palette.textSecondary,
                        }}
                      >
                        {date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={s.sectionLabel}>Time</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={[s.row, { gap: spacing.sm }]}>
                {times.map((minutes) => {
                  const hour = Math.floor(minutes / 60);
                  const minute = minutes % 60;
                  const active = selected.getHours() === hour && selected.getMinutes() === minute;
                  const label = new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  return (
                    <Pressable
                      key={minutes}
                      onPress={() => {
                        const next = new Date(selected);
                        next.setHours(hour, minute, 0, 0);
                        onChange(next.toISOString());
                      }}
                      style={{
                        minWidth: 72,
                        alignItems: "center",
                        paddingVertical: 9,
                        borderRadius: radius.pill,
                        backgroundColor: active ? palette.signal : palette.strip,
                        borderWidth: 1,
                        borderColor: active ? palette.signal : palette.borderStrong,
                      }}
                    >
                      <Text
                        style={{
                          ...type.monoMeta,
                          color: active ? palette.console : palette.textSecondary,
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {tooSoon && (
            <Text style={s.errorText}>Choose a time at least five minutes from now.</Text>
          )}
          <Pressable
            onPress={onConfirm}
            disabled={tooSoon}
            style={[s.buttonPrimary, tooSoon && s.buttonDisabled]}
          >
            <Text style={s.buttonPrimaryText}>Set this time</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// --------------------------------------------------- transmit + success

const BURST = sizes.burstPayoff; // 300
const NODE = sizes.burstNode; // 58
const RING_R = 112;

function nodePositions(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const a = ((-90 + i * (360 / count)) * Math.PI) / 180;
    return {
      x: BURST / 2 + RING_R * Math.cos(a),
      y: BURST / 2 + RING_R * Math.sin(a),
    };
  });
}

function RadialBackdrop({ inner }: { inner: string }) {
  return (
    <Svg style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <Defs>
        <RadialGradient id="bg" cx="50%" cy="40%" r="65%">
          <Stop offset="0%" stopColor={inner} />
          <Stop offset="100%" stopColor={palette.console} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg)" />
    </Svg>
  );
}

// 09a — dashed beams pulse toward spinner nodes while the upload runs.
function TransmitScreen({
  platforms,
  scheduled,
  launchDrop,
}: {
  platforms: Platform[];
  scheduled: boolean;
  launchDrop: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const beam = useRef(new Animated.Value(0.25)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      beam.setValue(1);
      sweep.setValue(0.6);
      return;
    }
    const beamLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(beam, {
          toValue: 1,
          duration: motion.beamFast / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(beam, {
          toValue: 0.25,
          duration: motion.beamFast / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    const sweepLoop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      })
    );
    beamLoop.start();
    sweepLoop.start();
    return () => {
      beamLoop.stop();
      sweepLoop.stop();
    };
  }, [reducedMotion, beam, sweep]);

  const nodes = nodePositions(platforms.length);
  const AnimatedLine = Animated.createAnimatedComponent(Line);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.console }}>
      <RadialBackdrop inner={palette.radialTransmit} />
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 40,
        }}
      >
        <View style={{ width: BURST, height: BURST }}>
          <Svg width={BURST} height={BURST} style={{ position: "absolute" }}>
            {nodes.map((n, i) => (
              <AnimatedLine
                key={i}
                x1={BURST / 2}
                y1={BURST / 2}
                x2={n.x}
                y2={n.y}
                stroke={platformHue[platforms[i]!]}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray="4 7"
                strokeOpacity={beam}
              />
            ))}
          </Svg>
          {nodes.map((n, i) => (
            <View
              key={platforms[i]}
              style={{
                position: "absolute",
                left: n.x - NODE / 2,
                top: n.y - NODE / 2,
                width: NODE,
                height: NODE,
                borderRadius: 18,
                backgroundColor: platformHue[platforms[i]!],
                opacity: 0.55,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SpinnerDark />
            </View>
          ))}
          {/* source puck */}
          <View
            style={{
              position: "absolute",
              left: BURST / 2 - 38,
              top: BURST / 2 - 38,
              width: 76,
              height: 76,
              borderRadius: 22,
              overflow: "hidden",
            }}
          >
            <Stripes
              colorA={palette.stripeHubA}
              colorB={palette.stripeHubB}
              spacing={14}
              style={{ flex: 1 }}
            />
          </View>
        </View>
        <Text
          style={{
            ...type.mono,
            color: palette.textMono,
            letterSpacing: tracking(monoTracking.overline, type.mono.fontSize),
            marginTop: 36,
          }}
        >
          {launchDrop ? "LOCKING LAUNCH DROP" : scheduled ? "RESERVING YOUR SLOT" : "TRANSMITTING"}
        </Text>
        <Text style={{ ...type.displayLg, color: palette.text, marginTop: 10 }}>
          {launchDrop
            ? `Synchronizing ${platforms.length} channels…`
            : scheduled
              ? `Scheduling for ${platforms.length}…`
              : `Going out to ${platforms.length}…`}
        </Text>
        <View
          style={{
            width: 220,
            height: 5,
            borderRadius: radius.bar,
            backgroundColor: palette.barTrack,
            overflow: "hidden",
            marginTop: 22,
          }}
        >
          <Animated.View
            style={{
              width: 90,
              height: "100%",
              transform: [
                {
                  translateX: sweep.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-90, 220],
                  }),
                },
              ],
            }}
          >
            <LinearGradient
              colors={[spectrumOrder[0], spectrumOrder[1], spectrumOrder[2]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>
        <Text style={{ ...type.mono, color: palette.textLabel, marginTop: 12 }}>
          {launchDrop
            ? "one moment, every channel…"
            : scheduled
              ? "locking in every channel…"
              : "confirming with each channel…"}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function SpinnerDark() {
  return <SpinnerCore />;
}

function SpinnerCore() {
  const reducedMotion = useReducedMotion();
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: motion.spin,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, rotation]);
  return (
    <Animated.View
      style={{
        width: 18,
        height: 18,
        transform: [
          {
            rotate: rotation.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", "360deg"],
            }),
          },
        ],
      }}
    >
      <Svg width={18} height={18} viewBox="0 0 18 18">
        <Circle
          cx={9}
          cy={9}
          r={6.5}
          fill="none"
          stroke={palette.spinTrackDark}
          strokeWidth={2.5}
        />
        <Path
          d="M9 2.5a6.5 6.5 0 0 1 6.5 6.5"
          fill="none"
          stroke={palette.console}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

// 09b — the payoff. Solid beams, monogram nodes with checks (or failure
// marks), the glowing source puck, "Live on N."
function SuccessScreen({
  post,
  elapsedMs,
  onViewPosts,
  onPostAnother,
}: {
  post: PostRecord;
  elapsedMs: number;
  onViewPosts: () => void;
  onPostAnother: () => void;
}) {
  const results = post.results;
  const nodes = nodePositions(results.length);
  const okCount = results.filter((r) => r.success).length;
  const anyPending = results.some((r) => r.pending);
  const scheduled = Boolean(
    post.scheduledAt && new Date(post.scheduledAt).getTime() > Date.now()
  );
  const scheduledCount = results.filter((r) => r.pending || r.success).length;
  const scheduledFailures = scheduled ? results.length - scheduledCount : 0;
  const launchDrop = scheduled && Boolean(post.launchDrop);
  const allOk = okCount === results.length;
  const seconds = (elapsedMs / 1000).toFixed(1);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.console }}>
      <RadialBackdrop inner={palette.radialSuccess} />
      <View
        style={{
          flex: 1,
          alignItems: "center",
          paddingHorizontal: 34,
          paddingBottom: 34,
        }}
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: BURST, height: BURST }}>
            {/* spectrum ring (conic-gradient approximation) */}
            <Svg
              width={BURST}
              height={BURST}
              style={{ position: "absolute", opacity: 0.14 }}
            >
              {results.map((r, i) => {
                const circumference = 2 * Math.PI * (RING_R + 24);
                const seg = circumference / results.length;
                return (
                  <Circle
                    key={r.platform}
                    cx={BURST / 2}
                    cy={BURST / 2}
                    r={RING_R + 24}
                    fill="none"
                    stroke={platformHue[r.platform]}
                    strokeWidth={16}
                    strokeDasharray={`${seg} ${circumference - seg}`}
                    strokeDashoffset={-i * seg + circumference / 4}
                  />
                );
              })}
            </Svg>
            <Svg width={BURST} height={BURST} style={{ position: "absolute" }}>
              {nodes.map((n, i) => (
                <Line
                  key={i}
                  x1={BURST / 2}
                  y1={BURST / 2}
                  x2={n.x}
                  y2={n.y}
                  stroke={
                    results[i]!.success || scheduled
                      ? platformHue[results[i]!.platform]
                      : palette.danger
                  }
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeOpacity={results[i]!.success || scheduled ? 1 : 0.5}
                />
              ))}
            </Svg>
            {nodes.map((n, i) => {
              const r = results[i]!;
              const ok = r.success;
              const pending = !ok && Boolean(r.pending);
              const statusColor = ok
                ? palette.console
                : pending
                  ? palette.warning
                  : palette.danger;
              const hue = platformHue[r.platform];
              return (
                <View
                  key={r.platform}
                  style={[
                    {
                      position: "absolute",
                      left: n.x - NODE / 2,
                      top: n.y - NODE / 2,
                      width: NODE,
                      height: NODE,
                      borderRadius: 18,
                      backgroundColor: ok ? hue : palette.console,
                      borderWidth: ok ? 0 : 1.5,
                      borderColor: pending ? palette.warning : palette.danger,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                    ok && {
                      shadowColor: hue,
                      shadowOpacity: 0.9,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 8,
                    },
                  ]}
                >
                  <PlatformGlyph platform={r.platform} size={15} color={statusColor} />
                  <Svg width={14} height={14} viewBox="0 0 24 24" style={{ marginTop: 2 }}>
                    {ok ? (
                      <Path
                        d="M5 13l4 4L19 7"
                        stroke={palette.console}
                        strokeWidth={3.5}
                        fill="none"
                      />
                    ) : pending ? (
                      <>
                        <Circle cx={5} cy={12} r={2} fill={palette.warning} />
                        <Circle cx={12} cy={12} r={2} fill={palette.warning} />
                        <Circle cx={19} cy={12} r={2} fill={palette.warning} />
                      </>
                    ) : (
                      <Path
                        d="M6 6l12 12M18 6L6 18"
                        stroke={palette.danger}
                        strokeWidth={3.5}
                        fill="none"
                      />
                    )}
                  </Svg>
                </View>
              );
            })}
            {/* source puck */}
            <View
              style={[
                {
                  position: "absolute",
                  left: BURST / 2 - 41,
                  top: BURST / 2 - 41,
                  width: 82,
                  height: 82,
                  borderRadius: 24,
                  overflow: "hidden",
                  alignItems: "center",
                  justifyContent: "center",
                },
                {
                  shadowColor: palette.signal,
                  shadowOpacity: 0.55,
                  shadowRadius: 25,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 10,
                },
              ]}
            >
              <Stripes
                colorA={palette.signal}
                colorB={palette.signalDim}
                spacing={12}
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              />
              <Svg width={26} height={26} viewBox="0 0 24 24">
                <Path
                  d="M5 13l4 4L19 7"
                  stroke={palette.console}
                  strokeWidth={3}
                  fill="none"
                />
              </Svg>
            </View>
          </View>
        </View>

        <Text
          style={{
            ...type.mono,
            color: scheduled ? palette.signal : anyPending || !allOk ? palette.warning : palette.success,
            letterSpacing: tracking(monoTracking.overline, type.mono.fontSize),
          }}
        >
          {scheduled
            ? scheduledFailures > 0
              ? "PARTIALLY SCHEDULED"
              : launchDrop
                ? "LAUNCH DROP LOCKED"
                : "SCHEDULED"
            : anyPending
            ? "PUBLISHING…"
            : allOk
              ? `LIVE IN ${seconds}S`
              : `${okCount} OF ${results.length} LIVE`}
        </Text>
        <Text
          style={{
            ...type.displayHero,
            color: palette.text,
            marginTop: 10,
            letterSpacing: tracking(-0.01, type.displayHero.fontSize),
          }}
        >
          {scheduled
            ? scheduledFailures > 0
              ? `${scheduledCount} of ${results.length} scheduled.`
              : launchDrop
                ? `${results.length} channels. One moment.`
                : formatSchedule(post.scheduledAt!)
            : anyPending
            ? `Publishing to ${results.length}…`
            : allOk
              ? `Live on ${okCount}.`
              : `Live on ${okCount} of ${results.length}.`}
        </Text>
        <Text
          style={{
            ...type.body,
            color: palette.textSecondary,
            textAlign: "center",
            marginTop: 12,
            maxWidth: 300,
          }}
        >
          {scheduled
            ? scheduledFailures > 0
              ? `Some channels could not accept the schedule. Review the details in History; the other ${scheduledCount} will still go out at ${formatSchedule(post.scheduledAt!)}.`
              : launchDrop
                ? `Your coordinated release is locked for ${formatSchedule(post.scheduledAt!)}. You can cancel the entire drop from History.`
                : `Everything is queued for ${results.length} channel${results.length === 1 ? "" : "s"}. You can cancel it from History before it goes live.`
            : anyPending
            ? "Still publishing on some channels — this can take a minute for video. Check History for the final status."
            : allOk
              ? "Your post is out on every channel you picked."
              : "The rest went out fine — retry the failed channel from History."}
        </Text>
        <View style={[s.row, { gap: spacing.md, alignSelf: "stretch", marginTop: 26 }]}>
          <Pressable style={[s.buttonSecondary, { flex: 1 }]} onPress={onViewPosts}>
            <Text style={s.buttonSecondaryText}>{scheduled ? "View schedule" : "View posts"}</Text>
          </Pressable>
          <Pressable style={[s.buttonPrimary, { flex: 1 }]} onPress={onPostAnother}>
            <Text style={{ ...type.buttonHero, fontSize: 16, color: palette.console }}>
              {scheduled ? "Schedule another" : "Post another"}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
