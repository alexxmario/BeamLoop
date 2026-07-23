import { StyleSheet } from "react-native";
import type { Platform } from "./api/types";

/**
 * BeamLoop design system — single source of truth.
 *
 * Every value here is extracted verbatim from the imported design file
 * (Beamloop.dc.html, "Creator Publishing Console"). No screen may hardcode
 * colors, font sizes, radii, or spacing — import from this file only.
 *
 * Design language: dark-first, spectrum-coded, reduced-motion aware.
 * Signature motif: content as a bright SOURCE fanning out to six channels
 * (see src/components/BeamBurst.tsx).
 */

// ---------------------------------------------------------------- palette

export const palette = {
  // Surfaces (design legend: CONSOLE / STRIP / SIGNAL)
  page: "#05080C", // page behind everything
  console: "#0C121A", // primary screen background
  strip: "#161F2B", // cards, rows, inputs
  sheet: "#12191F", // bottom sheets, segmented tracks, queue cards
  editorBg: "#080D12", // editor chrome background
  canvas: "#050809", // editor canvas well
  signal: "#E8ECF1", // off-white: primary buttons, active states, hub
  signalDim: "#D4DBE3", // signal's darker stripe partner

  // Text
  text: "#E8ECF1",
  textSecondary: "#9AA7B8",
  textMono: "#7C8BA0", // mono metadata
  textLabel: "#5E6C7E", // section labels, inactive tabs
  textFaint: "#3E4A59", // out-of-scope calendar days

  // Tracks & stripes
  dotTrack: "#33404F", // inactive page dots, sheet grabber
  barTrack: "#1C2836", // progress bar track
  stripeA: "#1C2836", // media-placeholder diagonal stripes
  stripeB: "#212F3F",
  stripeDarkA: "#141D27", // video preview stripes
  stripeDarkB: "#182430",
  stripeHubA: "#243141", // transmit hub puck stripes
  stripeHubB: "#2B3A4C",

  // Borders (white at fixed alphas — the design uses nothing else)
  border: "rgba(255,255,255,0.07)",
  borderFaint: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.08)",
  borderHair: "rgba(255,255,255,0.10)",
  borderButton: "rgba(255,255,255,0.16)",
  borderDashed: "rgba(255,255,255,0.18)",
  gridLine: "rgba(255,255,255,0.40)", // crop thirds grid

  // States
  success: "#3FB971",
  warning: "#E0A63A", // "OPENING…" spinners
  danger: "#F2545B", // failed posts (≠ YouTube coral #F26D5B)
  dangerBgSoft: "rgba(242,84,91,0.08)",
  dangerBg: "rgba(242,84,91,0.12)",
  dangerBorderSoft: "rgba(242,84,91,0.28)",
  dangerBorder: "rgba(242,84,91,0.35)",
  successBg: "rgba(63,185,113,0.10)",
  successBorder: "rgba(63,185,113,0.30)",

  // Inline links / accents ("+ Customize", hashtags) — the design reuses
  // the Facebook hue for these.
  link: "#5B8DF0",

  // Radial backdrops (transmit / success payoff screens)
  radialTransmit: "#12202B",
  radialSuccess: "#14232F",

  // Spinner tracks
  spinTrackLight: "rgba(255,255,255,0.15)", // on dark surfaces
  spinTrackDark: "rgba(12,18,26,0.3)", // on hue tiles

  // Overlays
  scrim: "rgba(5,8,12,0.55)", // behind bottom sheets
  badgeScrim: "rgba(0,0,0,0.55)", // AR badges on media
  tabBar: "rgba(12,18,26,0.94)", // blurred tab bar tint
} as const;

// SIGNAL SPECTRUM — one hue per channel (design legend order).
export const spectrum = {
  tiktok: "#2FB6C9",
  instagram: "#C06CE0",
  youtube: "#F26D5B",
  facebook: "#5B8DF0",
  x: "#E0A63A",
  threads: "#3FB971",
} as const;

// NOT in the imported design (it only covers the six OAuth channels).
// Extrapolated to keep "one hue per channel" intact — flagged for review.
export const spectrumExtended = {
  discord: "#7E6BF2",
  telegram: "#4AA3E8",
} as const;

export const platformHue: Record<Platform, string> = {
  ...spectrum,
  ...spectrumExtended,
};

// Two-letter monograms used on tiles, pips, and burst nodes.
export const platformMono: Record<Platform, string> = {
  tiktok: "TT",
  instagram: "IG",
  youtube: "YT",
  facebook: "FB",
  x: "X",
  threads: "TH",
  discord: "DC",
  telegram: "TG",
};

// Spectrum in canonical order (gradients, dot rows, burst spokes).
export const spectrumOrder = [
  spectrum.tiktok,
  spectrum.instagram,
  spectrum.youtube,
  spectrum.facebook,
  spectrum.x,
  spectrum.threads,
] as const;

// ---------------------------------------------------------------- type

// Display = Archivo Expanded (static instance of the variable font at
// wdth 125 / wght 800 — RN has no font-stretch). Body = Archivo.
// Utility = JetBrains Mono, wide-tracked uppercase.
export const fonts = {
  display: "ArchivoExpanded-ExtraBold",
  regular: "Archivo_400Regular",
  semibold: "Archivo_600SemiBold",
  bold: "Archivo_700Bold",
  mono: "JetBrainsMono_500Medium",
  monoBold: "JetBrainsMono_700Bold",
} as const;

