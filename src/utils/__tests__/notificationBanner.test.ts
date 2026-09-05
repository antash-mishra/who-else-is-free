import { AppNotification } from '@api/mappers/notifications';
import { buildBannerContent } from '@utils/notificationBanner';

const base: AppNotification = {
  id: 12,
  type: 'chat.message',
  eventId: 16,
  conversationId: 13,
  title: 'Group Picnic 135',
  body: 'Tester: Hey everyone',
  payload: JSON.stringify({ senderName: 'Tester', senderId: '4' }),
  read: false,
  actionState: 'active',
  createdAt: '2026-09-05T18:31:04.000Z',
};

describe('buildBannerContent', () => {
  it('leads with the sender for chat messages and strips the sender prefix', () => {
    expect(buildBannerContent(base)).toEqual({
      personId: 4,
      kindLabel: 'Message',
      title: 'Tester',
      context: 'Group Picnic 135',
      body: 'Hey everyone',
      avatar: { kind: 'person', name: 'Tester', seed: 4, imageUri: undefined },
    });
  });

  it('uses the sender avatar URL and event cover key from the payload when present', () => {
    const chat = buildBannerContent({
      ...base,
      payload: JSON.stringify({
        senderName: 'Tester',
        senderId: '4',
        senderAvatar: 'https://cdn.example/tester.jpg',
      }),
    });
    expect(chat.avatar.imageUri).toBe('https://cdn.example/tester.jpg');

    const outcome = buildBannerContent({
      ...base,
      type: 'join_request.approved',
      title: 'Sunset Hike',
      body: 'Your request to join Sunset Hike was approved.',
      payload: JSON.stringify({ coverKey: 'sports-badminton-1' }),
    });
    expect(outcome.avatar.kind).toBe('event');
    expect(outcome.avatar.imageUri).toMatch(/sports-badminton-1\.png$/);
  });

  it('leads with the requester for join requests', () => {
    const content = buildBannerContent({
      ...base,
      type: 'join_request.created',
      title: 'Unread Check 136',
      body: 'Tester wants to join your plan Unread Check 136.',
      payload: JSON.stringify({ senderName: 'Tester', requesterId: '4' }),
    });
    expect(content.kindLabel).toBe('Join request');
    expect(content.title).toBe('Tester');
    expect(content.context).toBe('Unread Check 136');
    expect(content.body).toBe('Wants to join your plan');
    expect(content.personId).toBe(4);
    expect(content.avatar).toEqual({
      kind: 'person',
      name: 'Tester',
      seed: 4,
      imageUri: undefined,
    });
  });

  it('leads with the plan and keeps the stored body for outcome types', () => {
    const content = buildBannerContent({
      ...base,
      type: 'event.deleted',
      title: 'Sunset Hike',
      body: 'Sunset Hike has been cancelled and is no longer happening. Explore other events nearby.',
      payload: '{}',
    });
    expect(content.kindLabel).toBe('Cancelled');
    expect(content.title).toBe('Sunset Hike');
    expect(content.context).toBeUndefined();
    expect(content.body).toMatch(/cancelled/);
    expect(content.avatar).toEqual({
      kind: 'event',
      name: 'Sunset Hike',
      seed: 16,
      imageUri: undefined,
    });
  });

  it('falls back to the verbatim body when the payload lacks structured fields', () => {
    const content = buildBannerContent({ ...base, payload: undefined });
    expect(content.title).toBe('Group Picnic 135');
    expect(content.body).toBe('Tester: Hey everyone');
    expect(content.avatar.kind).toBe('event');
  });

  it('labels unknown types as an update', () => {
    expect(buildBannerContent({ ...base, type: 'something.new', payload: '{}' }).kindLabel).toBe(
      'Update',
    );
  });
});
