import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Platform } from 'react-native';

import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL } from '@api/config';
import { postEmailCode, requestEmailCode } from '@api/emailLogin';
import { ApiError, extractServerErrorMessage } from '@api/errors';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '@constants/google';
import type { UserGender } from '@constants/profileOptions';
import { trackEvent } from '@services/analytics';
import { logger } from '@services/logger';

import {
  type AuthProviderName,
  type AuthUser,
  type SessionPayload,
  clearPersistedSession,
  isTokenExpired,
  persistSession,
  readStoredSession,
  toAuthUser,
  USER_KEY,
} from './authSession';

export type { AuthProviderName, AuthUser } from './authSession';

type ProfileUpdateData = {
  name: string;
  gender: UserGender;
  age: number;
  avatar?: string;
};

export type { ApiError } from '@api/errors';

type AuthFetchOptions = {
  includeAuth?: boolean;
  retryOnUnauthorized?: boolean;
};

type RefreshSessionOptions = {
  /** Return the current token without a request while it has not expired. */
  onlyIfExpired?: boolean;
};

type RefreshOutcome =
  | { status: 'refreshed'; token: string }
  | { status: 'rejected' }
  | { status: 'unavailable' };

/** Session details that never render, kept beside the token for refresh. */
type SessionMeta = {
  provider: AuthProviderName | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  appleUserId: string | null;
};

const EMPTY_SESSION_META: SessionMeta = {
  provider: null,
  refreshToken: null,
  tokenExpiresAt: null,
  appleUserId: null,
};

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isSigningIn: boolean;
  signInWithGoogle: (idToken: string) => Promise<AuthUser>;
  signInWithApple: (idToken: string, appleUserId?: string) => Promise<AuthUser>;
  /** DEV ONLY. Issues a real session token for a fixed test user via /api/dev-login.
   *  Requires the backend to be started with DEV_LOGIN_ENABLED=1. */
  signInWithDevUser: (
    email: string,
    name?: string,
    options?: { profileComplete?: boolean },
  ) => Promise<AuthUser>;
  /** Emails a 6-digit sign-in code to `email`. */
  startEmailSignIn: (email: string) => Promise<void>;
  /** Signs in with an emailed code; wrong/expired codes throw an ApiError with `code`. */
  verifyEmailCode: (email: string, code: string) => Promise<AuthUser>;
  signOut: () => void;
  refreshSessionSilently: (options?: RefreshSessionOptions) => Promise<string | null>;
  updateProfile: (data: ProfileUpdateData) => Promise<AuthUser>;
  deleteAccount: () => Promise<void>;
  handleSessionExpired: () => void;
  authFetch: (
    input: RequestInfo | URL,
    init?: RequestInit,
    options?: AuthFetchOptions,
  ) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * True only when Apple reports that the person revoked weif under Sign in with
 * Apple (or the Apple ID is gone). A failed check counts as not revoked, so a
 * check error never signs anyone out.
 */
const isAppleCredentialRevoked = async (appleUserId: string | null): Promise<boolean> => {
  if (Platform.OS !== 'ios' || !appleUserId) {
    return false;
  }
  try {
    const state = await AppleAuthentication.getCredentialStateAsync(appleUserId);
    return (
      state === AppleAuthentication.AppleAuthenticationCredentialState.REVOKED ||
      state === AppleAuthentication.AppleAuthenticationCredentialState.NOT_FOUND
    );
  } catch (err) {
    logger.warn('Apple credential state check failed', err);
    return false;
  }
};