// letter-spacing in the design is em-based; RN wants points.
export const tracking = (em: number, fontSize: number) => em * fontSize;

// Type scale by role — sizes/line-heights lifted from the design frames.
export const type = {
  displayHero: { fontFamily: fonts.display, fontSize: 60, lineHeight: 54 }, // "Live on 6."
  displayXl: { fontFamily: fonts.display, fontSize: 40, lineHeight: 39 }, // onboarding
  displayLg: { fontFamily: fonts.display, fontSize: 32, lineHeight: 32 }, // transmit
  displayMd: { fontFamily: fonts.display, fontSize: 28, lineHeight: 28 }, // sheet titles
  displayTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 27 }, // screen titles
  displayNav: { fontFamily: fonts.display, fontSize: 20, lineHeight: 22 }, // modal nav titles
  displayStat: { fontFamily: fonts.display, fontSize: 22, lineHeight: 22 }, // calendar dates

  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyXs: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  itemTitle: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21 },
  itemTitleSm: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },

  button: { fontFamily: fonts.bold, fontSize: 17 },
  buttonHero: { fontFamily: fonts.display, fontSize: 19 },
  buttonSm: { fontFamily: fonts.semibold, fontSize: 14 },

  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
  monoNav: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 18 },
  monoMeta: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 14 },
  monoMicro: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 12 },
  monoTab: { fontFamily: fonts.mono, fontSize: 9, lineHeight: 11 },
} as const;

// Standard letter-spacing per mono role (em values from the design).
export const monoTracking = {
  label: 0.16, // section labels: 11px .14–.16em
  overline: 0.2, // overlines: .18–.24em
  status: 0.06, // LIVE / POSTED chips
  wide: 0.1,
} as const;

// ---------------------------------------------------------------- shape

export const radius = {
  phone: 46, // device frame (unused in-app)
  sheet: 28, // bottom sheet top corners
  cardLg: 18, // option rows, calendar card
  card: 16, // standard cards / rows / caption box
  cell: 14, // callouts, small cards, segmented track
  input: 12, // media thumbs, icon tiles
  tile: 11, // chips, aspect presets, small buttons, filter swatches
  chip: 10, // segmented active, speed chips
  badge: 8, // small monogram chips
  pip: 7, // history status pips
  slot: 6, // tiny badges
  btnHero: 18, // 60px transmit button
  btn: 15, // 54px primary buttons
  pill: 20, // filter pills
  bar: 3, // progress bars, page dots
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 26,
  screenX: 20, // list screens horizontal padding
  heroX: 30, // onboarding horizontal padding
  cardPad: 16,
  rowPad: 14,
} as const;

export const sizes = {
  btnHero: 60,
  btn: 54,
  btnSm: 38,
  tile: 46, // platform tile in connect rows
  tileSheet: 72, // platform tile on the OAuth sheet
  pip: 22, // history status pips
  fab: 64, // tab-bar transmit button
  tabBar: 88,
  burstHero: 230, // onboarding burst
  burstPayoff: 300, // transmit/success burst
  burstNode: 58, // success node squares
} as const;

// ---------------------------------------------------------------- effects

// The design's glows are CSS box-shadows; RN approximates with shadow props
// (iOS) + elevation (Android).
export const shadows = {
  heroButton: {
    shadowColor: palette.signal,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  fab: {
    shadowColor: palette.signal,
    shadowOpacity: 0.5,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  nodeGlow: (hue: string) => ({
    shadowColor: hue,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  }),
  hubGlow: {
    shadowColor: palette.signal,
    shadowOpacity: 0.55,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
} as const;

// Motion durations (from the design's keyframes). Every animation must be
// gated behind useReducedMotion() — the design disables all motion there.
export const motion = {
  beam: 2400, // bl-beam opacity .25→1 loop
  beamStagger: 200,
  beamFast: 1200, // transmit screen
  spin: 1000, // bl-spin
  pulse: 1600, // bl-pulse opacity .35→1
} as const;

// ------------------------------------------------------- shared styles

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.console,
    paddingHorizontal: spacing.screenX,
  },
  card: {
    backgroundColor: palette.strip,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.cardPad,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  // 54px signal-on-console primary button
  buttonPrimary: {
    height: sizes.btn,
    borderRadius: radius.btn,
    backgroundColor: palette.signal,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimaryText: {
    ...type.button,
    color: palette.console,
  },
  // 1.5px outlined secondary button
  buttonSecondary: {
    height: sizes.btn,
    borderRadius: radius.btn,
    borderWidth: 1.5,
    borderColor: palette.borderButton,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSecondaryText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: palette.text,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  sectionLabel: {
    ...type.monoMeta,
    color: palette.textLabel,
    letterSpacing: tracking(monoTracking.label, type.monoMeta.fontSize),
    textTransform: "uppercase",
  },
  overline: {
    ...type.mono,
    color: palette.textMono,
    letterSpacing: tracking(monoTracking.overline, type.mono.fontSize),
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: palette.strip,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.card,
    color: palette.text,
    paddingHorizontal: spacing.rowPad,
    paddingVertical: spacing.md,
    // No lineHeight here: on iOS a lineHeight taller than the font pushes
    // TextInput glyphs below the vertical center.
    fontFamily: type.bodySm.fontFamily,
    fontSize: type.bodySm.fontSize,
  },
  errorText: {
    ...type.bodyXs,
    color: palette.danger,
  },
});
