/**
 * Rendering tests for OnboardingScreen
 * Tests multi-step form, validation, and profile submission
 */

import React from 'react';

import { Alert } from 'react-native';

import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { mockUsers } from '../../__tests__/mocks/mockData';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock navigation
const mockNavigate = jest.fn();
const mockReset = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    reset: mockReset,
  }),
}));

// Mock safe area
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock expo-image-picker
const mockLaunchImageLibraryAsync = jest.fn();
const mockRequestMediaLibraryPermissionsAsync = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: mockLaunchImageLibraryAsync,
  requestMediaLibraryPermissionsAsync: mockRequestMediaLibraryPermissionsAsync,
}));

// Mock Auth context
const mockUpdateProfile = jest.fn();
const mockSignOut = jest.fn();
const mockUseAuth = jest.fn();
jest.mock('@context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Import screen after mocks
import OnboardingScreen from '../OnboardingScreen';

const getStep1ContinueButton = () => screen.getAllByText('Continue')[0];
const getStep2ContinueButton = () => screen.getAllByText('Continue')[1];
const getStep2BackButton = () => screen.getAllByTestId('back-button')[0];
const getStep3BackButton = () => screen.getAllByTestId('back-button')[1];
const selectAge = (age: number) => fireEvent.press(screen.getByText(String(age)));
const pressStep1Continue = () => fireEvent.press(getStep1ContinueButton());
const pressStep2Continue = () => fireEvent.press(getStep2ContinueButton());
const pressDone = () => fireEvent.press(screen.getByText('Done'));

describe('OnboardingScreen Rendering', () => {
  const defaultUser = mockUsers[2]; // New user without complete profile

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: defaultUser,
      updateProfile: mockUpdateProfile,
      signOut: mockSignOut,
    });
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true });
  });

  describe('Step 1 - Name Input', () => {
    it('renders step 1 header', () => {
      render(<OnboardingScreen />);
      expect(screen.getByText("What's your name?")).toBeTruthy();
    });

    it('renders name input field', () => {
      render(<OnboardingScreen />);
      expect(screen.getByPlaceholderText('Your Name')).toBeTruthy();
    });

    it('pre-fills name from user data', () => {
      render(<OnboardingScreen />);
      const nameInput = screen.getByPlaceholderText('Your Name');
      expect(nameInput.props.value).toBe('New User');
    });

    it('renders Continue button', () => {
      render(<OnboardingScreen />);
      expect(getStep1ContinueButton()).toBeTruthy();
    });

    it('disables Continue when name is empty', () => {
      mockUseAuth.mockReturnValue({
        user: { ...defaultUser, name: '' },
        updateProfile: mockUpdateProfile,
        signOut: mockSignOut,
      });
      render(<OnboardingScreen />);
      const nameInput = screen.getByPlaceholderText('Your Name');
      fireEvent.changeText(nameInput, '');
      pressStep1Continue();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('does not advance when Continue pressed with empty name', () => {
      mockUseAuth.mockReturnValue({
        user: { ...defaultUser, name: '' },
        updateProfile: mockUpdateProfile,
        signOut: mockSignOut,
      });
      render(<OnboardingScreen />);
      const nameInput = screen.getByPlaceholderText('Your Name');
      fireEvent.changeText(nameInput, '   ');
      pressStep1Continue();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('advances to step 2 with valid name', () => {
      render(<OnboardingScreen />);
      const nameInput = screen.getByPlaceholderText('Your Name');
      fireEvent.changeText(nameInput, 'John Doe');
      pressStep1Continue();
      expect(screen.getByText("What's your gender?")).toBeTruthy();
    });
  });

  describe('Step 2 - Gender Selection', () => {
    const goToStep2 = () => {
      render(<OnboardingScreen />);
      fireEvent.changeText(screen.getByPlaceholderText('Your Name'), 'John Doe');
      pressStep1Continue();
    };

    it('renders gender selection header', () => {
      goToStep2();
      expect(screen.getByText("What's your gender?")).toBeTruthy();
    });

    it('renders Female option', () => {
      goToStep2();
      expect(screen.getByText('Female')).toBeTruthy();
    });

    it('renders Male option', () => {
      goToStep2();
      expect(screen.getByText('Male')).toBeTruthy();
    });

    it('renders gender options in the required order', () => {
      goToStep2();
      const labels = screen.getAllByRole('radio').map((option) => option.props.accessibilityLabel);
      expect(labels).toEqual(['Male', 'Female', 'Other']);
    });

    it('renders Other option', () => {
      goToStep2();
      expect(screen.getByText('Other')).toBeTruthy();
    });

    it('renders back button', () => {
      goToStep2();
      // Back button should be present (chevron-left icon)
      expect(getStep2BackButton()).toBeTruthy();
    });

    it('selects Female when pressed', () => {
      goToStep2();
      fireEvent.press(screen.getByText('Female'));
      // Button should be styled as selected (visually)
      expect(screen.getByText('Female')).toBeTruthy();
    });

    it('selects Male when pressed', () => {
      goToStep2();
      fireEvent.press(screen.getByText('Male'));
      expect(screen.getByText('Male')).toBeTruthy();
    });

    it('selects Other when pressed', () => {
      goToStep2();
      fireEvent.press(screen.getByText('Other'));
      expect(screen.getByRole('radio', { name: 'Other' }).props.accessibilityState).toEqual({
        checked: true,
      });
    });

    it('does not advance when Continue pressed without selection', () => {
      goToStep2();
      pressStep2Continue();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('advances to step 3 with gender selected', () => {
      goToStep2();
      fireEvent.press(screen.getByText('Female'));
      pressStep2Continue();
      expect(screen.getByText("What's your age?")).toBeTruthy();
    });

    it('goes back to step 1 when back pressed', () => {
      goToStep2();
      // Find and press back button (first touchable)
      fireEvent.press(getStep2BackButton());
      expect(screen.getByText("What's your name?")).toBeTruthy();
    });
  });

  describe('Step 3 - Age Picker', () => {
    const goToStep3 = () => {
      render(<OnboardingScreen />);
      fireEvent.changeText(screen.getByPlaceholderText('Your Name'), 'John Doe');
      pressStep1Continue();
      fireEvent.press(screen.getByText('Female'));
      pressStep2Continue();
    };

    it('renders age picker header', () => {
      goToStep3();
      expect(screen.getByText("What's your age?")).toBeTruthy();
    });

    it('renders age wheel options', () => {
      goToStep3();
      expect(screen.getByText('18')).toBeTruthy();
      expect(screen.getByText('30')).toBeTruthy();
      expect(screen.getByText('120')).toBeTruthy();
    });

    it('renders Done button', () => {
      goToStep3();
      expect(screen.getByText('Done')).toBeTruthy();
    });

    it('submits the selected age', async () => {
      mockUpdateProfile.mockResolvedValue({});
      goToStep3();
      selectAge(25);
      pressDone();
      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          expect.objectContaining({ age: 25 }),
        );
      });
    });

    it('goes back to step 2 when back pressed', () => {
      goToStep3();
      fireEvent.press(getStep3BackButton());
      expect(screen.getByText("What's your gender?")).toBeTruthy();
    });
  });

  describe('Profile Submission', () => {
    const completeForm = () => {
      render(<OnboardingScreen />);
      fireEvent.changeText(screen.getByPlaceholderText('Your Name'), 'John Doe');
      pressStep1Continue();
      fireEvent.press(screen.getByText('Female'));
      pressStep2Continue();
      selectAge(25);
    };

    it('calls updateProfile with correct data', async () => {
      mockUpdateProfile.mockResolvedValue({});
      completeForm();
      pressDone();
      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith({
          name: 'John Doe',
          gender: 'Female',
          age: 25,
          avatar: undefined,
        });
      });
    });

    it('submits Other as the selected gender', async () => {
      mockUpdateProfile.mockResolvedValue({});
      render(<OnboardingScreen />);
      fireEvent.changeText(screen.getByPlaceholderText('Your Name'), 'Taylor');
      pressStep1Continue();
      fireEvent.press(screen.getByText('Other'));
      pressStep2Continue();
      selectAge(25);
      pressDone();

      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          expect.objectContaining({ gender: 'Other' }),
        );
      });
    });

    it('navigates to Main after successful submission', async () => {
      mockUpdateProfile.mockResolvedValue({});
      completeForm();
      pressDone();
      await waitFor(() => {
        expect(mockReset).toHaveBeenCalledWith({
          index: 0,
          routes: [
            {
              name: 'Main',
              params: { screen: 'Events', params: { showWelcomeBadge: true } },
            },
          ],
        });
      });
    });

    it('shows error alert on submission failure', async () => {
      mockUpdateProfile.mockRejectedValue(new Error('Network error'));
      completeForm();
      pressDone();
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Error', 'Network error');
      });
    });
  });

  describe('Image Picker', () => {
    it('requests permissions when avatar pressed', async () => {
      render(<OnboardingScreen />);
      // Avatar wrapper is touchable
      fireEvent.press(screen.getByTestId('avatar-button'));
      await waitFor(() => {
        expect(mockRequestMediaLibraryPermissionsAsync).toHaveBeenCalled();
      });
    });

    it('shows alert when permissions denied', async () => {
      mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
      render(<OnboardingScreen />);
      fireEvent.press(screen.getByTestId('avatar-button'));
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Permission Required',
          'Please allow access to your photo library to upload an avatar.',
        );
      });
    });

    it('launches image picker when permissions granted', async () => {
      mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
      render(<OnboardingScreen />);
      fireEvent.press(screen.getByTestId('avatar-button'));
      await waitFor(() => {
        expect(mockLaunchImageLibraryAsync).toHaveBeenCalled();
      });
    });

    it('includes avatar in profile update when image selected', async () => {
      mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [{ base64: 'mockBase64Image' }],
      });
      mockUpdateProfile.mockResolvedValue({});

      render(<OnboardingScreen />);
      // Select avatar
      fireEvent.press(screen.getByTestId('avatar-button'));

      await waitFor(() => {
        expect(mockLaunchImageLibraryAsync).toHaveBeenCalled();
      });

      // Complete form
      fireEvent.changeText(screen.getByPlaceholderText('Your Name'), 'John');
      pressStep1Continue();
      fireEvent.press(screen.getByText('Male'));
      pressStep2Continue();
      selectAge(30);
      pressDone();

      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          expect.objectContaining({
            avatar: 'mockBase64Image',
          }),
        );
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator during submission', async () => {
      // Create a promise that won't resolve immediately
      let resolveUpdate: (value?: unknown) => void = () => {};
      mockUpdateProfile.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpdate = resolve;
          }),
      );

      render(<OnboardingScreen />);
      fireEvent.changeText(screen.getByPlaceholderText('Your Name'), 'John');
      pressStep1Continue();
      fireEvent.press(screen.getByText('Male'));
      pressStep2Continue();
      selectAge(25);
      pressDone();

      // Done button should be disabled during loading
      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalled();
      });

      // Resolve to clean up
      resolveUpdate!();
    });
  });
});
