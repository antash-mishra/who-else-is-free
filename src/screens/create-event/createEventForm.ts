import { CoverKey, DEFAULT_COVER_KEY } from '@constants/covers';
import { AGE_MAX, AGE_MIN, GenderOption, GroupOption } from '@constants/eventOptions';
import { GuestEventDraft, UserEvent } from '@context/EventsContext';
import {
  combineDateAndTime,
  formatTime,
  getDefaultEventDateTime,
  getLegacyDateLabel,
  toDateKey,
} from '@utils/dateTime';
import { formatEventLocationName } from '@utils/eventDisplay';

export type CreateEventFormState = {
  eventName: string;
  description: string;
  groupType: GroupOption;
  gender: GenderOption;
  ageRange: [number, number];
  selectedDateTime: Date;
  location: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  coverKey: CoverKey;
};

export type NormalizedCreateEventForm = {
  title: string;
  description?: string;
  location: string;
  eventDate: string;
  dateLabel: string;
  time: string;
  scheduledAt: string;
  gender: GenderOption;
  minAge: number;
  maxAge: number;
  groupType: GroupOption;
  badgeLabel: string | undefined;
  coverKey: CoverKey;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  normalizedDateTime: Date;
};

export type CreateEventPayload = GuestEventDraft & {
  userId: number;
  hostName: string;
};

export type UpdateEventPayload = Omit<GuestEventDraft, 'badgeLabel'> & {
  badgeLabel?: string | null;
  coverKey: CoverKey;
};

type CreateEventOwner = {
  id: number;
  name: string;
};

export const getEventDateTime = (event?: UserEvent | null): Date => {
  if (!event) {
    return getDefaultEventDateTime();
  }

  if (event.scheduledAt) {
    const parsed = new Date(event.scheduledAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const combined = combineDateAndTime(event.eventDate, event.time);
  if (combined) {
    return combined;
  }

  return getDefaultEventDateTime();
};

export const createEmptyFormState = (
  coverKey: CoverKey = DEFAULT_COVER_KEY,
): CreateEventFormState => ({
  eventName: '',
  description: '',
  groupType: 'Single',
  gender: 'Any',
  ageRange: [AGE_MIN, AGE_MAX],
  selectedDateTime: getDefaultEventDateTime(),
  location: '',
  placeId: '',
  latitude: undefined,
  longitude: undefined,
  coverKey,
});

export const createFormStateFromEvent = (event?: UserEvent | null): CreateEventFormState => ({
  eventName: event?.title ?? '',
  description: event?.description ?? '',
  groupType: event?.groupType === 'Group' ? 'Group' : 'Single',
  gender: (event?.gender as GenderOption) || 'Any',
  ageRange: [event?.minAge ?? AGE_MIN, event?.maxAge ?? AGE_MAX],
  selectedDateTime: getEventDateTime(event),
  location: event?.location ?? '',
  placeId: event?.placeId ?? '',
  latitude: event?.latitude,
  longitude: event?.longitude,
  coverKey: event?.coverKey ?? DEFAULT_COVER_KEY,
});

export const normalizeCreateEventForm = (form: CreateEventFormState): NormalizedCreateEventForm => {
  const normalizedDateTime = new Date(form.selectedDateTime);
  normalizedDateTime.setSeconds(0, 0);

  const [rangeStart, rangeEnd] = form.ageRange;
  const eventDate = toDateKey(normalizedDateTime);
  const groupBadge = form.groupType === 'Group' ? 'Group' : undefined;

  return {
    title: form.eventName.trim(),
    location: form.location.trim(),
    time: formatTime(normalizedDateTime.getHours(), normalizedDateTime.getMinutes()),
    eventDate,
    dateLabel: getLegacyDateLabel(eventDate),
    description: form.description.trim().length ? form.description.trim() : undefined,
    gender: form.gender,
    minAge: Math.min(rangeStart, rangeEnd),
    maxAge: Math.max(rangeStart, rangeEnd),
    groupType: form.groupType,
    badgeLabel: groupBadge,
    coverKey: form.coverKey || DEFAULT_COVER_KEY,
    scheduledAt: normalizedDateTime.toISOString(),
    placeId: form.placeId,
    latitude: form.latitude,
    longitude: form.longitude,
    normalizedDateTime,
  };
};

export const buildCreateEventPayload = (
  form: CreateEventFormState,
  owner: CreateEventOwner,
): CreateEventPayload => ({
  ...buildGuestEventDraft(form),
  userId: owner.id,
  hostName: owner.name,
});

export const buildUpdateEventPayload = (form: CreateEventFormState): UpdateEventPayload => {
  const normalized = normalizeCreateEventForm(form);

  return {
    title: normalized.title,
    location: normalized.location,
    time: normalized.time,
    eventDate: normalized.eventDate,
    dateLabel: normalized.dateLabel,
    description: normalized.description,
    gender: normalized.gender,
    minAge: normalized.minAge,
    maxAge: normalized.maxAge,
    groupType: normalized.groupType,
    badgeLabel: normalized.groupType === 'Group' ? 'Group' : null,
    coverKey: normalized.coverKey,
    scheduledAt: normalized.scheduledAt,
    placeId: normalized.placeId,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
  };
};

export const buildGuestEventDraft = (form: CreateEventFormState): GuestEventDraft => {
  const normalized = normalizeCreateEventForm(form);

  return {
    title: normalized.title,
    location: normalized.location,
    time: normalized.time,
    eventDate: normalized.eventDate,
    dateLabel: normalized.dateLabel,
    description: normalized.description,
    gender: normalized.gender,
    minAge: normalized.minAge,
    maxAge: normalized.maxAge,
    groupType: normalized.groupType,
    badgeLabel: normalized.badgeLabel,
    coverKey: normalized.coverKey,
    scheduledAt: normalized.scheduledAt,
    placeId: normalized.placeId,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
  };
};

export const getFormLocationDisplayName = (event?: UserEvent | null) =>
  formatEventLocationName(event?.location);
