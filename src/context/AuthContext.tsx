import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState
} from 'react';

import { API_BASE_URL } from '@api/config';

type AuthUser = {
  id: number;
  name: string;
  email: string;
};

interface AuthContextValue {
  user: AuthUser | null;
  isSigningIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

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

      const payload = (await response.json()) as { user: AuthUser };
      setUser(payload.user);
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
  }, []);

  const value = useMemo(
    () => ({
      user,
      isSigningIn,
      signIn,
      signOut
    }),
    [user, isSigningIn, signIn, signOut]
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
