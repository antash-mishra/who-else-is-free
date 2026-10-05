import { useRef, useState } from 'react';

import { StyleSheet, View, useWindowDimensions } from 'react-native';

import {
  Blur,
  Canvas,
  Circle,
  ColorMatrix,
  Group,
  Image,
  LinearGradient,
  Paint,
  Rect,
  RadialGradient,
  rect,
  rrect,
  vec,
} from '@shopify/react-native-skia';

import { colors, avatarBadgeMaterial } from '@theme/index';
import { getAvatarGradient, resolveAvatarUri } from '@utils/avatar';

import { useAvatarBadgeImage } from './useAvatarBadgeImage';

export interface AvatarBadgeBackdropProps {
  avatar?: string | null;
  name?: string | null;
  seed?: number | string | null;
  /** The page under the avatar: onboarding radial gradient or default white. */
  page?: 'onboarding';
  /** Measured onboarding page, which can be taller than Android's app window. */
  pageSize?: { width: number; height: number };
}

/** Android's badge receives only its backdrop, never a capture of the camera. */
export default function AvatarBadgeBackdrop({
  avatar,
  name,
  seed,
  page,
  pageSize,
}: AvatarBadgeBackdropProps) {
  const frame = useRef<View>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const { width, height } = useWindowDimensions();
  const saturation = avatarBadgeMaterial.saturation;
  const t = 1 - saturation;
  const matrix = [
    0.2126 * t + saturation,
    0.7152 * t,
    0.0722 * t,
    0,
    0,
    0.2126 * t,
    0.7152 * t + saturation,
    0.0722 * t,
    0,
    0,
    0.2126 * t,
    0.7152 * t,
    0.0722 * t + saturation,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];
  const uri = resolveAvatarUri(avatar);
  const image = useAvatarBadgeImage(uri);
  const gradient = getAvatarGradient(seed, name);
  // A 40dp badge at right -2, bottom 4 on a 120dp avatar: avatar origin in badge space.
  const x = -82;
  const y = -76;
  return (
    <View
      ref={frame}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={() => frame.current?.measureInWindow((x, y) => setOrigin({ x, y }))}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Group
          layer={
            <Paint>
              <ColorMatrix matrix={matrix} />
            </Paint>
          }
        >
          <Group
            layer={
              <Paint>
                <Blur blur={avatarBadgeMaterial.blurRadius} />
              </Paint>
            }
          >
            <Rect x={-120} y={-120} width={280} height={280} color={colors.background} />
            {page === 'onboarding' && (
              <Rect x={-120} y={-120} width={280} height={280} opacity={0.7}>
                <RadialGradient
                  c={vec((pageSize?.width ?? width) / 2 - origin.x, -origin.y)}
                  r={pageSize?.height ?? height}
                  colors={[colors.onboardingGradientStart, colors.onboardingGradientEnd]}
                  positions={[0.24, 1]}
                />
              </Rect>
            )}
            <Group clip={rrect(rect(x, y, 120, 120), 60, 60)}>
              {image ? (
                <Image image={image} x={x} y={y} width={120} height={120} fit="cover" />
              ) : !uri ? (
                <Circle cx={x + 60} cy={y + 60} r={60}>
                  <LinearGradient
                    start={vec(x - 2, y - 2)}
                    end={vec(x + 122, y + 122)}
                    colors={[...gradient]}
                  />
                </Circle>
              ) : null}
            </Group>
          </Group>
        </Group>
        <Rect x={0} y={0} width={40} height={40} color={avatarBadgeMaterial.tint} />
      </Canvas>
    </View>
  );
}
