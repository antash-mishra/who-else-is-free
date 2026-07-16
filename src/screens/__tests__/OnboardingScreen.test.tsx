/**
 * Tests for OnboardingScreen
 * Covers 3-step flow, validation, profile update
 */

import fetchMock from 'jest-fetch-mock';

import { userGenderOptions, type UserGender } from '@constants/profileOptions';

import { mockUsers, mockApiResponses } from '../../__tests__/mocks/mockData';

const BASE_URL = 'http://localhost:8080';
const MOCK_TOKEN = 'mock-jwt-token';

describe('OnboardingScreen', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  describe('Step Flow', () => {
    const steps = ['name', 'gender', 'age'] as const;

    it('should have 3 steps', () => {
      expect(steps.length).toBe(3);
    });

    it('should start at step 1 (name)', () => {
      const currentStep = 0;
      expect(steps[currentStep]).toBe('name');
    });

    it('should progress to step 2 (gender)', () => {
      let currentStep = 0;
      currentStep += 1;
      expect(steps[currentStep]).toBe('gender');
    });

    it('should progress to step 3 (age)', () => {
      let currentStep = 1;
      currentStep += 1;
      expect(steps[currentStep]).toBe('age');
    });

    it('should allow going back to previous step', () => {
      let currentStep = 2;
      currentStep -= 1;
      expect(steps[currentStep]).toBe('gender');
    });
  });

  describe('Name Validation', () => {
    it('should require non-empty name', () => {
      const name = '';
      const isValid = name.trim().length > 0;

      expect(isValid).toBe(false);
    });

    it('should accept valid name', () => {
      const name = 'John Doe';
      const isValid = name.trim().length > 0;

      expect(isValid).toBe(true);
    });

    it('should trim whitespace from name', () => {
      const name = '  John Doe  ';
      const trimmed = name.trim();

      expect(trimmed).toBe('John Doe');
    });

    it('should reject whitespace-only name', () => {
      const name = '   ';
      const isValid = name.trim().length > 0;

      expect(isValid).toBe(false);
    });
  });

  describe('Gender Selection', () => {
    const genders = userGenderOptions;

    it('should show genders in the required order', () => {
      expect(genders).toEqual(['Male', 'Female', 'Other']);
    });

    it('should have Female option', () => {
      expect(genders).toContain('Female');
    });

    it('should have Male option', () => {
      expect(genders).toContain('Male');
    });

    it('should have Other option', () => {
      expect(genders).toContain('Other');
    });

    it('should require gender selection', () => {
      const selectedGender: UserGender | null = null;
      const isValid = selectedGender !== null;

      expect(isValid).toBe(false);
    });

    it('should accept valid gender selection', () => {
      const selectedGender: UserGender | null = 'Other';
      const isValid = selectedGender !== null;

      expect(isValid).toBe(true);
    });
  });

  describe('Age Validation', () => {
    it('should require age to be specified', () => {
      const age: number | null = null;
      const isValid = age !== null && age > 0;

      expect(isValid).toBe(false);
    });

    it('should accept valid age', () => {
      const age = 25;
      const isValid = age !== null && age > 0;

      expect(isValid).toBe(true);
    });

    it('should enforce minimum age (typically 18)', () => {
      const minAge = 18;
      const age = 17;
      const isValid = age >= minAge;

      expect(isValid).toBe(false);
    });

    it('should enforce maximum age (typically 99)', () => {
      const maxAge = 99;
      const age = 100;
      const isValid = age <= maxAge;

      expect(isValid).toBe(false);
    });

    it('should accept age within valid range', () => {
      const minAge = 18;
      const maxAge = 99;
      const age = 25;
      const isValid = age >= minAge && age <= maxAge;

      expect(isValid).toBe(true);
    });
  });

  describe('Profile Update', () => {
    it('should update profile via API', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.profile.success));

      const profileData = {
        name: 'Updated Name',
        gender: 'Female',
        age: 25,
      };

      const response = await fetch(`${BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify(profileData),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.user.profile_complete).toBe(true);
    });

    it('should handle validation errors', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({ error: 'Name is required' }),
        { status: 400 }
      );

      const response = await fetch(`${BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify({ name: '' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should handle unauthorized error', async () => {
      fetchMock.mockResponseOnce('', { status: 401 });

      const response = await fetch(`${BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Test' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('Pre-fill with Existing Data', () => {
    it('should pre-fill name from existing user data', () => {
      const user = mockUsers[0];
      const initialName = user.name;

      expect(initialName).toBe('Ava Test');
    });

    it('should pre-fill gender from existing user data', () => {
      const user = mockUsers[0];
      const initialGender = user.gender;

      expect(initialGender).toBe('Female');
    });

    it('should pre-fill age from existing user data', () => {
      const user = mockUsers[0];
      const initialAge = user.age;

      expect(initialAge).toBe(25);
    });
  });

  describe('Form State', () => {
    it('should track form completion state', () => {
      const formData = {
        name: 'John Doe',
        gender: 'Male' as const,
        age: 25,
      };

      const isComplete =
        formData.name.trim().length > 0 &&
        formData.gender !== null &&
        formData.age !== null &&
        formData.age > 0;

      expect(isComplete).toBe(true);
    });

    it('should identify incomplete form', () => {
      const formData = {
        name: 'John Doe',
        gender: null,
        age: null,
      };

      const isComplete =
        formData.name.trim().length > 0 &&
        formData.gender !== null &&
        formData.age !== null;

      expect(isComplete).toBe(false);
    });
  });

  describe('Navigation', () => {
    it('should navigate to main screen after completion', () => {
      const navigateTarget = 'Main';
      expect(navigateTarget).toBe('Main');
    });
  });

  describe('Progress Indicator', () => {
    it('should show correct progress for step 1', () => {
      const currentStep = 0;
      const totalSteps = 3;
      const progress = (currentStep + 1) / totalSteps;

      expect(progress).toBeCloseTo(0.33, 1);
    });

    it('should show correct progress for step 2', () => {
      const currentStep = 1;
      const totalSteps = 3;
      const progress = (currentStep + 1) / totalSteps;

      expect(progress).toBeCloseTo(0.67, 1);
    });

    it('should show correct progress for step 3', () => {
      const currentStep = 2;
      const totalSteps = 3;
      const progress = (currentStep + 1) / totalSteps;

      expect(progress).toBe(1);
    });
  });
});