export const AuthProvider = ({
  children,
  onSessionExpired,
}: {
  children: ReactNode;
  /** Invoked after an expired session is cleared. Navigation lives with the caller, not in this context. */
  onSessionExpired?: () => void;
}) => {
  const onSessionExpiredRef = useRef(onSessionExpired);
  onSessionExpiredRef.current = onSessionExpired;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<AuthProviderName | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const refreshInFlightRef = useRef<Promise<RefreshOutcome> | null>(null);
  const tokenRef = useRef<string | null>(null);
  const sessionMetaRef = useRef<SessionMeta>(EMPTY_SESSION_META);
  const handleSessionExpiredRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const configureGoogleSignIn = async () => {
      try {
        await GoogleSignin.configure({
          webClientId: GOOGLE_WEB_CLIENT_ID,
          iosClientId: GOOGLE_IOS_CLIENT_ID,
          offlineAccess: true,
        });
      } catch (err) {
        logger.warn('Google Sign-In native module unavailable. Silent auth disabled.', err);
      }
    };
    configureGoogleSignIn().catch((err) => {
      logger.warn('Failed to configure Google Sign-In', err);
    });
  }, []);

  useEffect(() => {
    let isActive = true;
    const restoreSession = async () => {
      try {
        const stored = await readStoredSession();
        if (!isActive || !stored) {
          return;
        }
        tokenRef.current = stored.token;
        sessionMetaRef.current = {
          provider: stored.provider,
          refreshToken: stored.refreshToken,
          tokenExpiresAt: stored.tokenExpiresAt,
          appleUserId: stored.appleUserId ?? null,
        };
        setToken(stored.token);
        setAuthProvider(stored.provider);
        setUser(stored.user);
        if (
          stored.provider === 'apple' &&
          (await isAppleCredentialRevoked(stored.appleUserId ?? null)) &&
          isActive
        ) {
          handleSessionExpiredRef.current();
        }
      } catch (err) {
        logger.warn('Failed to restore auth session', err);
      }
    };

    restoreSession();

    return () => {
      isActive = false;
    };
  }, []);

  /** Applies a session from any sign-in or refresh response and persists it. */
  const applySession = useCallback(
    async (
      payload: SessionPayload,
      provider: AuthProviderName,
      appleUserId: string | null = sessionMetaRef.current.appleUserId,
    ): Promise<AuthUser> => {
      const authUser = toAuthUser(payload.user);
      // A response without a refresh key (an older server) keeps none: the
      // previous key may already be rotated away.
      const refreshToken = payload.refresh_token ?? null;
      const tokenExpiresAt = payload.expires_at ?? null;
      tokenRef.current = payload.token;
      sessionMetaRef.current = { provider, refreshToken, tokenExpiresAt, appleUserId };
      setUser(authUser);
      setToken(payload.token);
      setAuthProvider(provider);
      await persistSession({
        token: payload.token,
        user: authUser,
        provider,
        refreshToken,
        tokenExpiresAt,
        appleUserId,
      });
      return authUser;
    },
    [],
  );

  const signInWithProvider = useCallback(
    async (
      provider: AuthProviderName,
      endpoint: 'google-login' | 'apple-login',
      idToken: string,
      unauthorizedMessage: string,
      appleUserId: string | null = null,
    ) => {
      setIsSigningIn(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id_token: idToken }),
        });

        if (!response.ok) {
          const message =
            response.status === 401
              ? unauthorizedMessage
              : `Unable to sign in. Server responded with status ${response.status}.`;
          throw new Error(message);
        }

        const payload = (await response.json()) as SessionPayload;
        const authUser = await applySession(payload, provider, appleUserId);

        trackEvent(payload.is_new_user ? 'signup_succeeded' : 'login_succeeded', {
          provider,
        }).catch(() => undefined);

        return authUser;
      } catch (error) {
        trackEvent('login_failed', {
          provider,
          failure_stage: 'server',
        }).catch(() => undefined);
        if (error instanceof Error) {
          throw error;
        }
        throw new Error('Unable to sign in. Please try again.');
      } finally {
        setIsSigningIn(false);
      }
    },
    [applySession],
  );

  const signInWithGoogle = useCallback(
    async (idToken: string) =>
      signInWithProvider('google', 'google-login', idToken, 'Unable to sign in with Google.'),
    [signInWithProvider],
  );

  const signInWithApple = useCallback(
    async (idToken: string, appleUserId?: string) =>
      signInWithProvider(
        'apple',
        'apple-login',
        idToken,
        'Unable to sign in with Apple.',
        appleUserId ?? null,
      ),
    [signInWithProvider],
  );

  // DEV ONLY: signs in a fixed test user without going through Google/Apple.
  // The route only exists on the backend when DEV_LOGIN_ENABLED=1, so in any
  // release or non-dev server this call fails with 404 and surfaces an error
  // Alert. Gated client-side, this is safe to always be present in the bundle:
  // the worst case in prod is a 404 nobody can reach because the button that
  // calls it is __DEV__-only.
  const signInWithDevUser = useCallback(
    async (
      email: string,
      name: string = 'Tester',
      options?: { profileComplete?: boolean },
    ): Promise<AuthUser> => {
      const profileComplete = options?.profileComplete ?? true;
      setIsSigningIn(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/dev-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name, profile_complete: profileComplete }),
        });
        if (response.status === 404) {
          throw new Error(
            'Dev login is not enabled on the server. Start the backend with DEV_LOGIN_ENABLED=1.',
          );
        }
        if (!response.ok) {
          throw new Error(`Unable to dev-login. Server responded with status ${response.status}.`);
        }
        const payload = (await response.json()) as SessionPayload;
        const authUser = await applySession(payload, 'google', null);
        trackEvent('login_succeeded', { provider: 'dev' }).catch(() => undefined);
        return authUser;
      } catch (error) {
        trackEvent('login_failed', { provider: 'dev', failure_stage: 'server' }).catch(
          () => undefined,
        );
        if (error instanceof Error) {
          throw error;
        }
        throw new Error('Unable to sign in via dev-login. Please try again.');
      } finally {
        setIsSigningIn(false);
      }
    },
    [applySession],
  );

  const startEmailSignIn = useCallback(async (email: string): Promise<void> => {
    trackEvent('login_started', { provider: 'email' }).catch(() => undefined);
    await requestEmailCode(email);
  }, []);

  const verifyEmailCode = useCallback(
    async (email: string, code: string): Promise<AuthUser> => {
      setIsSigningIn(true);
      try {
        const payload = await postEmailCode(email, code);
        const authUser = await applySession(payload, 'email', null);
        trackEvent(payload.is_new_user ? 'signup_succeeded' : 'login_succeeded', {
          provider: 'email',
        }).catch(() => undefined);
        return authUser;
      } catch (error) {
        const isCodeError =
          error instanceof ApiError &&
          (error.code === 'code_invalid' || error.code === 'code_expired');
        trackEvent('login_failed', {
          provider: 'email',
          failure_stage: isCodeError ? 'code' : 'server',
        }).catch(() => undefined);
        throw error;
      } finally {
        setIsSigningIn(false);
      }
    },
    [applySession],
  );

  /** Trades the stored refresh key for a new session. */
  const exchangeRefreshToken = useCallback(
    async (refreshToken: string): Promise<RefreshOutcome> => {
      const response = await fetch(`${API_BASE_URL}/api/session/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch((err: unknown) => {
        logger.warn('Session refresh unavailable', err);
        return null;
      });
      if (!response) {
        return { status: 'unavailable' };
      }
      if (response.status === 401) {
        sessionMetaRef.current = { ...sessionMetaRef.current, refreshToken: null };
        return { status: 'rejected' };
      }
      if (!response.ok) {
        return { status: 'unavailable' };
      }
      try {
        const payload = (await response.json()) as SessionPayload;
        await applySession(payload, sessionMetaRef.current.provider ?? 'google');
        return { status: 'refreshed', token: payload.token };
      } catch (err) {
        logger.warn('Failed to apply refreshed session', err);
        return { status: 'unavailable' };
      }
    },
    [applySession],
  );

  const refreshWithGoogle = useCallback(async (): Promise<RefreshOutcome> => {
    try {
      const result = await GoogleSignin.signInSilently();
      const idToken = (result as { idToken?: string | null })?.idToken ?? result?.data?.idToken;
      if (!idToken) {
        return { status: 'rejected' };
      }
      await signInWithGoogle(idToken);
      return tokenRef.current
        ? { status: 'refreshed', token: tokenRef.current }
        : { status: 'rejected' };
    } catch {
      return { status: 'rejected' };
    }
  }, [signInWithGoogle]);

  /**
   * Renews the session: the refresh key first (every provider), then Google
   * silent sign-in for Google sessions without a working key. A network
   * failure is 'unavailable' and never signs the person out.
   */
  const refreshSession = useCallback((): Promise<RefreshOutcome> => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }
    const refreshPromise = (async (): Promise<RefreshOutcome> => {
      const { refreshToken, provider, appleUserId } = sessionMetaRef.current;
      if (provider === 'apple' && (await isAppleCredentialRevoked(appleUserId))) {
        return { status: 'rejected' };
      }
      if (refreshToken) {
        const outcome = await exchangeRefreshToken(refreshToken);
        if (outcome.status !== 'rejected') {
          return outcome;
        }
      }
      if (provider === 'google') {
        return refreshWithGoogle();
      }
      return { status: 'rejected' };
    })();

    refreshInFlightRef.current = refreshPromise;
    refreshPromise.finally(() => {
      if (refreshInFlightRef.current === refreshPromise) {
        refreshInFlightRef.current = null;
      }
    });
    return refreshPromise;
  }, [exchangeRefreshToken, refreshWithGoogle]);

  const refreshSessionSilently = useCallback(
    async (options: RefreshSessionOptions = {}): Promise<string | null> => {
      if (
        options.onlyIfExpired &&
        tokenRef.current &&
        !isTokenExpired(sessionMetaRef.current.tokenExpiresAt)
      ) {
        return tokenRef.current;
      }
      const outcome = await refreshSession();
      return outcome.status === 'refreshed' ? outcome.token : null;
    },
    [refreshSession],
  );

  const clearStoredSession = useCallback(async () => {
    tokenRef.current = null;
    sessionMetaRef.current = EMPTY_SESSION_META;
    setUser(null);
    setToken(null);
    setAuthProvider(null);

    await clearPersistedSession();
  }, []);

  const signOut = useCallback(() => {
    const { refreshToken } = sessionMetaRef.current;
    if (refreshToken) {
      // Best effort: signing out must also work offline.
      fetch(`${API_BASE_URL}/api/session/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch((err) => logger.warn('Failed to revoke refresh key on sign out', err));
    }
    void clearStoredSession();
  }, [clearStoredSession]);

  const handleSessionExpired = useCallback(() => {
    signOut();
    onSessionExpiredRef.current?.();
  }, [signOut]);
  useEffect(() => {
    handleSessionExpiredRef.current = handleSessionExpired;
  }, [handleSessionExpired]);

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}, options: AuthFetchOptions = {}) => {
      const includeAuth = options.includeAuth ?? true;
      const retryOnUnauthorized = options.retryOnUnauthorized ?? true;
      const baseHeaders = new Headers(init.headers);
      const hasAuthHeader = baseHeaders.has('Authorization');
      const hasAuthToken = Boolean(token) || hasAuthHeader;

      const buildInit = (overrideToken?: string) => {
        const headers = new Headers(baseHeaders);
        if (includeAuth) {
          if (overrideToken) {
            headers.set('Authorization', `Bearer ${overrideToken}`);
          } else if (!hasAuthHeader && token) {
            headers.set('Authorization', `Bearer ${token}`);
          }
        }
        return {
          ...init,
          headers,
        };
      };

      let response = await fetch(input, buildInit());
      if (response.status === 401 && includeAuth && retryOnUnauthorized && hasAuthToken) {
        const outcome = await refreshSession();
        if (outcome.status === 'unavailable') {
          // Keep the session: the refresh can be retried once the network is back.
          return response;
        }
        if (outcome.status === 'refreshed') {
          response = await fetch(input, buildInit(outcome.token));
        }
      }

      if (response.status === 401 && includeAuth && hasAuthToken) {
        handleSessionExpired();
      }

      return response;
    },
    [handleSessionExpired, refreshSession, token],
  );

  const updateProfile = useCallback(
    async (data: ProfileUpdateData): Promise<AuthUser> => {
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await authFetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const message = await extractServerErrorMessage(
          response,
          response.status === 401
            ? 'Session expired. Please sign in again.'
            : 'Failed to update profile',
        );
        throw new ApiError(message, response.status);
      }

      const payload = (await response.json()) as {
        user: {
          id: number;
          name: string;
          email: string;
          gender?: UserGender;
          age?: number;
          avatar?: string;
          profile_complete: boolean;
        };
      };
      const authUser: AuthUser = {
        id: payload.user.id,
        name: payload.user.name,
        email: payload.user.email,
        gender: payload.user.gender,
        age: payload.user.age,
        avatar: payload.user.avatar,
        profileComplete: payload.user.profile_complete,
      };
      setUser(authUser);

      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(authUser));

      if (!user?.profileComplete && authUser.profileComplete) {
        // The user's own gender and age stay out of analytics; the privacy
        // policy and store privacy labels do not declare them there.
        trackEvent('profile_completed', { provider: authProvider }).catch(() => undefined);
      }

      return authUser;
    },
    [authFetch, authProvider, token, user?.profileComplete],
  );

  const deleteAccount = useCallback(async (): Promise<void> => {
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await authFetch(`${API_BASE_URL}/api/profile`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const message = await extractServerErrorMessage(
        response,
        response.status === 401
          ? 'Session expired. Please sign in again.'
          : 'Failed to delete account',
      );
      throw new ApiError(message, response.status);
    }

    // Clear local auth only after the server confirms the account was deleted.
    // If the API fails, keeping the session avoids stranding the user locally.
    await clearStoredSession();
  }, [authFetch, clearStoredSession, token]);

  const value = useMemo(
    () => ({
      user,
      token,
      isSigningIn,
      signInWithGoogle,
      signInWithApple,
      signInWithDevUser,
      startEmailSignIn,
      verifyEmailCode,
      signOut,
      refreshSessionSilently,
      updateProfile,
      deleteAccount,
      handleSessionExpired,
      authFetch,
    }),
    [
      user,
      token,
      isSigningIn,
      signInWithGoogle,
      signInWithApple,
      signInWithDevUser,
      startEmailSignIn,
      verifyEmailCode,
      signOut,
      refreshSessionSilently,
      updateProfile,
      deleteAccount,
      handleSessionExpired,
      authFetch,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
