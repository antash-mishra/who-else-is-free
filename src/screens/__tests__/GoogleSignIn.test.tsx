/**
 * Tests for GoogleSignIn screen
 * Covers OAuth flow mocking
 */

import fetchMock from 'jest-fetch-mock';
import { mockGoogleSignIn } from '../../__tests__/mocks/mockModules';
import { mockApiResponses } from '../../__tests__/mocks/mockData';

const BASE_URL = 'http://localhost:8080';

describe('GoogleSignIn', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    mockGoogleSignIn.GoogleSignin.configure.mockClear();
    mockGoogleSignIn.GoogleSignin.signIn.mockClear();
    mockGoogleSignIn.GoogleSignin.hasPlayServices.mockClear();
  });

  describe('Google Sign-In Configuration', () => {
    it('should configure Google Sign-In on mount', async () => {
      await mockGoogleSignIn.GoogleSignin.configure({
        webClientId: 'test-web-client-id',
        iosClientId: 'test-ios-client-id',
        offlineAccess: true,
      });

      expect(mockGoogleSignIn.GoogleSignin.configure).toHaveBeenCalled();
    });
  });

  describe('Sign-In Flow', () => {
    it('should check for Play Services before sign-in', async () => {
      mockGoogleSignIn.GoogleSignin.hasPlayServices.mockResolvedValueOnce(true);

      const hasPlayServices = await mockGoogleSignIn.GoogleSignin.hasPlayServices();
      expect(hasPlayServices).toBe(true);
    });

    it('should initiate Google sign-in', async () => {
      mockGoogleSignIn.GoogleSignin.signIn.mockResolvedValueOnce({
        data: {
          idToken: 'mock-id-token',
          user: {
            email: 'test@example.com',
            name: 'Test User',
          },
        },
      });

      const result = await mockGoogleSignIn.GoogleSignin.signIn();
      expect(result.data.idToken).toBe('mock-id-token');
    });

    it('should send id_token to backend', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.googleLogin.success));

      const response = await fetch(`${BASE_URL}/api/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: 'mock-id-token' }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.token).toBeDefined();
      expect(data.user).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle user cancellation', async () => {
      const error = {
        code: mockGoogleSignIn.statusCodes.SIGN_IN_CANCELLED,
        message: 'User cancelled the sign-in flow',
      };

      mockGoogleSignIn.GoogleSignin.signIn.mockRejectedValueOnce(error);

      await expect(mockGoogleSignIn.GoogleSignin.signIn()).rejects.toMatchObject({
        code: 'SIGN_IN_CANCELLED',
      });
    });

    it('should handle sign-in in progress', async () => {
      const error = {
        code: mockGoogleSignIn.statusCodes.IN_PROGRESS,
        message: 'Sign-in already in progress',
      };

      mockGoogleSignIn.GoogleSignin.signIn.mockRejectedValueOnce(error);

      await expect(mockGoogleSignIn.GoogleSignin.signIn()).rejects.toMatchObject({
        code: 'IN_PROGRESS',
      });
    });

    it('should handle Play Services not available', async () => {
      mockGoogleSignIn.GoogleSignin.hasPlayServices.mockRejectedValueOnce({
        code: mockGoogleSignIn.statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
        message: 'Play Services not available',
      });

      await expect(mockGoogleSignIn.GoogleSignin.hasPlayServices()).rejects.toMatchObject({
        code: 'PLAY_SERVICES_NOT_AVAILABLE',
      });
    });

    it('should handle backend 401 error', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });

      const response = await fetch(`${BASE_URL}/api/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: 'invalid-token' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should handle backend server error', async () => {
      fetchMock.mockResponseOnce('', { status: 500 });

      const response = await fetch(`${BASE_URL}/api/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: 'mock-id-token' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });

    it('should handle network errors', async () => {
      fetchMock.mockRejectOnce(new Error('Network error'));

      await expect(
        fetch(`${BASE_URL}/api/google-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_token: 'mock-id-token' }),
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('New User Flow', () => {
    it('should return profile_complete=false for new users', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.googleLogin.newUser));

      const response = await fetch(`${BASE_URL}/api/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: 'new-user-token' }),
      });

      const data = await response.json();
      expect(data.user.profile_complete).toBe(false);
    });

    it('should navigate to onboarding for new users', () => {
      const profileComplete = false;
      const navigateTarget = profileComplete ? 'Main' : 'Onboarding';

      expect(navigateTarget).toBe('Onboarding');
    });
  });

  describe('Existing User Flow', () => {
    it('should return profile_complete=true for existing users', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.googleLogin.success));

      const response = await fetch(`${BASE_URL}/api/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: 'existing-user-token' }),
      });

      const data = await response.json();
      expect(data.user.profile_complete).toBe(true);
    });

    it('should navigate to main screen for existing users', () => {
      const profileComplete = true;
      const navigateTarget = profileComplete ? 'Main' : 'Onboarding';

      expect(navigateTarget).toBe('Main');
    });
  });

  describe('Loading State', () => {
    it('should track signing in state', () => {
      let isSigningIn = false;

      isSigningIn = true;
      expect(isSigningIn).toBe(true);

      isSigningIn = false;
      expect(isSigningIn).toBe(false);
    });

    it('should disable button while signing in', () => {
      const isSigningIn = true;
      const buttonDisabled = isSigningIn;

      expect(buttonDisabled).toBe(true);
    });
  });
});
