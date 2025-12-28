import { Image, ImageSourcePropType } from "react-native";

export const DEFAULT_EVENT_IMAGE =
  "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=400&q=80";

const RAW_COVER_OPTIONS = [
  {
    key: "cover_01",
    label: "Sunset Glow",
    source: require("@assets/covers/cover_01.png"),
  },
  {
    key: "cover_02",
    label: "Ocean Mist",
    source: require("@assets/covers/cover_02.png"),
  },
  {
    key: "cover_03",
    label: "Golden Hour",
    source: require("@assets/covers/cover_03.png"),
  },
  {
    key: "cover_04",
    label: "Indigo Nights",
    source: require("@assets/covers/cover_04.png"),
  },
  {
    key: "cover_05",
    label: "Violet Bloom",
    source: require("@assets/covers/cover_05.png"),
  },
  {
    key: "cover_06",
    label: "Neon Pulse",
    source: require("@assets/covers/cover_06.png"),
  },
  {
    key: "cover_07",
    label: "Forest Hike",
    source: require("@assets/covers/cover_07.png"),
  },
  {
    key: "cover_08",
    label: "Amber Trail",
    source: require("@assets/covers/cover_08.png"),
  },
  {
    key: "cover_09",
    label: "Steel City",
    source: require("@assets/covers/cover_09.png"),
  },
  {
    key: "cover_10",
    label: "Citrus Pop",
    source: require("@assets/covers/cover_10.png"),
  },
  {
    key: "cover_11",
    label: "Deep Dive",
    source: require("@assets/covers/cover_11.png"),
  },
  {
    key: "cover_12",
    label: "Magenta Bloom",
    source: require("@assets/covers/cover_12.png"),
  },
] as const;

type RawCoverOption = (typeof RAW_COVER_OPTIONS)[number];
export type CoverKey = RawCoverOption["key"];

export type CoverOption = {
  key: CoverKey;
  label: string;
  source: ImageSourcePropType;
};

export const COVER_OPTIONS = RAW_COVER_OPTIONS as readonly CoverOption[];

export const DEFAULT_COVER_KEY: CoverKey = COVER_OPTIONS[0].key;

const uriCache: Record<string, string> = {};

export const resolveCoverUri = (key?: string | null) => {
  if (!key) {
    return DEFAULT_EVENT_IMAGE;
  }
  if (uriCache[key]) {
    return uriCache[key];
  }
  const option = COVER_OPTIONS.find((item) => item.key === key);
  if (!option) {
    return DEFAULT_EVENT_IMAGE;
  }
  const resolved = Image.resolveAssetSource(option.source);
  if (resolved?.uri) {
    uriCache[key] = resolved.uri;
    return resolved.uri;
  }
  return DEFAULT_EVENT_IMAGE;
};

export const isCoverKey = (value: string): value is CoverKey =>
  COVER_OPTIONS.some((option) => option.key === value);

// Gradient colors for each cover - medium-to-dark tones for white text readability
export const COVER_GRADIENTS: Record<CoverKey, [string, string]> = {
  cover_01: ["#FF6B6B", "#C44569"],    // Sunset Glow - warm coral to rose
  cover_02: ["#4ECDC4", "#2C7873"],    // Ocean Mist - teal gradient
  cover_03: ["#F2994A", "#C75B39"],    // Golden Hour - amber to burnt orange
  cover_04: ["#5C6BC0", "#3949AB"],    // Indigo Nights - indigo gradient
  cover_05: ["#9B59B6", "#6C3483"],    // Violet Bloom - violet gradient
  cover_06: ["#E91E9B", "#9B2FAE"],    // Neon Pulse - hot pink to purple
  cover_07: ["#27AE60", "#1E7B46"],    // Forest Hike - forest greens
  cover_08: ["#D68910", "#A04000"],    // Amber Trail - amber to rust
  cover_09: ["#5D6D7E", "#2C3E50"],    // Steel City - steel blue to dark slate
  cover_10: ["#F39C12", "#D35400"],    // Citrus Pop - orange gradient
  cover_11: ["#2980B9", "#1A5276"],    // Deep Dive - ocean blue gradient
  cover_12: ["#E84393", "#B53389"],    // Magenta Bloom - magenta gradient
};

export const resolveCoverGradient = (key?: CoverKey | null): [string, string] => {
  const defaultGradient = COVER_GRADIENTS[DEFAULT_COVER_KEY];
  if (!key) {
    return defaultGradient;
  }
  return COVER_GRADIENTS[key] ?? defaultGradient;
};
