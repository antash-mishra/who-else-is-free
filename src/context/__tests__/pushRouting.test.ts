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

  it('routes ended events to Discover with the event-unavailable notice', () => {
    const navigator = createNavigator();
    routeResolvedNotification(
      {
        status: 'unavailable',
        reason: 'event_ended',
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

  it('routes a group request to its chat thread with the requests sheet on top', () => {
    const navigator = createNavigator();
    const setActiveConversation = jest.fn();

    routeResolvedNotification(
      {
        status: 'active',
        destination: 'join_requests',
        event_id: 17,
        conversation_id: 9,
        title: 'Hike',
        group_type: 'Group',
      },
      setActiveConversation,
      navigator,
      { runAfterTransition: (task) => task() },
    );

    expect(setActiveConversation).toHaveBeenCalledWith(9);
    expect(navigator.navigate).toHaveBeenNthCalledWith(1, 'ChatThread');
    expect(navigator.navigate).toHaveBeenNthCalledWith(2, 'JoinRequest', {
      conversationId: 9,
      eventId: 17,
    });
  });

  it('routes a conversation-less 1:1 request to the hub with the requests sheet on top', () => {
    const navigator = createNavigator();
    const setActiveConversation = jest.fn();

    routeResolvedNotification(
      {
        status: 'active',
        destination: 'join_requests',
        event_id: 17,
        title: 'Morning Walk',
        group_type: 'Single',
      },
      setActiveConversation,
      navigator,
      { runAfterTransition: (task) => task() },
    );

    expect(setActiveConversation).not.toHaveBeenCalled();
    expect(navigator.navigate).toHaveBeenNthCalledWith(1, 'OneToOneHub', {
      conversationId: -17,
      eventId: 17,
      title: 'Morning Walk',
    });
    expect(navigator.navigate).toHaveBeenNthCalledWith(2, 'JoinRequest', {
      conversationId: -17,
      eventId: 17,
      includeApproved: true,
    });
  });

  it('treats a resolution without group_type but with a conversation as a group request', () => {
    // Servers deployed before group_type existed only attach conversation_id
    // to join_requests resolutions for Group plans.
    const navigator = createNavigator();
    const setActiveConversation = jest.fn();

    routeResolvedNotification(
      {
        status: 'active',
        destination: 'join_requests',
        event_id: 17,
        conversation_id: 9,
        title: 'Hike',
      },
      setActiveConversation,
      navigator,
      { runAfterTransition: (task) => task() },
    );

    expect(setActiveConversation).toHaveBeenCalledWith(9);
    expect(navigator.navigate).toHaveBeenNthCalledWith(1, 'ChatThread');
    expect(navigator.navigate).toHaveBeenNthCalledWith(2, 'JoinRequest', {
      conversationId: 9,
      eventId: 17,
    });
  });

  it('opens the requests sheet only after the underlying screen transition settles', () => {
    const navigator = createNavigator();
    const runAfterTransition = jest.fn();

    routeResolvedNotification(
      {
        status: 'active',
        destination: 'join_requests',
        event_id: 17,
        conversation_id: 9,
        title: 'Hike',
        group_type: 'Group',
      },
      jest.fn(),
      navigator,
      { runAfterTransition },
    );

    expect(navigator.navigate).toHaveBeenCalledTimes(1);
    expect(runAfterTransition).toHaveBeenCalledTimes(1);

    runAfterTransition.mock.calls[0][0]();

    expect(navigator.navigate).toHaveBeenCalledTimes(2);
    expect(navigator.navigate).toHaveBeenLastCalledWith('JoinRequest', {
      conversationId: 9,
      eventId: 17,
    });
  });

  it('does not navigate when navigation is not ready', () => {
    const navigator = createNavigator(false);
    routeResolvedNotification({ status: 'active', destination: 'events' }, jest.fn(), navigator);
    expect(navigator.navigate).not.toHaveBeenCalled();
  });
});
