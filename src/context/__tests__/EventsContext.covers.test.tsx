import React from 'react';

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { EventsProvider, useEvents } from '../EventsContext';

let mockUser: { id: number; name: string } | null = { id: 1, name: 'Synthetic host' };
const mockRequest = jest.fn();
const mockUpload = jest.fn();
jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, token: mockUser ? 'token' : null, authFetch: jest.fn() }),
}));
jest.mock('@api/client', () => ({
  requestJson: (...args: unknown[]) => mockRequest(...args),
  ApiError: class extends Error {},
}));
jest.mock('@api/eventCovers', () => ({
  uploadEventCover: (...args: unknown[]) => mockUpload(...args),
  resolveUploadedCoverUrl: (url: string) => url,
}));
const draft = {
  title: 'Synthetic photo plan',
  location: 'Test place',
  time: '12:00',
  eventDate: '2030-01-01',
  gender: 'Any',
  minAge: 20,
  maxAge: 60,
  ageGroupIds: ['20-25', '40+'],
  groupType: 'Single' as const,
  coverKey: 'sports-badminton-1',
  coverAsset: { uri: 'file:///synthetic.jpg' },
  userId: 1,
  hostName: 'Synthetic host',
};
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EventsProvider>{children}</EventsProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 1, name: 'Synthetic host' };
  mockUpload.mockResolvedValue({ id: 'owned-photo', url: 'https://example.test/photo.jpg' });
  mockRequest.mockImplementation(async (_path: string, options: { method?: string }) =>
    options.method === 'POST' ? { id: 99 } : { data: [] },
  );
});
it('reuses an uploaded cover after event-save failure and keeps exact age groups', async () => {
  let fail = true;
  mockRequest.mockImplementation(async (_path: string, options: { method?: string }) => {
    if (options.method === 'POST') {
      if (fail) throw new Error('offline');
      return { id: 99 };
    }
    return { data: [] };
  });
  const { result } = renderHook(() => useEvents(), { wrapper });
  await waitFor(() => expect(result.current.hasLoadedEvents).toBe(true));
  await act(async () => {
    await expect(result.current.addUserEvent(draft)).rejects.toThrow('offline');
  });
  fail = false;
  await act(async () => {
    await result.current.addUserEvent(draft);
  });
  expect(mockUpload).toHaveBeenCalledTimes(1);
  const posts = mockRequest.mock.calls.filter(([, options]) => options.method === 'POST');
  expect(JSON.parse(posts[1][1].body)).toMatchObject({
    cover_upload_id: 'owned-photo',
    age_group_ids: ['20-25', '40+'],
  });
  expect(result.current.events[0]).toMatchObject({ imageUri: 'https://example.test/photo.jpg' });
});
it('retains a failed guest draft and exposes a retryable error after sign-in', async () => {
  mockUser = null;
  const { result, rerender } = renderHook(() => useEvents(), { wrapper });
  await act(async () => {
    result.current.queueGuestEvent(draft);
  });
  mockRequest.mockImplementation(async (_path: string, options: { method?: string }) => {
    if (options.method === 'POST') throw new Error('offline');
    return { data: [] };
  });
  mockUser = { id: 1, name: 'Synthetic host' };
  rerender({});
  await waitFor(() =>
    expect(result.current).toMatchObject({ guestSubmissionError: expect.any(String) }),
  );
  rerender({});
  expect(mockUpload).toHaveBeenCalledTimes(1);
});
