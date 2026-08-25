/* eslint-disable react-hooks/immutability -- Reanimated shared values are intentionally updated when controlled tab selection changes. */
import React, { useEffect, useRef } from 'react';

import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import ScalePressable from '@components/ScalePressable';
import { colors, typography } from '@theme/index';
import { Springs } from '@theme/springs';

export interface SlidingTabOption {
  label: string;
  value: string;
  count?: number;
}

export interface SlidingTabsProps {
  options: SlidingTabOption[];
  value: string;
  /** Omit for a static header (single tab with underline, no interaction). */
  onChange?: (value: string, index: number) => void;
  style?: StyleProp<ViewStyle>;
  testIDPrefix?: string;
}

const TAB_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

/**
 * Tab bar with a sliding underline that springs between tabs. Owns tab layout
 * tracking, underline motion, count labels, and selection haptics so screens
 * with pager-style tab sections share one implementation.
 */
const SlidingTabs = ({
  options,
  value,
  onChange,
  style,
  testIDPrefix = 'tab',
}: SlidingTabsProps) => {
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const underlineReady = useRef(false);
  const underlineX = useSharedValue(0);
  const underlineWidth = useSharedValue(0);
  const underlineAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: underlineX.value }],
    width: underlineWidth.value,
  }));

  useEffect(() => {
    const layout = tabLayouts.current[value];
    if (!layout) {
      return;
    }
    underlineX.value = withSpring(layout.x, Springs.snappy);
    underlineWidth.value = withSpring(layout.width, Springs.snappy);
  }, [underlineWidth, underlineX, value]);

  return (
    <View style={[styles.container, style]}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <ScalePressable
            key={option.value}
            style={styles.tabItem}
            hitSlop={TAB_HIT_SLOP}
            haptic="selection"
            disabled={!onChange}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            testID={`${testIDPrefix}-${option.value}`}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              tabLayouts.current[option.value] = { x, width };
              if (selected && !underlineReady.current) {
                underlineX.value = x;
                underlineWidth.value = width;
                underlineReady.current = true;
              } else if (selected) {
                // Keep the underline matched to the active tab when its width
                // changes (e.g. a count updates).
                underlineX.value = x;
                underlineWidth.value = width;
              }
            }}
            onPress={() => {
              const layout = tabLayouts.current[option.value];
              if (layout) {
                underlineX.value = withSpring(layout.x, Springs.snappy);
                underlineWidth.value = withSpring(layout.width, Springs.snappy);
              }
              onChange?.(option.value, index);
            }}
          >
            <View style={styles.tabLabelRow}>
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>
                {option.label}
              </Text>
              {option.count != null ? (
                <Text style={[styles.tabCount, selected && styles.tabCountActive]}>
                  {' '}
                  {option.count}
                </Text>
              ) : null}
            </View>
          </ScalePressable>
        );
      })}
      <Animated.View style={[styles.underline, underlineAnimStyle]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  tabItem: {
    alignItems: 'flex-start',
  },
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: colors.subText,
    lineHeight: 16,
    letterSpacing: -0.3,
  },
  tabLabelActive: {
    color: colors.text,
  },
  tabCount: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: colors.subText,
    lineHeight: 15,
    letterSpacing: -0.3,
  },
  tabCountActive: {
    color: colors.text,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    backgroundColor: colors.text,
    borderRadius: 1,
  },
});

export default SlidingTabs;
