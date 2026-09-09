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

describe('NotificationRow status line', () => {
  it('shows no status line for a handled notification', () => {
    const screen = renderRow(notification({ actionState: 'resolved' }));
    expect(screen.queryByText('Handled')).toBeNull();
    expect(screen.queryByText('Unavailable')).toBeNull();
    expect(screen.getByRole('button').props.accessibilityLabel).not.toMatch(/Handled/);
  });

  it('keeps the Unavailable status line, which explains the Discover redirect', () => {
    const screen = renderRow(notification({ actionState: 'unavailable' }));
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityLabel).toMatch(
      /^Unavailable notification/,
    );
  });

  it('shows no status line for an active notification', () => {
    const screen = renderRow(notification());
    expect(screen.queryByText('Unavailable')).toBeNull();
  });
});
