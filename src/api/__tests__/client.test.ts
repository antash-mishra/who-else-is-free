/* global Request, RequestInit, Response */

import fetchMock from 'jest-fetch-mock';

import { ApiError, DEFAULT_TIMEOUT_MS, isAbortError, requestJson } from '@api/client';

jest.mock('@api/config', () => ({
  API_BASE_URL: 'http://localhost:8080',
  WS_BASE_URL: 'ws://localhost:8080',
  CHAT_ENABLED: true,
}));

const BASE_URL = 'http://localhost:8080';

describe('requestJson', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prefixes the API base URL and parses the JSON body', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ data: [1, 2, 3] }));

    const payload = await requestJson<{ data: number[] }>('/api/events');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE_URL}/api/events`);
    expect(payload).toEqual({ data: [1, 2, 3] });
  });

  it('injects an Authorization bearer header when a token is provided', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({}));

    await requestJson('/api/events', { token: 'jwt-token' });

    const init = fetchMock.mock.calls[0][1];
    expect(init?.headers).toEqual({ Authorization: 'Bearer jwt-token' });
  });

  it('merges custom headers and omits Authorization without a token', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({}));

    await requestJson('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });

    const init = fetchMock.mock.calls[0][1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ a: 1 }));
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('uses the provided fetch implementation instead of global fetch', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const payload = await requestJson<{ ok: boolean }>('/api/profile', { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(`${BASE_URL}/api/profile`, expect.any(Object));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(payload).toEqual({ ok: true });
  });

  it('throws an ApiError with the server error message on non-OK responses', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ error: 'Title is required' }), { status: 400 });

    const promise = requestJson('/api/events', { method: 'POST' });

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      message: 'Title is required',
      status: 400,
    });
  });

  it('falls back to a generic status message when the error body is not JSON', async () => {
    fetchMock.mockResponseOnce('not json', { status: 500 });

    await expect(requestJson('/api/events')).rejects.toMatchObject({
      message: 'Request failed with status 500',
      status: 500,
    });
  });

  it('uses a fixed errorMessage without reading the body', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ error: 'server detail' }), { status: 403 });

    await expect(
      requestJson('/api/conversations', { errorMessage: 'Unable to load conversations' }),
    ).rejects.toMatchObject({
      message: 'Unable to load conversations',
      status: 403,
    });
  });

  it('passes the response status to an errorMessage builder', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ error: 'server detail' }), { status: 502 });

    await expect(
      requestJson('/api/covers', {
        errorMessage: (status) => `Request failed with status ${status}`,
      }),
    ).rejects.toMatchObject({
      message: 'Request failed with status 502',
      status: 502,
    });
  });

  it('returns undefined when a successful response has no JSON body', async () => {
    fetchMock.mockResponseOnce('', { status: 200 });

    await expect(requestJson('/api/events/1')).resolves.toBeUndefined();
  });

  it('aborts the request after the timeout elapses', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_input?: string | Request, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        }),
    );

    const promise = requestJson('/api/events', { timeoutMs: 50 });
    const captured = promise.catch((err: unknown) => err);

    jest.advanceTimersByTime(50);

    const err = await captured;
    expect(isAbortError(err)).toBe(true);
  });

  it('attaches an abort signal by default and skips it when timeout is disabled', async () => {
    fetchMock.mockResponse(JSON.stringify({}));

    await requestJson('/api/events');
    expect(fetchMock.mock.calls[0][1]?.signal).toBeDefined();

    await requestJson('/api/events', { timeoutMs: null });
    expect(fetchMock.mock.calls[1][1]?.signal).toBeUndefined();
  });

  it('exposes the default timeout used by refresh call sites', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
  });
});
