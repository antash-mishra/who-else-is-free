import { EventItemProps } from '@components/EventCard';
import { CoverKey, resolveCoverUri } from '@constants/covers';
import { getScheduleDisplay } from '@utils/dateTime';
import { formatAudienceLabel } from '@utils/eventDisplay';

export type DateLabel = string;

export interface UserEvent extends EventItemProps {
  dateLabel: DateLabel;
  eventDate: string;
  description?: string;
  ownerId: number;
  hostName: string;
  hostAvatar?: string;
  gender: string;
  minAge: number;
  maxAge: number;
  groupType: 'Single' | 'Group';
  coverKey?: CoverKey | null;
  scheduledAt?: string; // ISO 8601 UTC timestamp
  createdAt?: string; // ISO 8601 UTC timestamp
  placeId?: string;
  latitude?: number;
  longitude?: number;
}

export type ApiEvent = {
  id: number;
  title: string;
  location: string;
  time: string;
  description?: string;
  gender: string;
  min_age: number;
  max_age: number;
  date_label: string;
  event_date: string;
  group_type?: 'Single' | 'Group';
  user_id: number;
  host_name: string;
  host_avatar?: string | null;
  cover_key?: CoverKey | null;
  scheduled_at?: string; // ISO 8601 UTC timestamp
  created_at?: string; // ISO 8601 UTC timestamp
  place_id?: string;
  latitude?: number;
  longitude?: number;
};

export const mapApiEventToUserEvent = (event: ApiEvent, badgeLabel?: string): UserEvent => {
  const groupType = event.group_type ?? 'Single';
  const schedule = getScheduleDisplay({
    scheduledAt: event.scheduled_at,
    eventDate: event.event_date,
    time: event.time,
    dateLabel: event.date_label,
  });

  return {
    id: String(event.id),
    title: event.title,
    location: event.location,
    time: schedule.displayTime,
    audience: formatAudienceLabel({
      gender: event.gender,
      minAge: event.min_age,
      maxAge: event.max_age,
    }),
    imageUri: resolveCoverUri(event.cover_key),
    badgeLabel: groupType === 'Group' ? 'Group' : badgeLabel,
    dateLabel: schedule.displayLabel,
    eventDate: schedule.displayDate,
    description: event.description,
    ownerId: event.user_id,
    hostName: event.host_name,
    hostAvatar: event.host_avatar ?? undefined,
    gender: event.gender,
    minAge: event.min_age,
    maxAge: event.max_age,
    groupType,
    coverKey: event.cover_key ?? null,
    scheduledAt: event.scheduled_at,
    createdAt: event.created_at,
    placeId: event.place_id,
    latitude: event.latitude,
    longitude: event.longitude,
  };
};
