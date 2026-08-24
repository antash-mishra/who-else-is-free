import { EVENT_DETAILS_INFO_SEPARATOR, EVENT_INFO_SEPARATOR } from '@constants/display';
import { AGE_MAX, AGE_MIN } from '@constants/eventOptions';

import { parseDateKey } from './dateTime';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type AudienceInput = {
  gender?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
};

type EventDisplayInput = AudienceInput & {
  groupType?: string | null;
};

type NormalizedAgeRange = {
  minAge: number;
  maxAge: number;
};

const normalizeAgeRange = (
  minAge?: number | null,
  maxAge?: number | null,
): NormalizedAgeRange | null => {
  if (typeof minAge !== 'number' || typeof maxAge !== 'number') {
    return null;
  }

  if (Number.isNaN(minAge) || Number.isNaN(maxAge)) {
    return null;
  }

  if (minAge <= maxAge) {
    return { minAge, maxAge };
  }

  return {
    minAge: maxAge,
    maxAge: minAge,
  };
};

const getGenderLabel = (gender?: string | null): string | null => {
  const trimmed = gender?.trim();
  return trimmed ? trimmed : null;
};

const formatListAbsoluteDateLabel = (eventDate: string): string => {
  const parsed = parseDateKey(eventDate);
  if (!parsed) {
    return eventDate;
  }

  const day = `${parsed.getDate()}`.padStart(2, '0');
  const month = parsed.toLocaleString('en-US', { month: 'short' });
  const weekday = parsed.toLocaleString('en-US', { weekday: 'short' });
  return `${day} ${month}, ${weekday}`;
};

const getDiffFromToday = (eventDate: string, now: Date = new Date()): number | null => {
  const parsed = parseDateKey(eventDate);
  if (!parsed) {
    return null;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.floor((eventDay.getTime() - today.getTime()) / ONE_DAY_MS);
};

export const isAllGender = (gender?: string | null): boolean =>
  (gender ?? '').trim().toLowerCase() === 'any';

export const isAllAge = (minAge?: number | null, maxAge?: number | null): boolean => {
  const normalized = normalizeAgeRange(minAge, maxAge);
  if (!normalized) {
    return false;
  }

  return normalized.minAge === AGE_MIN && normalized.maxAge === AGE_MAX;
};

export const formatEventTypeLabel = (groupType?: string | null): '1:1' | 'Group' =>
  groupType === 'Group' ? 'Group' : '1:1';

export const formatCompactAgeLabel = (
  minAge?: number | null,
  maxAge?: number | null,
): string | null => {
  const normalized = normalizeAgeRange(minAge, maxAge);
  if (!normalized || isAllAge(normalized.minAge, normalized.maxAge)) {
    return null;
  }

  if (normalized.minAge === normalized.maxAge) {
    return `${normalized.minAge}`;
  }

  return `${normalized.minAge}-${normalized.maxAge}`;
};

export const formatVerboseAgeLabel = (
  minAge?: number | null,
  maxAge?: number | null,
): string | null => {
  const normalized = normalizeAgeRange(minAge, maxAge);
  if (!normalized) {
    return null;
  }

  if (isAllAge(normalized.minAge, normalized.maxAge)) {
    return 'All ages';
  }

  if (normalized.minAge === normalized.maxAge) {
    return `${normalized.minAge} years`;
  }

  return `${normalized.minAge} to ${normalized.maxAge} years`;
};

export const formatAudienceLabel = ({ gender, minAge, maxAge }: AudienceInput): string => {
  const parts: string[] = [];
  const genderLabel = isAllGender(gender) ? 'All genders' : getGenderLabel(gender);
  const ageLabel = formatVerboseAgeLabel(minAge, maxAge);

  if (genderLabel) {
    parts.push(genderLabel);
  }

  if (ageLabel) {
    parts.push(ageLabel);
  }

  return parts.join(EVENT_INFO_SEPARATOR);
};

export const formatEventCardMetaLine = ({
  groupType,
  gender,
  minAge,
  maxAge,
}: EventDisplayInput): string => {
  const parts: string[] = [formatEventTypeLabel(groupType)];
  const genderLabel = isAllGender(gender) ? null : getGenderLabel(gender);
  const ageLabel = formatCompactAgeLabel(minAge, maxAge);

  if (genderLabel) {
    parts.push(genderLabel);
  }

  if (ageLabel) {
    parts.push(ageLabel);
  }

  return parts.join(EVENT_INFO_SEPARATOR);
};

export const formatEventDetailAudienceLine = ({
  groupType,
  gender,
  minAge,
  maxAge,
}: EventDisplayInput): string => {
  const parts: string[] = [formatEventTypeLabel(groupType)];
  const genderLabel = isAllGender(gender) ? 'All genders' : getGenderLabel(gender);
  const ageLabel = formatVerboseAgeLabel(minAge, maxAge);

  if (genderLabel) parts.push(genderLabel);
  if (ageLabel) parts.push(ageLabel);

  return parts.join(EVENT_DETAILS_INFO_SEPARATOR);
};

export const formatEventLocationName = (location?: string | null): string => {
  const trimmed = location?.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.split(',')[0]?.trim() || trimmed;
};

export const formatEventListSectionHeaderLabel = (
  eventDate: string,
  now: Date = new Date(),
): string => {
  const diff = getDiffFromToday(eventDate, now);
  if (diff === 0) {
    return 'Today';
  }
  if (diff === 1) {
    return 'Tomorrow';
  }

  return formatListAbsoluteDateLabel(eventDate);
};
