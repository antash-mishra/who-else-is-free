import { AppNotification } from '@api/mappers/notifications';
import { collapseNotifications } from '@utils/notificationCollapse';
import { buildChatGroupDisplay, buildJoinGroupDisplay } from '@utils/notificationDisplay';

const join = (
  id: number,
  eventId: number,
  requester: string,
  title: string,
  overrides: Partial<AppNotification> = {},
): AppNotification => ({
  id,
  type: 'join_request.created',
  eventId,
  title,
  body: `${requester} wants to join your event`,
  read: false,
  createdAt: new Date(2026, 0, 1, 12, 0, id).toISOString(),
  ...overrides,
});

const chat = (
  id: number,
  conversationId: number,
  sender: string,
  message: string,
  overrides: Partial<AppNotification> = {},
): AppNotification => ({
  id,
  type: 'chat.message',
  conversationId,
  title: 'Dancing',
  body: `${sender}: ${message}`,
  payload: JSON.stringify({ senderName: sender }),
  read: false,
  createdAt: new Date(2026, 0, 1, 12, 0, id).toISOString(),
  ...overrides,
});

const groupText = (segments: { text: string }[]) => segments.map((s) => s.text).join('');

describe('collapseNotifications', () => {
  it('collapses unread chat messages per conversation into one group', () => {
    const items = collapseNotifications([
      chat(3, 10, 'Sylvie', 'see you'),
      chat(2, 10, 'Sylvie', 'you there'),
      chat(1, 10, 'Sylvie', 'hi'),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('chatGroup');
    if (items[0].kind === 'chatGroup') {
      expect(items[0].group.count).toBe(3);
      expect(items[0].group.ids).toEqual([3, 2, 1]);
      expect(items[0].group.latestPreview).toBe('see you'); // latest = first (newest-first input)
      expect(items[0].group.senderNames).toEqual(['Sylvie']);
    }
  });

  it('keeps separate conversations as separate groups', () => {
    const items = collapseNotifications([
      chat(2, 10, 'Sylvie', 'hi', { title: 'Dancing' }),
      chat(1, 20, 'Joe', 'yo', { title: 'Hiking' }),
    ]);
    expect(items).toHaveLength(2);
  });

  it('drops read chat notifications entirely', () => {
    const items = collapseNotifications([
      chat(2, 10, 'Sylvie', 'hi'),
      chat(1, 10, 'Sylvie', 'old', { read: true }),
    ]);
    expect(items).toHaveLength(1);
    if (items[0].kind === 'chatGroup') {
      expect(items[0].group.count).toBe(1);
      expect(items[0].group.ids).toEqual([2]);
    }
  });

  it('lists unique senders, latest first', () => {
    const items = collapseNotifications([
      chat(3, 10, 'Sylvie', 'c'),
      chat(2, 10, 'Joe', 'b'),
      chat(1, 10, 'Sylvie', 'a'),
    ]);
    if (items[0].kind === 'chatGroup') {
      expect(items[0].group.senderNames).toEqual(['Sylvie', 'Joe']);
    }
  });

  it('collapses join requests per event, and keeps chat separate', () => {
    const items = collapseNotifications([
      join(3, 1, 'Sylvie', 'Dancing'),
      join(2, 1, 'Joe', 'Dancing'),
      chat(1, 10, 'Sylvie', 'hi'),
    ]);
    expect(items).toHaveLength(2);
    const joinItem = items.find((i) => i.kind === 'joinGroup');
    expect(joinItem?.kind).toBe('joinGroup');
    if (joinItem?.kind === 'joinGroup') {
      expect(joinItem.group.count).toBe(2);
      expect(joinItem.group.requesterNames).toEqual(['Sylvie', 'Joe']);
    }
  });

  it('separates join requests for different events', () => {
    const items = collapseNotifications([
      join(2, 1, 'Sylvie', 'Dancing'),
      join(1, 2, 'Joe', 'Hiking'),
    ]);
    expect(items).toHaveLength(2);
  });

  it('drops read join requests', () => {
    const items = collapseNotifications([
      join(2, 1, 'Sylvie', 'Dancing'),
      join(1, 1, 'Joe', 'Dancing', { read: true }),
    ]);
    if (items[0].kind === 'joinGroup') {
      expect(items[0].group.count).toBe(1);
    }
  });

  it('passes unknown notification types through individually', () => {
    const approved: AppNotification = {
      id: 5,
      type: 'join_request.approved',
      eventId: 1,
      title: 'Dancing',
      body: 'Your request to join was approved!',
      read: false,
      createdAt: new Date(2026, 0, 1, 12, 0, 5).toISOString(),
    };
    const items = collapseNotifications([approved, chat(1, 10, 'Sylvie', 'hi')]);
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('single');
    expect(items[1].kind).toBe('chatGroup');
  });
});

describe('buildJoinGroupDisplay copy', () => {
  const group = (count: number, requesterNames: string[]) => ({
    eventId: 1,
    eventName: 'Dancing',
    requesterNames,
    count,
    createdAt: new Date().toISOString(),
    ids: [],
  });

  it('singular "wants" for one requester', () => {
    expect(groupText(buildJoinGroupDisplay(group(1, ['Sylvie'])).segments)).toBe(
      'Sylvie wants to join your event Dancing',
    );
  });

  it('plural "want" + name list for multiple requesters', () => {
    expect(groupText(buildJoinGroupDisplay(group(3, ['Sylvie', 'Joe', 'Amy'])).segments)).toBe(
      'Sylvie, Joe & 1 other want to join your event Dancing',
    );
  });
});

describe('buildChatGroupDisplay copy', () => {
  const group = (count: number, senderNames: string[]) => ({
    conversationId: 10,
    eventName: 'Dancing',
    senderNames,
    count,
    latestSender: senderNames[0] ?? '',
    latestPreview: 'See you at 7 pm',
    createdAt: new Date().toISOString(),
    ids: [],
  });

  it('singular for one message', () => {
    expect(groupText(buildChatGroupDisplay(group(1, ['Sylvie'])).segments)).toBe(
      'New message from Sylvie in Dancing. Sylvie: See you at 7 pm',
    );
  });

  it('plural for multiple messages', () => {
    expect(groupText(buildChatGroupDisplay(group(3, ['Sylvie'])).segments)).toBe(
      'New messages from Sylvie in Dancing. Sylvie: See you at 7 pm',
    );
  });

  it('leads with the latest sender + "& 1 other" for two senders', () => {
    expect(groupText(buildChatGroupDisplay(group(2, ['Sylvie', 'Joe'])).segments)).toBe(
      'New messages from Sylvie & 1 other in Dancing. Sylvie: See you at 7 pm',
    );
  });

  it('leads with the latest sender + "& 2 others" for three senders', () => {
    expect(groupText(buildChatGroupDisplay(group(3, ['Sylvie', 'Joe', 'Amy'])).segments)).toBe(
      'New messages from Sylvie & 2 others in Dancing. Sylvie: See you at 7 pm',
    );
  });

  it('leads with the latest sender + "& N others" for four+ senders', () => {
    expect(
      groupText(buildChatGroupDisplay(group(4, ['Sylvie', 'Joe', 'Amy', 'Max'])).segments),
    ).toBe('New messages from Sylvie & 3 others in Dancing. Sylvie: See you at 7 pm');
  });

  it('renders the preview inline as "Sender: “message”" in the last segment', () => {
    const segments = buildChatGroupDisplay(group(1, ['Sylvie'])).segments;
    expect(segments[segments.length - 1].text).toBe('Sylvie: See you at 7 pm');
  });
});
