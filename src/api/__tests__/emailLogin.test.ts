import fetchMock from 'jest-fetch-mock';

import { postEmailCode, requestEmailCode } from '@api/emailLogin';
import { ApiError } from '@api/errors';

jest.mock('@api/config', () => ({
  API_BASE_URL: 'http://localhost:8080',
  WS_BASE_URL: 'ws://localhost:8080',
  CHAT_ENABLED: true,
}));

const sessionBody = {
  user: { id: 9, name: 'asha', email: 'asha@example.com', profile_complete: false },
  token: 'access',
  expires_at: '2099-01-01T00:00:00Z',
  refresh_token: 'refresh',
  is_new_user: true,
};

describe('email login API', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it('requests a code for the address', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ status: 'sent' }));

    await expect(requestEmailCode('asha@example.com')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/api/email-login/start');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'asha@example.com' });
  });

  it('surfaces the server message when codes are rate limited', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ error: 'Too many codes requested. Wait a minute and try again.' }),
      { status: 429 },
    );

    await expect(requestEmailCode('asha@example.com')).rejects.toMatchObject({
      status: 429,
      message: 'Too many codes requested. Wait a minute and try again.',
    });
  });

  it('returns the session for a correct code', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(sessionBody));

    await expect(postEmailCode('asha@example.com', '123456')).resolves.toEqual(sessionBody);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      email: 'asha@example.com',
      code: '123456',
    });
  });

  it('carries the reason for a wrong code', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        error: "That code isn't right. Check it and try again.",
        code: 'code_invalid',
      }),
      { status: 401 },
    );

    const error = await postEmailCode('asha@example.com', '000000').catch((err) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: 'code_invalid',
      message: "That code isn't right. Check it and try again.",
    });
  });
});
