const AVATAR_COLORS = [
  "#4CAF50",
  "#9C27B0",
  "#FF9800",
  "#2196F3",
  "#E91E63",
  "#00BCD4",
  "#8BC34A",
  "#673AB7",
] as const;

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
