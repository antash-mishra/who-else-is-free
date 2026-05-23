import { ImageSourcePropType } from "react-native";

import { API_BASE_URL } from "@api/config";

export type CoverKey = string;

export type CoverOption = {
  key: CoverKey;
  label: string;
  fileName: string;
  url: string;
  source: ImageSourcePropType;
};

export type ApiCoverOption = {
  key: string;
  label: string;
  file_name?: string;
  url?: string;
};

export const DEFAULT_COVER_KEY: CoverKey = "badminton";

const coverAssetUrl = (fileName: string) =>
  `${API_BASE_URL}/assets/covers/${encodeURIComponent(fileName)}`;

export const DEFAULT_EVENT_IMAGE = coverAssetUrl("badminton.png");

export const DEFAULT_COVER_OPTION: CoverOption = {
  key: DEFAULT_COVER_KEY,
  label: "Badminton",
  fileName: "badminton.png",
  url: DEFAULT_EVENT_IMAGE,
  source: { uri: DEFAULT_EVENT_IMAGE },
};

export const COVER_OPTIONS: readonly CoverOption[] = [DEFAULT_COVER_OPTION];

const uriCache: Record<string, string> = {};

const normalizeCoverUrl = (url?: string, fileName?: string) => {
  if (url?.startsWith("http://") || url?.startsWith("https://")) {
    return url;
  }
  if (url?.startsWith("/")) {
    return `${API_BASE_URL}${url}`;
  }
  if (fileName) {
    return coverAssetUrl(fileName);
  }
  return DEFAULT_EVENT_IMAGE;
};

export const mapApiCoverOption = (option: ApiCoverOption): CoverOption => {
  const fileName = option.file_name ?? `${option.key}.png`;
  const url = normalizeCoverUrl(option.url, fileName);
  return {
    key: option.key,
    label: option.label,
    fileName,
    url,
    source: { uri: url },
  };
};

export const resolveCoverUri = (
  key?: string | null,
  options?: readonly CoverOption[],
) => {
  if (!key) {
    return DEFAULT_EVENT_IMAGE;
  }
  if (key === "cover_01") {
    return DEFAULT_EVENT_IMAGE;
  }
  const option = options?.find((item) => item.key === key);
  if (option?.url) {
    return option.url;
  }
  if (uriCache[key]) {
    return uriCache[key];
  }
  const resolved = coverAssetUrl(`${key}.png`);
  uriCache[key] = resolved;
  return resolved;
};

export const isCoverKey = (value: string): value is CoverKey =>
  value.trim().length > 0;

export const COVER_GRADIENTS: Record<string, [string, string]> = {
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
