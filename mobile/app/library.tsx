import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform as NativePlatform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchConnections } from "../src/api/beamloop";
import {
  PLATFORM_LABELS,
  isComingSoon,
  type Platform,
} from "../src/api/types";
import { useAuth } from "../src/auth/AuthContext";
import {
  deleteChannelGroup,
  listChannelGroups,
  saveChannelGroup,
  updateChannelGroup,
  type ChannelGroup,
} from "../src/channelGroups";
import { PlatformGlyph } from "../src/components/PlatformGlyph";
import {
  deleteIdea,
  listIdeas,
  saveIdea,
  updateIdea,
  type ContentIdea,
} from "../src/ideas";
import {
  fonts,
  palette,
  platformHue,
  radius,
  sharedStyles as s,
  spacing,
  type,
} from "../src/theme";

type Section = "ideas" | "collections";

export default function LibraryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [section, setSection] = useState<Section>("ideas");
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [collections, setCollections] = useState<ChannelGroup[]>([]);
  const [connected, setConnected] = useState<Platform[]>([]);
  const [ideaText, setIdeaText] = useState("");
  const [editingIdea, setEditingIdea] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [collectionPlatforms, setCollectionPlatforms] = useState<Set<Platform>>(
    new Set()
  );
  const [editingCollection, setEditingCollection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLocal = useCallback(() => {
    if (!user) return;
    setIdeas(listIdeas(user.id));
    setCollections(listChannelGroups(user.id));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadLocal();
      void fetchConnections()
        .then((items) =>
          setConnected(
            items
              .filter((item) => item.connected && !isComingSoon(item.platform))
              .map((item) => item.platform)
          )
        )
        .catch((e) =>
          setError(e instanceof Error ? e.message : "Couldn't load your channels")
        );
    }, [loadLocal])
  );

  const resetIdeaForm = () => {
    setIdeaText("");
    setEditingIdea(null);
  };

  const submitIdea = () => {
    if (!user) return;
    try {
      if (editingIdea) updateIdea(user.id, editingIdea, ideaText);
      else saveIdea(user.id, ideaText);
      resetIdeaForm();
      loadLocal();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that idea");
    }
  };

  const resetCollectionForm = () => {
    setCollectionName("");
    setCollectionPlatforms(new Set());
    setEditingCollection(null);
  };

  const submitCollection = () => {
    if (!user) return;
    try {
      const platforms = [...collectionPlatforms];
      if (editingCollection) {
        updateChannelGroup(
          user.id,
          editingCollection,
          collectionName,
          platforms
        );
      } else {
        saveChannelGroup(user.id, collectionName, platforms);
      }
      resetCollectionForm();
      loadLocal();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that collection");
    }
  };

  const confirmIdeaDelete = (idea: ContentIdea) =>
    Alert.alert("Delete idea?", "This removes it from your BeamLoop Library.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (!user) return;
          deleteIdea(user.id, idea.id);
          if (editingIdea === idea.id) resetIdeaForm();
          loadLocal();
        },
      },
    ]);

  const confirmCollectionDelete = (collection: ChannelGroup) =>
    Alert.alert(
      "Delete collection?",
      "The connected accounts stay connected; only this shortcut is removed.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (!user) return;
            deleteChannelGroup(user.id, collection.id);
            if (editingCollection === collection.id) resetCollectionForm();
            loadLocal();
          },
        },
      ]
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.console }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={NativePlatform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            paddingHorizontal: spacing.screenX,
            paddingTop: spacing.sm,
            paddingBottom: spacing.lg,
          }}
        >
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={{ ...type.monoNav, color: palette.textMono }}>‹ BACK</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/compose")} hitSlop={10}>
              <Text style={{ ...type.monoNav, color: palette.signal }}>NEW POST +</Text>
            </Pressable>
          </View>
          <Text
            style={{
              ...type.displayLg,
              color: palette.text,
              marginTop: spacing.lg,
            }}
          >
            Library
          </Text>
          <Text style={{ ...type.bodySm, color: palette.textSecondary, marginTop: 5 }}>
            Keep the ingredients you reuse. Pull them into a post in one tap.
          </Text>

          <View style={[s.row, { gap: spacing.sm, marginTop: spacing.lg }]}>
            <Stat label="IDEAS" value={ideas.length} />
            <Stat label="COLLECTIONS" value={collections.length} />
            <Stat label="LIVE CHANNELS" value={connected.length} />
          </View>

          <View
            style={{
              flexDirection: "row",
              backgroundColor: palette.sheet,
              borderRadius: radius.cell,
              padding: 4,
              marginTop: spacing.lg,
              borderWidth: 1,
              borderColor: palette.borderFaint,
            }}
          >
            <SectionButton
              label="IDEAS"
              active={section === "ideas"}
              onPress={() => setSection("ideas")}
            />
            <SectionButton
              label="CHANNEL COLLECTIONS"
              active={section === "collections"}
              onPress={() => setSection("collections")}
            />
          </View>
        </View>

        {error && (
          <Text style={[s.errorText, { paddingHorizontal: spacing.screenX }]}>
            {error}
          </Text>
        )}

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: spacing.screenX,
            paddingTop: spacing.sm,
            paddingBottom: spacing.xxl,
            gap: spacing.md,
          }}
        >
          {section === "ideas" ? (
            <>
              <View style={cardStyle}>
                <Text style={s.sectionLabel}>
                  {editingIdea ? "EDIT IDEA" : "CAPTURE AN IDEA"}
                </Text>
                <TextInput
                  value={ideaText}
                  onChangeText={setIdeaText}
                  multiline
                  maxLength={2200}
                  placeholder="A hook, a caption, a launch thought…"
                  placeholderTextColor={palette.textLabel}
                  style={[
                    s.input,
                    {
                      minHeight: 94,
                      paddingTop: spacing.md,
                      textAlignVertical: "top",
                    },
                  ]}
                />
                <View style={[s.row, { gap: spacing.sm }]}>
                  {editingIdea && (
                    <Pressable onPress={resetIdeaForm} style={[s.buttonSecondary, { flex: 1 }]}>
                      <Text style={s.buttonSecondaryText}>Cancel</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={submitIdea}
                    disabled={!ideaText.trim()}
                    style={[
                      s.buttonPrimary,
                      { flex: 1 },
                      !ideaText.trim() && s.buttonDisabled,
                    ]}
                  >
                    <Text style={s.buttonPrimaryText}>
                      {editingIdea ? "Save changes" : "Save idea"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {ideas.length === 0 ? (
                <EmptyState text="Your saved ideas will live here, ready for the next post." />
              ) : (
                ideas.map((idea) => (
                  <View key={idea.id} style={cardStyle}>
                    <Text style={{ ...type.bodySm, color: palette.text }}>{idea.text}</Text>
                    <Text style={{ ...type.monoMeta, color: palette.textLabel }}>
                      {new Date(idea.updatedAt ?? idea.createdAt)
                        .toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                        .toUpperCase()}
                    </Text>
                    <View style={[s.row, { justifyContent: "space-between" }]}>
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: "/compose",
                            params: { idea: idea.text },
                          })
                        }
                      >
                        <Text style={{ ...type.monoMeta, color: palette.signal }}>
                          USE IN POST ›
                        </Text>
                      </Pressable>
                      <View style={[s.row, { gap: spacing.lg }]}>
                        <Pressable
                          onPress={() => {
                            setEditingIdea(idea.id);
                            setIdeaText(idea.text);
                          }}
                        >
                          <Text style={{ ...type.monoMeta, color: palette.textMono }}>EDIT</Text>
                        </Pressable>
                        <Pressable onPress={() => confirmIdeaDelete(idea)}>
                          <Text style={{ ...type.monoMeta, color: palette.danger }}>DELETE</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </>
          ) : (
            <>
              <View style={cardStyle}>
                <Text style={s.sectionLabel}>
                  {editingCollection ? "EDIT COLLECTION" : "NEW COLLECTION"}
                </Text>
                <Text style={{ ...type.bodyXs, color: palette.textSecondary }}>
                  Save a channel combination you publish to often.
                </Text>
                <TextInput
                  value={collectionName}
                  onChangeText={setCollectionName}
                  maxLength={28}
                  placeholder="Launch team, Client A, Communities…"
                  placeholderTextColor={palette.textLabel}
                  style={s.input}
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {connected.map((platform) => {
                    const active = collectionPlatforms.has(platform);
                    return (
                      <Pressable
                        key={platform}
                        onPress={() =>
                          setCollectionPlatforms((current) => {
                            const next = new Set(current);
                            if (next.has(platform)) next.delete(platform);
                            else next.add(platform);
                            return next;
                          })
                        }
                        style={[
                          s.row,
                          {
                            gap: 6,
                            paddingHorizontal: spacing.md,
                            paddingVertical: 9,
                            borderRadius: radius.pill,
                            borderWidth: 1,
                            borderColor: active
                              ? platformHue[platform]
                              : palette.borderStrong,
                            backgroundColor: active
                              ? palette.barTrack
                              : palette.console,
                          },
                        ]}
                      >
                        <PlatformGlyph
                          platform={platform}
                          size={14}
                          color={active ? platformHue[platform] : palette.textLabel}
                        />
                        <Text
                          style={{
                            ...type.monoMeta,
                            color: active ? palette.text : palette.textSecondary,
                          }}
                        >
                          {PLATFORM_LABELS[platform]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {connected.length === 0 && (
                  <Pressable onPress={() => router.push("/(tabs)/connections")}>
                    <Text style={{ ...type.bodyXs, color: palette.warning }}>
                      Connect a channel before making a collection ›
                    </Text>
                  </Pressable>
                )}
                <View style={[s.row, { gap: spacing.sm }]}>
                  {editingCollection && (
                    <Pressable
                      onPress={resetCollectionForm}
                      style={[s.buttonSecondary, { flex: 1 }]}
                    >
                      <Text style={s.buttonSecondaryText}>Cancel</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={submitCollection}
                    disabled={!collectionName.trim() || collectionPlatforms.size === 0}
                    style={[
                      s.buttonPrimary,
                      { flex: 1 },
                      (!collectionName.trim() || collectionPlatforms.size === 0) &&
                        s.buttonDisabled,
                    ]}
                  >
                    <Text style={s.buttonPrimaryText}>
                      {editingCollection ? "Save changes" : "Save collection"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {collections.length === 0 ? (
                <EmptyState text="Collections make repeat posting faster: one tap selects the whole channel set." />
              ) : (
                collections.map((collection) => (
                  <View key={collection.id} style={cardStyle}>
                    <View style={[s.row, { justifyContent: "space-between", gap: spacing.md }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...type.itemTitle, color: palette.text }}>
                          {collection.name}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={{ ...type.monoMeta, color: palette.textLabel, marginTop: 3 }}
                        >
                          {collection.platforms
                            .map((platform) => PLATFORM_LABELS[platform])
                            .join(" · ")}
                        </Text>
                      </View>
                      <View style={[s.row, { gap: 5 }]}>
                        {collection.platforms.slice(0, 4).map((platform) => (
                          <PlatformGlyph
                            key={platform}
                            platform={platform}
                            size={15}
                            color={platformHue[platform]}
                          />
                        ))}
                      </View>
                    </View>
                    <View style={[s.row, { justifyContent: "space-between" }]}>
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: "/compose",
                            params: { platforms: collection.platforms.join(",") },
                          })
                        }
                      >
                        <Text style={{ ...type.monoMeta, color: palette.signal }}>
                          START WITH COLLECTION ›
                        </Text>
                      </Pressable>
                      <View style={[s.row, { gap: spacing.lg }]}>
                        <Pressable
                          onPress={() => {
                            setEditingCollection(collection.id);
                            setCollectionName(collection.name);
                            setCollectionPlatforms(new Set(collection.platforms));
                          }}
                        >
                          <Text style={{ ...type.monoMeta, color: palette.textMono }}>EDIT</Text>
                        </Pressable>
                        <Pressable onPress={() => confirmCollectionDelete(collection)}>
                          <Text style={{ ...type.monoMeta, color: palette.danger }}>DELETE</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const cardStyle = {
  backgroundColor: palette.strip,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.borderFaint,
  padding: spacing.lg,
  gap: spacing.md,
} as const;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View
      style={{
        flex: 1,
        minHeight: 64,
        backgroundColor: palette.strip,
        borderRadius: radius.input,
        borderWidth: 1,
        borderColor: palette.borderFaint,
        padding: spacing.sm,
        justifyContent: "space-between",
      }}
    >
      <Text style={{ ...type.displayStat, color: palette.text }}>{value}</Text>
      <Text style={{ ...type.monoMicro, color: palette.textLabel }}>{label}</Text>
    </View>
  );
}

function SectionButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 38,
        borderRadius: radius.chip,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? palette.signal : "transparent",
        paddingHorizontal: spacing.sm,
      }}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          ...type.monoMeta,
          fontFamily: active ? fonts.monoBold : fonts.mono,
          color: active ? palette.console : palette.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
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
        {text}
      </Text>
    </View>
  );
}
