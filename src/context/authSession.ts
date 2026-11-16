import * as SecureStore from 'expo-secure-store';

import type { UserGender } from '@constants/profileOptions';
import { logger } from '@services/logger';

export type AuthProviderName = 'google' | 'apple' | 'email';

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  gender?: UserGender;
  age?: number;
  avatar?: string;
  profileComplete: boolean;
};

/** Body returned by every sign-in endpoint and by /api/session/refresh. */
export type SessionPayload = {
  user: {
    id: number;
    name: string;
    email: string;
    gender?: UserGender;
    age?: number;
    avatar?: string;
    profile_complete: boolean;
  };
  token: string;
  expires_at?: string;
  is_new_user?: boolean;
  refresh_token?: string;
  refresh_expires_at?: string;
};

export type StoredSession = {
  token: string;
  user: AuthUser;
  provider: AuthProviderName;
  tokenExpiresAt: string | null;
  refreshToken: string | null;
  /** Apple's stable user identifier, used to detect revoked credentials. */
  appleUserId?: string | null;
};

export const TOKEN_KEY = 'whoelseisfree.authToken';
export const USER_KEY = 'whoelseisfree.authUser';
export const AUTH_PROVIDER_KEY = 'whoelseisfree.authProvider';
export const REFRESH_TOKEN_KEY = 'whoelseisfree.refreshToken';
export const TOKEN_EXPIRES_AT_KEY = 'whoelseisfree.authTokenExpiresAt';
export const APPLE_USER_KEY = 'whoelseisfree.appleUserId';

const SESSION_KEYS = [
  TOKEN_KEY,
  USER_KEY,
  AUTH_PROVIDER_KEY,
  REFRESH_TOKEN_KEY,
  TOKEN_EXPIRES_AT_KEY,
  APPLE_USER_KEY,
];

export const toAuthUser = (user: SessionPayload['user']): AuthUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  gender: user.gender,
  age: user.age,
  avatar: user.avatar,
  profileComplete: user.profile_complete,
});

const writeOrDelete = (key: string, value: string | null | undefined) =>
  value ? SecureStore.setItemAsync(key, value) : SecureStore.deleteItemAsync(key);

export const persistSession = async (session: StoredSession): Promise<void> => {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, session.token),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user)),
    SecureStore.setItemAsync(AUTH_PROVIDER_KEY, session.provider),
    writeOrDelete(REFRESH_TOKEN_KEY, session.refreshToken),
    writeOrDelete(TOKEN_EXPIRES_AT_KEY, session.tokenExpiresAt),
    writeOrDelete(APPLE_USER_KEY, session.appleUserId),
  ]);
};

const parseProvider = (stored: string | null): AuthProviderName =>
  stored === 'apple' || stored === 'email' ? stored : 'google';

/** A restored session; `user` is null when the stored profile is unreadable. */
export type RestoredSession = Omit<StoredSession, 'user'> & { user: AuthUser | null };

const parseStoredUser = (stored: string): AuthUser | null => {
  try {
    return JSON.parse(stored) as AuthUser;
  } catch (err) {
    logger.warn('Failed to parse stored user profile', err);
    return null;
  }
};

/**
 * Reads the stored session. Returns null without a token and user. A missing
 * or unknown provider reads as Google, the only provider older builds stored.
 */
export const readStoredSession = async (): Promise<RestoredSession | null> => {
  const [token, user, provider, refreshToken, tokenExpiresAt, appleUserId] = await Promise.all(
    SESSION_KEYS.map((key) => SecureStore.getItemAsync(key)),
  );
  if (!token || !user) {
    return null;
  }
  return {
    token,
    user: parseStoredUser(user),
    provider: parseProvider(provider),
    tokenExpiresAt: tokenExpiresAt ?? null,
    refreshToken: refreshToken ?? null,
    appleUserId: appleUserId ?? null,
  };
};

export const clearPersistedSession = async (): Promise<void> => {
  await Promise.all(SESSION_KEYS.map((key) => SecureStore.deleteItemAsync(key)));
};

const EXPIRY_SKEW_MS = 60_000;

/** True when the access token is missing an expiry or is within a minute of it. */
export const isTokenExpired = (
  expiresAt: string | null,
  now: number = Date.now(),
  skewMs: number = EXPIRY_SKEW_MS,
): boolean => {
  if (!expiresAt) {
    return true;
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return true;
  }
  return expiresAtMs - skewMs <= now;
};
