import React from 'react';

import { act, fireEvent, render } from '@testing-library/react-native';
import { Gesture } from 'react-native-gesture-handler';

import { AppNotification } from '@api/mappers/notifications';
import NotificationBanner from '@components/NotificationBanner';

import { mockHaptics } from '../../__tests__/mocks/mockModules';

const notification: AppNotification = {
  id: 42,
  type: 'join_request.created',
  eventId: 7,
  conversationId: 10,
  joinRequestId: 3,
  title: 'Sunset Hike',
  body: 'Noah Smith wants to join your plan Sunset Hike.',
  payload: JSON.stringify({ senderName: 'Noah Smith' }),
  read: false,
  actionState: 'active',
  createdAt: new Date().toISOString(),
};

describe('NotificationBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the composed notification sentence and is tappable', () => {
    const onPress = jest.fn();
    const onDismissed = jest.fn();
    const { getByLabelText, getByTestId } = render(
      <NotificationBanner
        notification={notification}
        onPress={onPress}
        onDismissed={onDismissed}
      />,
    );

    expect(getByLabelText(/Noah Smith wants to join your plan Sunset Hike/)).toBeTruthy();
    // Arrival haptic.
    expect(mockHaptics.impactAsync).toHaveBeenCalledWith('Light');

    fireEvent.press(getByTestId('notification-banner'));
    expect(onPress).toHaveBeenCalledWith(notification);
    // Reanimated mock completes the exit synchronously.
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after the hold duration', () => {
    const onDismissed = jest.fn();
    const { queryByTestId } = render(
      <NotificationBanner
        notification={notification}
        onPress={jest.fn()}
        onDismissed={onDismissed}
        holdMs={1500}
      />,
    );

    expect(queryByTestId('notification-banner')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(1499);
    });
    expect(onDismissed).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismissed).toHaveBeenCalledTimes(1);
    expect(queryByTestId('notification-banner')).toBeNull();
  });

  it('configures an upward-only swipe-to-dismiss pan gesture', () => {
    const panMock = Gesture.Pan as jest.Mock;
    render(
      <NotificationBanner
        notification={notification}
        onPress={jest.fn()}
        onDismissed={jest.fn()}
      />,
    );
    const gesture = panMock.mock.results[panMock.mock.results.length - 1].value;
    expect(gesture.activeOffsetY).toHaveBeenCalledWith([-10, 10]);
    expect(gesture.failOffsetX).toHaveBeenCalledWith([-25, 25]);
    expect(gesture.onUpdate).toHaveBeenCalled();
    expect(gesture.onEnd).toHaveBeenCalled();
  });

  it('renders nothing when there is no notification', () => {
    const { queryByTestId } = render(
      <NotificationBanner notification={null} onPress={jest.fn()} onDismissed={jest.fn()} />,
    );
    expect(queryByTestId('notification-banner')).toBeNull();
    expect(mockHaptics.impactAsync).not.toHaveBeenCalled();
  });

  it('replaces the content in place when a newer notification arrives', () => {
    const onDismissed = jest.fn();
    const { getByLabelText, rerender } = render(
      <NotificationBanner
        notification={notification}
        onPress={jest.fn()}
        onDismissed={onDismissed}
      />,
    );
    const next: AppNotification = {
      ...notification,
      id: 43,
      type: 'join_request.approved',
      body: 'Your request to join Sunset Hike was approved.',
    };
    rerender(
      <NotificationBanner notification={next} onPress={jest.fn()} onDismissed={onDismissed} />,
    );
    expect(getByLabelText(/was approved/)).toBeTruthy();
    expect(onDismissed).not.toHaveBeenCalled();
  });
});
