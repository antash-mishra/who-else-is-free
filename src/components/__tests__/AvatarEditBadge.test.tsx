import React from 'react';

import { Platform } from 'react-native';

import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';

import CameraIcon from '@assets/onboarding/camera.svg';

import AvatarEditBadge from '../AvatarEditBadge';
import { useAvatarBadgeImage } from '../useAvatarBadgeImage';

jest.mock('@shopify/react-native-skia', () => {
  const { View } = jest.requireActual('react-native');
  return {
    Canvas: View,
    Group: View,
    Paint: View,
    Blur: View,
    Circle: View,
    ColorMatrix: View,
    RadialGradient: View,
    LinearGradient: View,
    Image: View,
    Rect: View,
    Skia: {
      Data: { fromBase64: jest.fn(() => ({})), fromURI: jest.fn(async () => ({})) },
      Image: { MakeImageFromEncoded: jest.fn(() => null) },
    },
    vec: (x: number, y: number) => ({ x, y }),
    rect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
    rrect: (value: unknown) => value,
  };
});

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
});

it('keeps the camera out of Android whole-screen native blur capture', () => {
  Platform.OS = 'android';
  const { UNSAFE_queryByType, UNSAFE_getByType } = render(<AvatarEditBadge />);
  expect(UNSAFE_getByType(CameraIcon).props.color).toBe('#707070');
  expect(UNSAFE_queryByType(BlurView)).toBeNull();
});

it('preserves the existing iOS native material and foreground camera', () => {
  Platform.OS = 'ios';
  const { UNSAFE_getByType } = render(<AvatarEditBadge />);
  expect(UNSAFE_getByType(BlurView).props).toMatchObject({ tint: 'light', intensity: 15 });
  expect(UNSAFE_getByType(CameraIcon).props).toMatchObject({
    width: 20,
    height: 20,
    color: '#707070',
  });
});

it('passes the current avatar identity only to the Android backdrop', () => {
  Platform.OS = 'android';
  const { UNSAFE_getByType } = render(
    <AvatarEditBadge avatar="data:image/png;base64,synthetic" name="Tester" seed={5} />,
  );
  const backdrop = UNSAFE_getByType(require('../AvatarBadgeBackdrop').default);
  expect(backdrop.props).toEqual({
    avatar: 'data:image/png;base64,synthetic',
    name: 'Tester',
    seed: 5,
  });
  expect(backdrop.findAllByType(CameraIcon)).toHaveLength(0);
});

it('matches the measured onboarding gradient when the page exceeds the app window', () => {
  Platform.OS = 'android';
  const { UNSAFE_getByType } = render(
    <AvatarEditBadge page="onboarding" pageSize={{ width: 411, height: 914 }} />,
  );
  const backdrop = UNSAFE_getByType(require('../AvatarBadgeBackdrop').default);
  const gradient = backdrop.find((node) => node.props.positions !== undefined);
  expect(gradient.props.c).toEqual({ x: 205.5, y: -0 });
  expect(gradient.props.r).toBe(914);
});

it('uses the same avatar URI decoder without substituting a gradient for a loading photo', () => {
  const { Skia } = require('@shopify/react-native-skia');
  // This regression covers Android; a missing decoded photo is transparent, like expo-image.
  Platform.OS = 'android';
  const { UNSAFE_getByType: getAndroid } = render(<AvatarEditBadge avatar="synthetic-base64" />);
  const backdrop = getAndroid(require('../AvatarBadgeBackdrop').default);
  expect(Skia.Data.fromBase64).toHaveBeenLastCalledWith('synthetic-base64');
  expect(Skia.Data.fromURI).not.toHaveBeenCalled();
  expect(backdrop.findAll((node) => node.props.colors !== undefined)).toHaveLength(0);
});

it('ignores a stale photo load after the avatar is changed or removed', async () => {
  const { Skia } = require('@shopify/react-native-skia');
  let finishFirst!: (value: object) => void;
  let finishSecond!: (value: object) => void;
  Skia.Data.fromURI
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSecond = resolve;
        }),
    );
  Skia.Image.MakeImageFromEncoded.mockImplementation((data: object) => data);
  const { result, rerender } = renderHook(
    ({ uri }: { uri: string | null }) => useAvatarBadgeImage(uri),
    {
      initialProps: { uri: 'file://synthetic-first' as string | null },
    },
  );
  rerender({ uri: 'file://synthetic-second' });
  const secondImage = { label: 'synthetic-second' };
  await act(async () => {
    finishSecond(secondImage);
  });
  expect(result.current).toBe(secondImage);
  await act(async () => {
    finishFirst({ label: 'synthetic-first' });
  });
  expect(result.current).toBe(secondImage);
  rerender({ uri: null });
  expect(result.current).toBeNull();
});

it('handles failed photo loading without leaking an old backdrop', async () => {
  const { Skia } = require('@shopify/react-native-skia');
  const previousImage = { label: 'synthetic-old-photo' };
  Skia.Data.fromURI
    .mockResolvedValueOnce(previousImage)
    .mockRejectedValueOnce(new Error('synthetic load failure'));
  Skia.Image.MakeImageFromEncoded.mockImplementation((data: object) => data);
  const { result, rerender } = renderHook(({ uri }: { uri: string }) => useAvatarBadgeImage(uri), {
    initialProps: { uri: 'file://synthetic-old' },
  });
  await waitFor(() => expect(result.current).toBe(previousImage));
  rerender({ uri: 'file://synthetic-missing' });
  await waitFor(() => expect(Skia.Data.fromURI).toHaveBeenCalledWith('file://synthetic-missing'));
  expect(result.current).toBeNull();
});
