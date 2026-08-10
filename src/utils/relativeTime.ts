const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

export const formatCompactRelativeTime = (
  timestamp?: string | null,
  now: number | Date = Date.now(),
): string => {
  if (!timestamp) {
    return "";
  }

  const timestampMs = Date.parse(timestamp);
  if (Number.isNaN(timestampMs)) {
    return "";
  }

  const nowMs = typeof now === "number" ? now : now.getTime();
  const diffMs = Math.max(0, nowMs - timestampMs);

  if (diffMs < ONE_MINUTE_MS) {
    return "Now";
  }
  if (diffMs < ONE_HOUR_MS) {
    return `${Math.floor(diffMs / ONE_MINUTE_MS)}m`;
  }
  if (diffMs < ONE_DAY_MS) {
    return `${Math.floor(diffMs / ONE_HOUR_MS)}h`;
  }
  return `${Math.floor(diffMs / ONE_DAY_MS)}d`;
};

export const getNextCompactRelativeTimeUpdateMs = (
  timestamp?: string | null,
  now: number | Date = Date.now(),
): number | null => {
  if (!timestamp) {
    return null;
  }

  const timestampMs = Date.parse(timestamp);
  if (Number.isNaN(timestampMs)) {
    return null;
  }

  const nowMs = typeof now === "number" ? now : now.getTime();
  const diffMs = Math.max(0, nowMs - timestampMs);

  if (diffMs < ONE_MINUTE_MS) {
    return ONE_MINUTE_MS - diffMs;
  }
  if (diffMs < ONE_HOUR_MS) {
    return ONE_MINUTE_MS - (diffMs % ONE_MINUTE_MS);
  }
  if (diffMs < ONE_DAY_MS) {
    return ONE_HOUR_MS - (diffMs % ONE_HOUR_MS);
  }
  return ONE_DAY_MS - (diffMs % ONE_DAY_MS);
};
