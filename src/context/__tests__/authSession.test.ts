import { mockSecureStore } from '../../__tests__/mocks/mockModules';
import {
  AUTH_PROVIDER_KEY,
  clearPersistedSession,
  isTokenExpired,
  persistSession,
  readStoredSession,
  REFRESH_TOKEN_KEY,
  StoredSession,
  TOKEN_KEY,
  USER_KEY,
} from '../authSession';

const session: StoredSession = {
  token: 'access-token',
  user: { id: 7, name: 'Asha', email: 'asha@example.com', profileComplete: true },
  provider: 'email',
  tokenExpiresAt: '2026-11-13T10:00:00Z',
  refreshToken: 'refresh-key',
  appleUserId: null,
};

describe('authSession', () => {
  beforeEach(() => {
    mockSecureStore.reset();
  });

  it('round-trips every stored field', async () => {
    await persistSession(session);
    await expect(readStoredSession()).resolves.toEqual(session);
  });

  it('keeps an email provider', async () => {
    await persistSession(session);
    expect(mockSecureStore.storage.get(AUTH_PROVIDER_KEY)).toBe('email');
    expect((await readStoredSession())?.provider).toBe('email');
  });

  it('reads a missing provider as google for legacy sessions', async () => {
    mockSecureStore.storage.set(TOKEN_KEY, 'legacy-token');
    mockSecureStore.storage.set(USER_KEY, JSON.stringify(session.user));

    const restored = await readStoredSession();

    expect(restored?.provider).toBe('google');
    expect(restored?.refreshToken).toBeNull();
    expect(restored?.tokenExpiresAt).toBeNull();
  });

  it('returns null without a token and user', async () => {
    mockSecureStore.storage.set(TOKEN_KEY, 'only-token');
    await expect(readStoredSession()).resolves.toBeNull();
  });

  it('clears the refresh key with the rest of the session', async () => {
    await persistSession(session);
    await clearPersistedSession();
    expect(mockSecureStore.storage.get(REFRESH_TOKEN_KEY)).toBeUndefined();
    await expect(readStoredSession()).resolves.toBeNull();
  });

  describe('isTokenExpired', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');

    it('treats an unknown expiry as expired', () => {
      expect(isTokenExpired(null, now)).toBe(true);
    });

    it('treats a past expiry as expired', () => {
      expect(isTokenExpired('2026-11-12T09:00:00Z', now)).toBe(true);
    });

    it('treats an expiry inside the skew window as expired', () => {
      expect(isTokenExpired('2026-11-12T10:00:30Z', now)).toBe(true);
    });

    it('treats a later expiry as valid', () => {
      expect(isTokenExpired('2026-11-12T10:05:00Z', now)).toBe(false);
    });
  });
});
