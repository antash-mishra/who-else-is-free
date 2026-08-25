import { AppNotification } from '@api/mappers/notifications';
import { InboxItem } from '@utils/notificationCollapse';
import { groupNotificationsByDate } from '@utils/notificationSections';

const itemAt = (id: number, date: string): InboxItem => {
  const notification: AppNotification = {
    id,
    type: 'event.deleted',
    title: 'Plan',
    body: 'Plan has been cancelled and is no longer happening. Explore other events nearby.',
    read: false,
    actionState: 'active',
    createdAt: date,
  };
  return { kind: 'single', key: `n-${id}`, createdAt: date, notification };
};

describe('groupNotificationsByDate', () => {
  it('uses sentence case for the seven- and thirty-day sections', () => {
    const now = new Date(2026, 7, 25, 12).getTime();
    const sections = groupNotificationsByDate(
      [
        itemAt(1, new Date(2026, 7, 20, 12).toISOString()),
        itemAt(2, new Date(2026, 7, 5, 12).toISOString()),
      ],
      now,
    );

    expect(sections.map((section) => section.title)).toEqual(['Last 7 days', 'Last 30 days']);
  });
});
