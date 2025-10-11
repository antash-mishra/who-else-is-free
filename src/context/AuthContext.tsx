import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

import { API_BASE_URL } from '@api/config';

import * as SecureStore from 'expo-secure-store';

type AuthUser = {
  id: number;
  name: string;
  email: string;
};

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isSigningIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'whoelseisfree.authToken';
const USER_KEY = 'whoelseisfree.authUser';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    let isActive = true;
    const restoreSession = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY)
        ]);

        if (!isActive) {
          return;
        }

        if (storedToken && storedUser) {
          setToken(storedToken);
          try {
            const parsedUser = JSON.parse(storedUser) as AuthUser;
            setUser(parsedUser);
          } catch (err) {
            console.warn('Failed to parse stored user profile', err);
            setUser(null);
          }
        }
      } catch (err) {
        console.warn('Failed to restore auth session', err);
      }
    };

    restoreSession();

    return () => {
      isActive = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsSigningIn(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const message =
          response.status === 401
            ? 'Invalid email or password.'
            : `Unable to sign in. Server responded with status ${response.status}.`;
        throw new Error(message);
      }

      const payload = (await response.json()) as { user: AuthUser; token: string };
      setUser(payload.user);
      setToken(payload.token);

      await Promise.all([
        SecureStore.setItemAsync(TOKEN_KEY, payload.token),
        SecureStore.setItemAsync(USER_KEY, JSON.stringify(payload.user))
      ]);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unable to sign in. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setToken(null);
    void SecureStore.deleteItemAsync(TOKEN_KEY);
    void SecureStore.deleteItemAsync(USER_KEY);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isSigningIn,
      signIn,
      signOut
    }),
    [user, token, isSigningIn, signIn, signOut]
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
