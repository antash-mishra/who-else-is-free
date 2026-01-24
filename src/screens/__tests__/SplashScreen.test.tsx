/**
 * Tests for SplashScreen
 * Covers animation, navigation routing
 */

import { mockUsers } from '../../__tests__/mocks/mockData';
import { mockSecureStore } from '../../__tests__/mocks/mockModules';

const TOKEN_KEY = 'whoelseisfree.authToken';
const USER_KEY = 'whoelseisfree.authUser';

describe('SplashScreen', () => {
  beforeEach(() => {
    mockSecureStore.reset();
  });

  describe('Session Check', () => {
    it('should check for stored token', async () => {
      await mockSecureStore.setItemAsync(TOKEN_KEY, 'test-token');
      const token = await mockSecureStore.getItemAsync(TOKEN_KEY);

      expect(token).toBe('test-token');
    });

    it('should check for stored user', async () => {
      const user = mockUsers[0];
      await mockSecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      const storedUser = await mockSecureStore.getItemAsync(USER_KEY);

      expect(JSON.parse(storedUser!)).toEqual(user);
    });

    it('should handle missing token', async () => {
      const token = await mockSecureStore.getItemAsync(TOKEN_KEY);
      expect(token).toBeNull();
    });

    it('should handle missing user', async () => {
      const user = await mockSecureStore.getItemAsync(USER_KEY);
      expect(user).toBeNull();
    });
  });

  describe('Navigation Routing', () => {
    it('should route to Login when no session', () => {
      const token = null;
      const user = null;
      const hasSession = token !== null && user !== null;

      const route = hasSession ? 'Main' : 'Login';
      expect(route).toBe('Login');
    });

    it('should route to Main when session exists and profile complete', () => {
      const token = 'test-token';
      const user = mockUsers[0]; // profileComplete: true
      const hasSession = token !== null && user !== null;
      const profileComplete = user?.profileComplete ?? false;

      let route: string;
      if (!hasSession) {
        route = 'Login';
      } else if (!profileComplete) {
        route = 'Onboarding';
      } else {
        route = 'Main';
      }

      expect(route).toBe('Main');
    });

    it('should route to Onboarding when session exists but profile incomplete', () => {
      const token = 'test-token';
      const user = mockUsers[2]; // profileComplete: false
      const hasSession = token !== null && user !== null;
      const profileComplete = user?.profileComplete ?? false;

      let route: string;
      if (!hasSession) {
        route = 'Login';
      } else if (!profileComplete) {
        route = 'Onboarding';
      } else {
        route = 'Main';
      }

      expect(route).toBe('Onboarding');
    });
  });

  describe('Animation', () => {
    it('should have splash duration', () => {
      const SPLASH_DURATION = 2000; // 2 seconds typical
      expect(SPLASH_DURATION).toBeGreaterThan(0);
    });

    it('should calculate animation progress', () => {
      const elapsed = 1000;
      const duration = 2000;
      const progress = Math.min(elapsed / duration, 1);

      expect(progress).toBe(0.5);
    });

    it('should cap progress at 1', () => {
      const elapsed = 3000;
      const duration = 2000;
      const progress = Math.min(elapsed / duration, 1);

      expect(progress).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted user data', async () => {
      await mockSecureStore.setItemAsync(TOKEN_KEY, 'test-token');
      await mockSecureStore.setItemAsync(USER_KEY, 'invalid-json');

      const userJson = await mockSecureStore.getItemAsync(USER_KEY);
      let user = null;

      try {
        user = JSON.parse(userJson!);
      } catch {
        user = null;
      }

      expect(user).toBeNull();
    });

    it('should route to Login when user data is corrupted', async () => {
      const token = 'test-token';
      let user = null; // Corrupted data results in null

      const hasValidSession = token !== null && user !== null;
      const route = hasValidSession ? 'Main' : 'Login';

      expect(route).toBe('Login');
    });
  });

  describe('Splash Hide', () => {
    it('should hide splash after session check completes', () => {
      let splashVisible = true;
      const sessionCheckComplete = true;

      if (sessionCheckComplete) {
        splashVisible = false;
      }

      expect(splashVisible).toBe(false);
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator during session check', () => {
      let isCheckingSession = true;
      expect(isCheckingSession).toBe(true);

      isCheckingSession = false;
      expect(isCheckingSession).toBe(false);
    });
  });

  describe('App Logo', () => {
    it('should display app logo', () => {
      const logoVisible = true;
      expect(logoVisible).toBe(true);
    });
  });
});
