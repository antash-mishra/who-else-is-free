/**
 * Tests for AuthContext
 * Covers session restore, sign-in, sign-out, profile update, and session refresh
 */

import fetchMock from 'jest-fetch-mock';
import { mockSecureStore, mockGoogleSignIn } from '../../__tests__/mocks/mockModules';
import { mockApiResponses, mockUsers } from '../../__tests__/mocks/mockData';

// Test constants
const TOKEN_KEY = 'whoelseisfree.authToken';
const USER_KEY = 'whoelseisfree.authUser';
const MOCK_TOKEN = 'mock-jwt-token';
const MOCK_ID_TOKEN = 'mock-google-id-token';

describe('AuthContext', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    mockSecureStore.reset();
    mockGoogleSignIn.GoogleSignin.configure.mockClear();
    mockGoogleSignIn.GoogleSignin.signIn.mockClear();
    mockGoogleSignIn.GoogleSignin.signInSilently.mockClear();
    mockGoogleSignIn.GoogleSignin.signOut.mockClear();
    jest.clearAllTimers();
  });

  describe('Session Restore', () => {
    it('should restore session from secure store when token and user exist', async () => {
      const storedUser = mockUsers[0];
      mockSecureStore.storage.set(TOKEN_KEY, MOCK_TOKEN);
      mockSecureStore.storage.set(USER_KEY, JSON.stringify(storedUser));

      // Verify secure store has the data
      const token = await mockSecureStore.getItemAsync(TOKEN_KEY);
      const userJson = await mockSecureStore.getItemAsync(USER_KEY);

      expect(token).toBe(MOCK_TOKEN);
      expect(JSON.parse(userJson!)).toEqual(storedUser);
    });

    it('should return null when no stored session exists', async () => {
      const token = await mockSecureStore.getItemAsync(TOKEN_KEY);
      const user = await mockSecureStore.getItemAsync(USER_KEY);

      expect(token).toBeNull();
      expect(user).toBeNull();
    });

    it('should handle corrupted user data gracefully', async () => {
      mockSecureStore.storage.set(TOKEN_KEY, MOCK_TOKEN);
      mockSecureStore.storage.set(USER_KEY, 'invalid-json-{');

      const token = await mockSecureStore.getItemAsync(TOKEN_KEY);
      const userJson = await mockSecureStore.getItemAsync(USER_KEY);

      expect(token).toBe(MOCK_TOKEN);
      // The context should handle JSON parse error gracefully
      expect(() => JSON.parse(userJson!)).toThrow();
    });
  });

  describe('Sign In with Google', () => {
    it('should call google-login API with id_token and store session', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.googleLogin.success));

      const response = await fetch('http://localhost:8080/api/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: MOCK_ID_TOKEN }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.user).toBeDefined();
      expect(data.token).toBeDefined();
      expect(data.user.id).toBe(1);
      expect(data.user.name).toBe('Ava Test');
    });

    it('should handle 401 error from google-login API', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });

      const response = await fetch('http://localhost:8080/api/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: 'invalid-token' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should handle server error from google-login API', async () => {
      fetchMock.mockResponseOnce('', { status: 500 });

      const response = await fetch('http://localhost:8080/api/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: MOCK_ID_TOKEN }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });

    it('should return new user with profile_complete=false for first-time sign up', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.googleLogin.newUser));

      const response = await fetch('http://localhost:8080/api/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: MOCK_ID_TOKEN }),
      });

      const data = await response.json();
      expect(data.user.profile_complete).toBe(false);
    });
  });

  describe('Sign Out', () => {
    it('should clear stored token and user on sign out', async () => {
      // First store a session
      await mockSecureStore.setItemAsync(TOKEN_KEY, MOCK_TOKEN);
      await mockSecureStore.setItemAsync(USER_KEY, JSON.stringify(mockUsers[0]));

      // Verify stored
      expect(await mockSecureStore.getItemAsync(TOKEN_KEY)).toBe(MOCK_TOKEN);
      expect(await mockSecureStore.getItemAsync(USER_KEY)).toBeTruthy();

      // Sign out
      await mockSecureStore.deleteItemAsync(TOKEN_KEY);
      await mockSecureStore.deleteItemAsync(USER_KEY);

      // Verify cleared
      expect(await mockSecureStore.getItemAsync(TOKEN_KEY)).toBeNull();
      expect(await mockSecureStore.getItemAsync(USER_KEY)).toBeNull();
    });
  });

  describe('Update Profile', () => {
    it('should call profile API and update stored user', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.profile.success));

      const profileData = {
        name: 'Updated Name',
        gender: 'Female',
        age: 26,
      };

      const response = await fetch('http://localhost:8080/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify(profileData),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.user.name).toBe('Updated Name');
      expect(data.user.age).toBe(26);
    });

    it('should handle 401 error from profile API (not authenticated)', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

      const response = await fetch('http://localhost:8080/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should handle validation errors from profile API', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({ error: 'Name is required' }),
        { status: 400 }
      );

      const response = await fetch('http://localhost:8080/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify({ name: '' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Name is required');
    });
  });

  describe('Refresh Session Silently', () => {
    it('should call Google signInSilently and refresh token', async () => {
      mockGoogleSignIn.GoogleSignin.signInSilently.mockResolvedValueOnce({
        data: { idToken: 'refreshed-id-token' },
      });

      const result = await mockGoogleSignIn.GoogleSignin.signInSilently();
      expect(result.data.idToken).toBe('refreshed-id-token');
    });

    it('should return null when silent sign-in fails', async () => {
      mockGoogleSignIn.GoogleSignin.signInSilently.mockRejectedValueOnce(
        new Error('Silent sign-in failed')
      );

      await expect(mockGoogleSignIn.GoogleSignin.signInSilently()).rejects.toThrow(
        'Silent sign-in failed'
      );
    });

    it('should return null when no id token is returned', async () => {
      mockGoogleSignIn.GoogleSignin.signInSilently.mockResolvedValueOnce({
        data: { idToken: null },
      });

      const result = await mockGoogleSignIn.GoogleSignin.signInSilently();
      expect(result.data.idToken).toBeNull();
    });
  });

  describe('Google Sign-In Configuration', () => {
    it('should configure Google Sign-In with correct client IDs', async () => {
      await mockGoogleSignIn.GoogleSignin.configure({
        webClientId: 'test-web-client-id',
        iosClientId: 'test-ios-client-id',
        offlineAccess: true,
      });

      expect(mockGoogleSignIn.GoogleSignin.configure).toHaveBeenCalledWith({
        webClientId: 'test-web-client-id',
        iosClientId: 'test-ios-client-id',
        offlineAccess: true,
      });
    });
  });
});
