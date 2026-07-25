/**
 * Buckets inbox items into widening time windows
 * (Today / Last 7 Days / Last 30 Days / Earlier).
 *
 * Assumes the input is already ordered newest-first; order is preserved within
 * each section, and empty sections are omitted.
 */
import { InboxItem } from '@utils/notificationCollapse';

export type NotificationSection = {
  title: string;
  data: InboxItem[];
};

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const sectionTitleForDayDiff = (diffDays: number): string => {
  if (diffDays <= 0) {
    return 'Today';
  }
  if (diffDays <= 7) {
    return 'Last 7 Days';
  }
  if (diffDays <= 30) {
    return 'Last 30 Days';
  }
  return 'Earlier';
};

export const groupNotificationsByDate = (
  items: InboxItem[],
  nowMs: number,
): NotificationSection[] => {
  const today = startOfDay(nowMs);
  const sections: NotificationSection[] = [];
  const byTitle = new Map<string, NotificationSection>();

  for (const item of items) {
    const created = Date.parse(item.createdAt);
    const diffDays = Number.isNaN(created)
      ? 0
      : Math.round((today - startOfDay(created)) / MS_PER_DAY);
    const title = sectionTitleForDayDiff(diffDays);

    let section = byTitle.get(title);
    if (!section) {
      section = { title, data: [] };
      byTitle.set(title, section);
      sections.push(section);
    }
    section.data.push(item);
  }

  return sections;
};
