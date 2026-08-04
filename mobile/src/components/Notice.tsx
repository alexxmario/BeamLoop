import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  monoTracking,
  palette,
  radius,
  sharedStyles as s,
  sizes,
  spacing,
  tracking,
  type,
} from "../theme";

/**
 * The one place BeamLoop reports a failure.
 *
 * Errors used to render as a line of red text wherever the screen had room —
 * usually below the fold, so the thing that just went wrong was the thing you
 * couldn't see. A notice interrupts instead: it names what failed, and it stays
 * until dismissed.
 *
 * Reserved for outcomes the user didn't get. Live validation that sits beside
 * the control it describes (a caption over its limit, a schedule in the past)
 * belongs inline, on the control — not here.
 */

export type NoticeTone = "error" | "info";

export interface NoticeAction {
  label: string;
  onPress: () => void;
}

export interface NoticeOptions {
  title?: string;
  tone?: NoticeTone;
  // An optional way out of the failure — "See plans" on a plan limit, say.
  // Dismisses the notice before running.
  action?: NoticeAction;
}

interface Notice extends Required<Pick<NoticeOptions, "title" | "tone">> {
  message: string;
  action?: NoticeAction;
}

type ShowNotice = (message: string, options?: NoticeOptions) => void;

const NoticeContext = createContext<ShowNotice>(() => {});

/** Show a notice. Safe to call from anywhere under the provider. */
export function useNotice(): ShowNotice {
  return useContext(NoticeContext);
}

const DEFAULT_TITLE: Record<NoticeTone, string> = {
  error: "That didn't work",
  info: "Heads up",
};

const OVERLINE: Record<NoticeTone, string> = {
  error: "Error",
  info: "Notice",
};

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const reducedMotion = useReducedMotion();

  const show = useCallback<ShowNotice>((message, options) => {
    const trimmed = message?.trim();
    if (!trimmed) return;
    const tone = options?.tone ?? "error";
    setNotice({
      message: trimmed,
      tone,
      title: options?.title ?? DEFAULT_TITLE[tone],
      ...(options?.action ? { action: options.action } : {}),
    });
  }, []);

  const dismiss = useCallback(() => setNotice(null), []);

  const runAction = useCallback(() => {
    const action = notice?.action;
    setNotice(null);
    action?.onPress();
  }, [notice]);

  // The provider value must not change identity on every notice, or every
  // consumer re-renders each time one is shown.
  const value = useMemo(() => show, [show]);

  const accent = notice?.tone === "info" ? palette.warning : palette.danger;

  return (
    <NoticeContext.Provider value={value}>
      {children}
      <Modal
        visible={notice !== null}
        transparent
        animationType={reducedMotion ? "none" : "fade"}
        onRequestClose={dismiss}
        statusBarTranslucent
      >
        <Pressable
          onPress={dismiss}
          style={{
            flex: 1,
            backgroundColor: palette.scrim,
            alignItems: "center",
            justifyContent: "center",
            padding: spacing.xxl,
          }}
        >
          {/* Swallow taps on the card itself so only the scrim dismisses. */}
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: palette.strip,
              borderRadius: radius.cardLg,
              borderWidth: 1,
              borderColor:
                notice?.tone === "info"
                  ? palette.borderHair
                  : palette.dangerBorderSoft,
              padding: spacing.xxl,
              gap: spacing.md,
            }}
          >
            <View style={[s.row, { gap: spacing.sm }]}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: radius.bar,
                  backgroundColor: accent,
                }}
              />
              <Text
                style={{
                  ...type.monoMeta,
                  color: accent,
                  letterSpacing: tracking(
                    monoTracking.overline,
                    type.monoMeta.fontSize
                  ),
                  textTransform: "uppercase",
                }}
              >
                {OVERLINE[notice?.tone ?? "error"]}
              </Text>
            </View>

            <Text style={{ ...type.displayNav, color: palette.text }}>
              {notice?.title}
            </Text>
            <Text style={{ ...type.bodySm, color: palette.textSecondary }}>
              {notice?.message}
            </Text>

            <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              {notice?.action && (
                <Pressable onPress={runAction} style={s.buttonPrimary}>
                  <Text style={s.buttonPrimaryText}>{notice.action.label}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={dismiss}
                style={
                  notice?.action
                    ? [s.buttonSecondary, { height: sizes.btnSm }]
                    : s.buttonPrimary
                }
              >
                <Text
                  style={
                    notice?.action ? s.buttonSecondaryText : s.buttonPrimaryText
                  }
                >
                  {notice?.action ? "Not now" : "Got it"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </NoticeContext.Provider>
  );
}
