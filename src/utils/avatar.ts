// Hex values in this file are brand/artwork avatar palette data — an allowed exception to the theme-token rule.
const AVATAR_COLORS = [
  "#4BBBA5",
  "#F07A38",
  "#7CBAD4",
  "#F4A0B5",
  "#9B72CF",
  "#6B82B0",
  "#E85D4A",
  "#E8A64A",
  "#6DC8A0",
  "#B99FDB",
  "#E05252",
  "#5BBCE4",
  "#8DC44A",
  "#F08030",
  "#E87090",
  "#48C4C4",
  "#F0BC2C",
  "#9E78C4",
  "#F07878",
] as const;

// Gradient backgrounds for no-photo avatars, as [startColor, endColor] pairs
// (0% → 100%). Rendered diagonally by AvatarBackground. Hex values are
// brand/artwork palette data — an allowed exception to the theme-token rule.
const AVATAR_GRADIENTS = [
  ["#FEC1C2", "#F83134"], // red
  ["#CED2F7", "#313CF8"], // indigo
  ["#C5F7E4", "#00A767"], // emerald
  ["#FFD86B", "#FF3D7F"], // sunset: gold → pink
  ["#FFE066", "#FF6A00"], // mango: yellow → orange
  ["#6EE7FF", "#3D5AFE"], // electric: cyan → blue
  ["#FFD452", "#FF2F2F"], // fire: yellow → red
  ["#F5A8FF", "#6A3BFF"], // orchid: pink lilac → violet
  ["#FFE45C", "#00C2A8"], // lemon → teal
  ["#9EF01A", "#00A86B"], // lime → jade
] as const;

export type AvatarGradient = readonly [string, string];

const URI_PREFIXES = [
  "data:",
  "http://",
  "https://",
  "file://",
  "content://",
  "blob:",
] as const;

export const resolveAvatarUri = (avatar?: string | null): string | null => {
  const value = avatar?.trim();
  if (!value) {
    return null;
  }

  if (URI_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return value;
  }

  return `data:image/jpeg;base64,${value}`;
};

export const getAvatarInitials = (
  name?: string | null,
  maxInitials = 1,
): string => {
  const trimmed = name?.trim();
  if (!trimmed) {
    return "?";
  }

  const initials = trimmed
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, Math.max(1, maxInitials));

  return initials || "?";
};

const hashSeed = (seed: number | string): number => {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return Math.abs(seed);
  }

  return String(seed).split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
};

export const getAvatarColor = (
  seed?: number | string | null,
  fallbackName?: string | null,
): string => {
  const baseSeed = seed ?? fallbackName ?? 0;
  return AVATAR_COLORS[hashSeed(baseSeed) % AVATAR_COLORS.length];
};

/**
 * Deterministically maps a seed to one of the gradient backgrounds, so a given
 * user always resolves to the same [start, end] pair.
 */
export const getAvatarGradient = (
  seed?: number | string | null,
  fallbackName?: string | null,
): AvatarGradient => {
  const baseSeed = seed ?? fallbackName ?? 0;
  return AVATAR_GRADIENTS[hashSeed(baseSeed) % AVATAR_GRADIENTS.length];
};
