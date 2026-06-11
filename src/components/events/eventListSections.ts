import { EventItemProps } from '@components/EventCard';
import { formatEventCardMetaLine, formatEventListSectionHeaderLabel } from '@utils/eventDisplay';

export type EventSection<TItem extends EventItemProps = EventItemProps> = {
  title: string;
  data: TItem[];
};

export type EventCardSource = {
  id: string;
  title: string;
  location: string;
  time: string;
  audience: string;
  imageUri: string;
  eventDate?: string | null;
  createdAt?: string | null;
  groupType?: string | null;
  gender?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
};

type BuildEventSectionsOptions = {
  sortDirection?: 'asc' | 'desc';
  titleForDate?: (eventDate: string) => string;
};

const defaultTitleForDate = (eventDate: string) => formatEventListSectionHeaderLabel(eventDate);

export const toEventCardItem = (event: EventCardSource, badgeLabel?: string): EventItemProps => ({
  id: event.id,
  title: event.title,
  location: event.location,
  time: event.time,
  audience: event.audience,
  metaLine: formatEventCardMetaLine({
    groupType: event.groupType,
    gender: event.gender,
    minAge: event.minAge,
    maxAge: event.maxAge,
  }),
  imageUri: event.imageUri,
  badgeLabel,
});

export const sortEventsByCreatedAtDesc = <TEvent extends { createdAt?: string | null }>(
  a: TEvent,
  b: TEvent,
) => {
  const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return dateB - dateA;
};

export const buildEventSections = <TEvent extends EventCardSource>(
  events: readonly TEvent[],
  getBadgeLabel: (event: TEvent) => string | undefined = () => undefined,
  { sortDirection = 'asc', titleForDate = defaultTitleForDate }: BuildEventSectionsOptions = {},
): EventSection[] => {
  const grouped = new Map<string, EventItemProps[]>();

  events.forEach((event) => {
    const dateKey = event.eventDate ?? '';
    if (!dateKey) {
      return;
    }
    const sectionEvents = grouped.get(dateKey) ?? [];
    sectionEvents.push(toEventCardItem(event, getBadgeLabel(event)));
    grouped.set(dateKey, sectionEvents);
  });

  return Array.from(grouped.entries())
    .sort(([leftDate], [rightDate]) =>
      sortDirection === 'asc'
        ? leftDate.localeCompare(rightDate)
        : rightDate.localeCompare(leftDate),
    )
    .map(([eventDate, data]) => ({
      title: titleForDate(eventDate),
      data,
    }))
    .filter((section) => section.data.length > 0);
};

export const buildSingleEventSection = <TEvent extends EventCardSource>(
  title: string,
  events: readonly TEvent[],
  getBadgeLabel: (event: TEvent) => string | undefined = () => undefined,
): EventSection[] =>
  events.length > 0
    ? [{ title, data: events.map((event) => toEventCardItem(event, getBadgeLabel(event))) }]
    : [];

export const buildEventItemSections = <
  TItem extends EventItemProps & { eventDate?: string | null },
>(
  items: readonly TItem[],
  { sortDirection = 'asc', titleForDate = defaultTitleForDate }: BuildEventSectionsOptions = {},
): EventSection<TItem>[] => {
  const grouped = new Map<string, TItem[]>();

  items.forEach((item) => {
    const dateKey = item.eventDate ?? '';
    if (!dateKey) {
      return;
    }
    const sectionEvents = grouped.get(dateKey) ?? [];
    sectionEvents.push(item);
    grouped.set(dateKey, sectionEvents);
  });

  return Array.from(grouped.entries())
    .sort(([leftDate], [rightDate]) =>
      sortDirection === 'asc'
        ? leftDate.localeCompare(rightDate)
        : rightDate.localeCompare(leftDate),
    )
    .map(([eventDate, data]) => ({
      title: titleForDate(eventDate),
      data,
    }))
    .filter((section) => section.data.length > 0);
};
