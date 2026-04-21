import { Image, ImageSourcePropType } from "react-native";

export const DEFAULT_EVENT_IMAGE = Image.resolveAssetSource(require("@assets/covers/brunch1.png")).uri;

const RAW_COVER_OPTIONS = [
  { key: "badminton",    label: "Badminton",    source: require("@assets/covers/badminton.png") },
  { key: "board-games",  label: "Board Games",  source: require("@assets/covers/board-games.png") },
  { key: "book",         label: "Book Club",    source: require("@assets/covers/book.png") },
  { key: "brunch",       label: "Brunch",       source: require("@assets/covers/brunch.png") },
  { key: "brunch1",      label: "Brunch Alt",   source: require("@assets/covers/brunch1.png") },
  { key: "chess",        label: "Chess",        source: require("@assets/covers/chess.png") },
  { key: "coffee",       label: "Coffee",       source: require("@assets/covers/coffee.png") },
  { key: "comedy",       label: "Comedy",       source: require("@assets/covers/comedy.png") },
  { key: "crochet",      label: "Crochet",      source: require("@assets/covers/crochet.png") },
  { key: "gig",          label: "Gig",          source: require("@assets/covers/gig.png") },
  { key: "karaoke",      label: "Karaoke",      source: require("@assets/covers/karaoke.png") },
  { key: "martial-arts", label: "Martial Arts", source: require("@assets/covers/martial-arts.png") },
  { key: "museum",       label: "Museum",       source: require("@assets/covers/museum.png") },
  { key: "museum1",      label: "Museum Alt",   source: require("@assets/covers/museum1.png") },
  { key: "pool",         label: "Pool",         source: require("@assets/covers/pool.png") },
  { key: "running",      label: "Running",      source: require("@assets/covers/running.png") },
  { key: "running1",     label: "Running Alt",  source: require("@assets/covers/running1.png") },
  { key: "surfing",      label: "Surfing",      source: require("@assets/covers/surfing.png") },
  { key: "swimming",     label: "Swimming",     source: require("@assets/covers/swimming.png") },
  { key: "tennis",       label: "Tennis",       source: require("@assets/covers/tennis.png") },
  { key: "video-games",  label: "Video Games",  source: require("@assets/covers/video-games.png") },
  { key: "wine",         label: "Wine",         source: require("@assets/covers/wine.png") },
  { key: "workout",      label: "Workout",      source: require("@assets/covers/workout.png") },
  { key: "yoga",         label: "Yoga",         source: require("@assets/covers/yoga.png") },
  { key: "yoga1",        label: "Yoga Alt",     source: require("@assets/covers/yoga1.png") },
  { key: "photography",  label: "Photography",  source: require("@assets/covers/photography.png") },
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

export const COVER_GRADIENTS: Record<CoverKey, [string, string]> = {
  "badminton":    ["#4CAF50", "#2E7D32"],
  "board-games":  ["#8D6E63", "#5D4037"],
  "book":         ["#FF8F00", "#E65100"],
  "brunch":       ["#F06292", "#C2185B"],
  "brunch1":      ["#E91E63", "#880E4F"],
  "chess":        ["#546E7A", "#263238"],
  "coffee":       ["#795548", "#4E342E"],
  "comedy":       ["#FFB300", "#E65100"],
  "crochet":      ["#AB47BC", "#6A1B9A"],
  "gig":          ["#E53935", "#880E4F"],
  "karaoke":      ["#EC407A", "#880E4F"],
  "martial-arts": ["#EF5350", "#B71C1C"],
  "museum":       ["#5C6BC0", "#283593"],
  "museum1":      ["#7986CB", "#283593"],
  "pool":         ["#29B6F6", "#01579B"],
  "running":      ["#FF7043", "#BF360C"],
  "running1":     ["#FF5722", "#BF360C"],
  "surfing":      ["#26C6DA", "#00838F"],
  "swimming":     ["#26A69A", "#004D40"],
  "tennis":       ["#D4E157", "#827717"],
  "video-games":  ["#7E57C2", "#311B92"],
  "wine":         ["#AD1457", "#880E4F"],
  "workout":      ["#EF5350", "#B71C1C"],
  "yoga":         ["#66BB6A", "#1B5E20"],
  "yoga1":        ["#43A047", "#1B5E20"],
  "photography":  ["#37474F", "#102027"],
};

export const resolveCoverGradient = (key?: CoverKey | null): [string, string] => {
  const defaultGradient = COVER_GRADIENTS[DEFAULT_COVER_KEY];
  if (!key) {
    return defaultGradient;
  }
  return COVER_GRADIENTS[key] ?? defaultGradient;
};
