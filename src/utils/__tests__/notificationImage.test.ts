import { resolveNotificationEventImageUri } from '@utils/notificationImage';

describe('resolveNotificationEventImageUri', () => {
  const events = [
    { id: '7', imageUri: 'https://cdn.example/seven.png' },
    { id: '8', imageUri: undefined },
  ];

  it('returns the cover of the matching event', () => {
    expect(resolveNotificationEventImageUri(events, 7)).toBe('https://cdn.example/seven.png');
  });

  it('returns undefined for unknown, coverless, or missing event ids', () => {
    expect(resolveNotificationEventImageUri(events, 8)).toBeUndefined();
    expect(resolveNotificationEventImageUri(events, 99)).toBeUndefined();
    expect(resolveNotificationEventImageUri(events, undefined)).toBeUndefined();
    expect(resolveNotificationEventImageUri(events, null)).toBeUndefined();
  });
});
