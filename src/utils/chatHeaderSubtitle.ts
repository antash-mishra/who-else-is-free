import { formatAbsoluteDateLabel } from '@utils/dateTime';

interface EventScheduleLike {
  eventDate?: string;
  dateLabel?: string;
}

/**
 * Resolve a display-ready absolute date label for a header subtitle.
 *
 * Prefers a compact absolute label (e.g. "08 Jun Mon") derived from the
 * event date; falls back to the legacy short label (e.g. "Today"/"Tmrw")
 * when no event date is available.
 */
const resolveDateLabel = (schedule: EventScheduleLike | null | undefined): string | null => {
  if (!schedule) {
    return null;
  }
  if (schedule.eventDate) {
    return formatAbsoluteDateLabel(schedule.eventDate);
  }
  return schedule.dateLabel ?? null;
};

export interface EventMemberSubtitleOptions {
  /** Event group type; controls "Accepted" (Single) vs "Members" (Group) wording. */
  groupType: 'Single' | 'Group' | undefined;
  /** Count shown in the subtitle (already includes the host if desired). */
  memberCount: number;
  /** Schedule used to derive the date portion. */
  schedule: EventScheduleLike | null | undefined;
}

/**
 * Build the event-level subtitle shared by OneToOneHubScreen,
 * JoinRequestScreen, and the group chat window:
 *
 *   Single → "1:1, 3 Accepted"
 *   Group  → "Group, 3 Members"
 *
 * (The comma is rendered as a dot separator by ChatEventHeader.)
 */
export const buildEventMemberSubtitle = ({
  groupType,
  memberCount,
}: EventMemberSubtitleOptions): string => {
  const typeLabel = groupType === 'Single' ? '1:1' : 'Group';
  const noun = groupType === 'Single' ? 'Accepted' : memberCount === 1 ? 'member' : 'members';
  return `${typeLabel}, ${memberCount} ${noun}`;
};

export interface OneToOneSubtitleOptions {
  /** Plan name shown before the date. */
  planName: string;
  /** Schedule used to derive the date portion. */
  schedule: EventScheduleLike | null | undefined;
}

/**
 * Build the 1:1 chat window subtitle:
 *
 *   "Coffee, 08 Jun Mon"
 *
 * Falls back to the plan name when no schedule exists.
 */
export const buildOneToOneSubtitle = ({ planName, schedule }: OneToOneSubtitleOptions): string => {
  const dateLabel = resolveDateLabel(schedule);
  return dateLabel ? `${planName}, ${dateLabel}` : planName;
};
