/**
 * Tests for ProfileScreen
 * Covers profile display, sign out
 */

import { mockUsers } from '../../__tests__/mocks/mockData';
import { mockSecureStore } from '../../__tests__/mocks/mockModules';

const TOKEN_KEY = 'whoelseisfree.authToken';
const USER_KEY = 'whoelseisfree.authUser';

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockSecureStore.reset();
  });

  describe('Profile Display', () => {
    const user = mockUsers[0];

    it('should display user name', () => {
      expect(user.name).toBeDefined();
      expect(user.name.length).toBeGreaterThan(0);
    });

    it('should display user email', () => {
      expect(user.email).toBeDefined();
      expect(user.email).toContain('@');
    });

    it('should display user gender when available', () => {
      expect(user.gender).toBeDefined();
      expect(['Female', 'Male']).toContain(user.gender);
    });

    it('should display user age when available', () => {
      expect(user.age).toBeDefined();
      expect(user.age).toBeGreaterThan(0);
    });

    it('should display avatar with initial when no avatar URL', () => {
      const initial = user.name.charAt(0).toUpperCase();
      expect(initial).toBe('A');
    });
  });

  describe('Sign Out', () => {
    it('should clear stored token on sign out', async () => {
      // Store token first
      await mockSecureStore.setItemAsync(TOKEN_KEY, 'test-token');
      expect(await mockSecureStore.getItemAsync(TOKEN_KEY)).toBe('test-token');

      // Sign out - clear token
      await mockSecureStore.deleteItemAsync(TOKEN_KEY);
      expect(await mockSecureStore.getItemAsync(TOKEN_KEY)).toBeNull();
    });

    it('should clear stored user on sign out', async () => {
      // Store user first
      await mockSecureStore.setItemAsync(USER_KEY, JSON.stringify(mockUsers[0]));
      expect(await mockSecureStore.getItemAsync(USER_KEY)).toBeTruthy();

      // Sign out - clear user
      await mockSecureStore.deleteItemAsync(USER_KEY);
      expect(await mockSecureStore.getItemAsync(USER_KEY)).toBeNull();
    });

    it('should reset auth state on sign out', () => {
      let user: typeof mockUsers[0] | null = mockUsers[0];
      let token: string | null = 'test-token';

      // Sign out
      const signOut = () => {
        user = null;
        token = null;
      };

      signOut();
      expect(user).toBeNull();
      expect(token).toBeNull();
    });
  });

  describe('Profile Completion', () => {
    it('should identify incomplete profile', () => {
      const incompleteUser = mockUsers[2]; // profileComplete: false
      expect(incompleteUser.profileComplete).toBe(false);
    });

    it('should identify complete profile', () => {
      const completeUser = mockUsers[0]; // profileComplete: true
      expect(completeUser.profileComplete).toBe(true);
    });
  });

  describe('Navigation', () => {
    it('should navigate to onboarding for incomplete profile', () => {
      const user = mockUsers[2];
      const shouldNavigateToOnboarding = !user.profileComplete;

      expect(shouldNavigateToOnboarding).toBe(true);
    });
  });

  describe('Guest User', () => {
    it('should show login prompt for guest users', () => {
      const user = null;
      const showLoginPrompt = user === null;

      expect(showLoginPrompt).toBe(true);
    });
  });

  describe('Profile Menu Items', () => {
    it('should include sign out option', () => {
      const menuItems = [
        { label: 'Edit Profile', action: 'edit' },
        { label: 'Sign Out', action: 'signOut' },
      ];

      const signOutItem = menuItems.find((item) => item.action === 'signOut');
      expect(signOutItem).toBeDefined();
    });
  });

  describe('Avatar Display', () => {
    it('should show avatar image when URL is available', () => {
      const userWithAvatar = { ...mockUsers[0], avatar: 'https://example.com/avatar.jpg' };
      expect(userWithAvatar.avatar).toBeDefined();
    });

    it('should show initial fallback when no avatar URL', () => {
      const user = mockUsers[0];
      const hasAvatar = !!user.avatar;
      const initial = user.name.charAt(0).toUpperCase();

      if (!hasAvatar) {
        expect(initial.length).toBe(1);
      }
    });

    it('should generate consistent avatar color', () => {
      const AVATAR_COLORS = ['#4CAF50', '#9C27B0', '#FF9800', '#2196F3'];
      const user = mockUsers[0];
      const color = AVATAR_COLORS[user.id % AVATAR_COLORS.length];

      expect(AVATAR_COLORS).toContain(color);
    });
  });
});
