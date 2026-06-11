/**
 * Rendering tests for SplashScreen
 * Tests the current image splash, native hide timing, bloom handoff, and routing.
 */

import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { Animated, Image } from "react-native";

import SplashScreen from "../SplashScreen";

const mockReset = jest.fn();

jest.mock("@react-navigation/native", () => {
  const actualNav = jest.requireActual("@react-navigation/native");
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      reset: mockReset,
      goBack: jest.fn(),
      setOptions: jest.fn(),
    }),
  };
});

const mockHideAsync = jest.fn().mockResolvedValue(undefined);
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  get hideAsync() {
    return mockHideAsync;
  },
}));

jest.mock("@assets/weif/splash-logo.svg", () => {
  const React = require("react");
  const { View } = require("react-native");

  return ({ width, height }: { width: number; height: number }) => (
    <View testID="splash-logo" style={{ width, height }} />
  );
});

const mockBloom = jest.fn();
const mockSignalReady = jest.fn();
jest.mock("@context/BloomContext", () => ({
  useBloom: () => ({
    bloom: mockBloom,
    signalReady: mockSignalReady,
  }),
}));

let mockUser: {
  id: number;
  name: string;
  email: string;
  profileComplete: boolean;
} | null = null;

jest.mock("@context/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    token: mockUser ? "mock-token" : null,
    isSigningIn: false,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
    refreshSessionSilently: jest.fn(),
    updateProfile: jest.fn(),
  }),
}));

const advanceTimers = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

const renderReadySplash = async () => {
  const view = render(<SplashScreen />);
  const container = view.getByTestId("splash-container");

  await act(async () => {
    container.props.onLayout?.();
  });
  await advanceTimers(50);

  return { ...view, container };
};

describe("SplashScreen Rendering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUser = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Initial Rendering", () => {
    it("renders the splash container, image, logo, tagline, and location", () => {
      const { getByTestId, getByText, UNSAFE_getByType } = render(
        <SplashScreen />,
      );

      expect(getByTestId("splash-container")).toBeTruthy();
      expect(getByTestId("splash-logo")).toBeTruthy();
      expect(getByText("Who Else Is Free")).toBeTruthy();
      expect(getByText("Vicar Street, Dublin")).toBeTruthy();
      expect(UNSAFE_getByType(Image).props.resizeMode).toBe("cover");
    });

    it("renders the logo with the current dimensions", () => {
      const { getByTestId } = render(<SplashScreen />);
      const logo = getByTestId("splash-logo");

      expect(logo.props.style).toEqual({ width: 184, height: 67 });
    });
  });

  describe("Hide Native Splash", () => {
    it("calls hideAsync after layout and the 50ms handoff delay", async () => {
      await renderReadySplash();

      await waitFor(() => {
        expect(mockHideAsync).toHaveBeenCalledTimes(1);
      });
    });

    it("only calls hideAsync once", async () => {
      const { container } = await renderReadySplash();

      await act(async () => {
        container.props.onLayout?.();
      });
      await advanceTimers(50);

      expect(mockHideAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe("Navigation After Load", () => {
    it("resets to Main when there is no user", async () => {
      mockUser = null;
      await renderReadySplash();

      await advanceTimers(1600);
      expect(mockReset).not.toHaveBeenCalled();

      await advanceTimers(350);

      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "Main" }],
      });
    });

    it("resets to Main for a user with a complete profile", async () => {
      mockUser = {
        id: 1,
        name: "Test User",
        email: "test@example.com",
        profileComplete: true,
      };

      await renderReadySplash();
      await advanceTimers(1950);

      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "Main" }],
      });
    });

    it("resets to Onboarding for a user with an incomplete profile", async () => {
      mockUser = {
        id: 2,
        name: "New User",
        email: "new@example.com",
        profileComplete: false,
      };

      await renderReadySplash();
      await advanceTimers(1950);

      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: "Onboarding" }],
      });
    });
  });

  describe("Bloom Handoff", () => {
    it("starts the bloom 200ms into the transition", async () => {
      await renderReadySplash();

      await advanceTimers(1600);
      expect(mockBloom).not.toHaveBeenCalled();

      await advanceTimers(200);
      expect(mockBloom).toHaveBeenCalledTimes(1);
      expect(mockBloom).toHaveBeenCalledWith(expect.any(Function));
    });

    it("signals ready for onboarding after navigation reset", async () => {
      mockUser = {
        id: 2,
        name: "New User",
        email: "new@example.com",
        profileComplete: false,
      };

      await renderReadySplash();
      await advanceTimers(1950);
      expect(mockSignalReady).not.toHaveBeenCalled();

      await advanceTimers(100);
      expect(mockSignalReady).toHaveBeenCalledTimes(1);
    });

    it("does not signal ready when routing to Main", async () => {
      await renderReadySplash();
      await advanceTimers(2050);

      expect(mockSignalReady).not.toHaveBeenCalled();
    });
  });

  describe("Logo Animation", () => {
    it("scales the logo during the transition", async () => {
      const animatedTimingSpy = jest.spyOn(Animated, "timing");

      await renderReadySplash();
      await advanceTimers(1600);

      expect(animatedTimingSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          toValue: 45,
          duration: 450,
          useNativeDriver: true,
        }),
      );

      animatedTimingSpy.mockRestore();
    });
  });

  describe("Splash Duration", () => {
    it("waits 1600ms before starting navigation", async () => {
      await renderReadySplash();

      await advanceTimers(1599);
      expect(mockReset).not.toHaveBeenCalled();

      await advanceTimers(1);
      expect(mockReset).not.toHaveBeenCalled();

      await advanceTimers(350);
      expect(mockReset).toHaveBeenCalled();
    });
  });

  describe("Layout Not Ready", () => {
    it("does not start the splash sequence until layout is ready", async () => {
      render(<SplashScreen />);

      await advanceTimers(5000);

      expect(mockReset).not.toHaveBeenCalled();
      expect(mockHideAsync).not.toHaveBeenCalled();
    });
  });
});
