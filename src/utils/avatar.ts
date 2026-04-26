const AVATAR_COLORS = [
  "#F43F5E", // Rose
  "#E11D48", // Crimson
  "#EC4899", // Pink
  "#DB2777", // Deep Pink
  "#D946EF", // Fuchsia
  "#C026D3", // Magenta
  "#A855F7", // Grape
  "#9333EA", // Purple
  "#8B5CF6", // Violet
  "#7C3AED", // Deep Violet
  "#6366F1", // Indigo
  "#4F46E5", // Deep Indigo
  "#3B82F6", // Blue
  "#2563EB", // Deep Blue
  "#0EA5E9", // Sky
  "#0284C7", // Deep Sky
  "#06B6D4", // Cyan
  "#0891B2", // Deep Cyan
  "#14B8A6", // Teal
  "#0D9488", // Deep Teal
  "#10B981", // Emerald
  "#059669", // Deep Emerald
  "#22C55E", // Green
  "#16A34A", // Deep Green
  "#F59E0B", // Amber
  "#D97706", // Deep Amber
  "#F97316", // Orange
  "#EA580C", // Deep Orange
  "#EF4444", // Red
  "#DC2626", // Deep Red
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
