import React from 'react';

import { render } from '@testing-library/react-native';

import { AppNotification } from '@api/mappers/notifications';

import NotificationRow from '../NotificationRow';

const notification = (overrides: Partial<AppNotification> = {}): AppNotification => ({
  id: 7,
  type: 'chat.message',
  conversationId: 10,
  title: 'Dancing',
  body: 'Alice: hey',
  payload: JSON.stringify({ senderName: 'Alice' }),
  read: true,
  actionState: 'active',
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...overrides,
});

const renderRow = (item: AppNotification) =>
  render(
    <NotificationRow
      item={{ kind: 'single', key: `n-${item.id}`, createdAt: item.createdAt, notification: item }}
      onPressSingle={jest.fn()}
      onPressChatGroup={jest.fn()}
      onPressJoinGroup={jest.fn()}
      nowMs={Date.now()}
    />,
  );

const chatGroup = (read: boolean) => ({
  conversationId: 10,
  eventName: 'Dancing',
  senderNames: ['Alice'],
  count: 2,
  latestSender: 'Alice',
  latestPreview: 'hey',
  createdAt: new Date().toISOString(),
  ids: [1, 2],
  read,
  actionState: 'active' as const,
});

const renderGroup = (read: boolean) => {
  const group = chatGroup(read);
  return render(
    <NotificationRow
      item={{
        kind: 'chatGroup',
        key: `c-10:${read ? 'read' : 'unread'}`,
        createdAt: group.createdAt,
        group,
      }}
      onPressSingle={jest.fn()}
      onPressChatGroup={jest.fn()}
      onPressJoinGroup={jest.fn()}
      nowMs={Date.now()}
    />,
  );
};

describe('NotificationRow read state', () => {
  it('shows the unread dot for an unopened chat group', () => {
    const screen = renderGroup(false);
    expect(screen.getByTestId('notification-unread-dot')).toBeTruthy();
  });

  it('keeps an opened chat group in the list, lighter and without the unread dot', () => {
    const screen = renderGroup(true);
    expect(screen.queryByTestId('notification-unread-dot')).toBeNull();
    expect(screen.getByText(/New messages from/)).toBeTruthy();
  });

  it('shows the unread dot for an unread single notification and hides it once read', () => {
    expect(
      renderRow(notification({ read: false })).getByTestId('notification-unread-dot'),
    ).toBeTruthy();
    expect(
      renderRow(notification({ read: true })).queryByTestId('notification-unread-dot'),
    ).toBeNull();
  });
});

describe('NotificationRow status line', () => {
  it('shows no status line for a handled notification', () => {
    const screen = renderRow(notification({ actionState: 'resolved' }));
    expect(screen.queryByText('Handled')).toBeNull();
    expect(screen.queryByText('Unavailable')).toBeNull();
    expect(screen.getByRole('button').props.accessibilityLabel).not.toMatch(/Handled/);
  });

  it('shows no status line for an unavailable notification, only the screen-reader hint', () => {
    const screen = renderRow(notification({ actionState: 'unavailable' }));
    expect(screen.queryByText('Unavailable')).toBeNull();
    expect(screen.getByRole('button').props.accessibilityLabel).toMatch(
      /^Unavailable notification/,
    );
  });

  it('shows no status line for an active notification', () => {
    const screen = renderRow(notification());
    expect(screen.queryByText('Unavailable')).toBeNull();
  });
});
