import { mapNotification } from '@api/mappers/notifications';

describe('mapNotification', () => {
  it('maps notification action state and stable request identity', () => {
    expect(
      mapNotification({
        id: 12,
        type: 'join_request.created',
        event_id: 7,
        join_request_id: 42,
        title: 'Hike',
        body: 'Alice wants to join your event',
        read: true,
        action_state: 'resolved',
        action_reason: 'request_approved',
        action_resolved_at: '2026-08-23T08:00:00.000Z',
        created_at: '2026-08-23T07:00:00.000Z',
      }),
    ).toEqual({
      id: 12,
      type: 'join_request.created',
      eventId: 7,
      conversationId: undefined,
      joinRequestId: 42,
      title: 'Hike',
      body: 'Alice wants to join your event',
      payload: undefined,
      read: true,
      actionState: 'resolved',
      actionReason: 'request_approved',
      actionResolvedAt: '2026-08-23T08:00:00.000Z',
      createdAt: '2026-08-23T07:00:00.000Z',
    });
  });
});
