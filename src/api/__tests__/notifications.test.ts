import fetchMock from 'jest-fetch-mock';

import { resolveNotificationAction } from '@api/notifications';

jest.mock('@api/config', () => ({
  API_BASE_URL: 'http://localhost:8080',
  WS_BASE_URL: 'ws://localhost:8080',
  CHAT_ENABLED: true,
}));

describe('notification actions API', () => {
  beforeEach(() => fetchMock.resetMocks());

  it('posts every collapsed notification id and returns the typed destination', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        status: 'active',
        destination: 'join_requests',
        event_id: 7,
        conversation_id: 9,
        title: 'Hike',
      }),
    );

    await expect(
      resolveNotificationAction('jwt', {
        notification_ids: [3, 2, 1],
        mark_handled: true,
      }),
    ).resolves.toMatchObject({ destination: 'join_requests', event_id: 7 });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8080/api/notifications/actions/resolve',
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ notification_ids: [3, 2, 1], mark_handled: true }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt',
      },
    });
  });
});
