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
