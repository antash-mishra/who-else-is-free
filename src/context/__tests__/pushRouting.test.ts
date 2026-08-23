import { resolutionRequestFromPushData, routeResolvedNotification } from '../pushRouting';

describe('pushRouting', () => {
  const createNavigator = (isReady = true) => ({
    isReady: jest.fn(() => isReady),
    navigate: jest.fn(),
  });

  it('prefers a recipient-specific persisted notification id', () => {
    expect(
      resolutionRequestFromPushData({
        notificationId: '42',
        type: 'chat.message',
        conversationId: '7',
      }),
    ).toEqual({ notification_ids: [42], mark_handled: true });
  });

  it('builds validated resolver hints for legacy and persistence-failed pushes', () => {
    expect(
      resolutionRequestFromPushData({
        type: ' Join_Request.Created ',
        eventId: '11',
        conversationId: '12',
        joinRequestId: '13',
      }),
    ).toEqual({
      type: 'join_request.created',
      event_id: 11,
      conversation_id: 12,
      join_request_id: 13,
      mark_handled: true,
    });
  });

  it('routes unavailable deleted events to Discover with the one-shot notice', () => {
    const navigator = createNavigator();
    routeResolvedNotification(
      {
        status: 'unavailable',
        reason: 'event_deleted',
        destination: 'events',
      },
      jest.fn(),
      navigator,
    );
    expect(navigator.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Events',
      params: { notificationNotice: 'event_unavailable' },
    });
  });

  it('routes lost access to Discover with the generic notice', () => {
    const navigator = createNavigator();
    routeResolvedNotification(
      {
        status: 'unavailable',
        reason: 'access_removed',
        destination: 'events',
      },
      jest.fn(),
      navigator,
    );
    expect(navigator.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Events',
      params: { notificationNotice: 'access_unavailable' },
    });
  });

  it('routes an active conversation only after server resolution', () => {
    const navigator = createNavigator();
    const setActiveConversation = jest.fn();
    routeResolvedNotification(
      { status: 'active', destination: 'chat', conversation_id: 9 },
      setActiveConversation,
      navigator,
    );
    expect(setActiveConversation).toHaveBeenCalledWith(9);
    expect(navigator.navigate).toHaveBeenCalledWith('ChatThread');
  });

  it('does not navigate when navigation is not ready', () => {
    const navigator = createNavigator(false);
    routeResolvedNotification({ status: 'active', destination: 'events' }, jest.fn(), navigator);
    expect(navigator.navigate).not.toHaveBeenCalled();
  });
});
