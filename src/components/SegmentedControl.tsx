import { memo, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { colors, componentTokens, radii, typography } from '@theme/index';
import { Springs } from '@theme/springs';

export interface SegmentedOption {
  label: string;
  value: string;
  count?: number;
}

interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
}

type TabProps = {
  option: SegmentedOption;
  selected: boolean;
  localProgress: SharedValue<number>;
  onPress: () => void;
};

const SegmentedTab = ({ option, selected, localProgress, onPress }: TabProps) => {
  const tabStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      localProgress.value,
      [0, 1],
      [colors.transparent, colors.primaryButtonBackground],
    ),
    borderColor: interpolateColor(
      localProgress.value,
      [0, 1],
      [colors.borderSubtle, colors.transparent],
    ),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      localProgress.value,
      [0, 1],
      [colors.eventDetailRowText, colors.selectedTextOnDark],
    ),
  }));
  const countStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      localProgress.value,
      [0, 1],
      [colors.subText, colors.selectedTextMutedOnDark],
    ),
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      testID={`segment-${option.value}`}
    >
      <Animated.View style={[styles.tab, tabStyle]}>
        <Animated.Text style={[styles.label, labelStyle]}>{option.label}</Animated.Text>
        {option.count != null && option.count > 0 && (
          <Animated.Text style={[styles.count, countStyle]}>{option.count}</Animated.Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

// Up to 5 tabs — shared values must be created unconditionally at top level.
const SegmentedControl = ({ options, value, onChange }: SegmentedControlProps) => {
  const selectedIndex = options.findIndex((o) => o.value === value);
  const prevIndex = useRef(selectedIndex);

  const sv0 = useSharedValue(selectedIndex === 0 ? 1 : 0);
  const sv1 = useSharedValue(selectedIndex === 1 ? 1 : 0);
  const sv2 = useSharedValue(selectedIndex === 2 ? 1 : 0);
  const sv3 = useSharedValue(selectedIndex === 3 ? 1 : 0);
  const sv4 = useSharedValue(selectedIndex === 4 ? 1 : 0);
  const allSvs = [sv0, sv1, sv2, sv3, sv4];

  useEffect(() => {
    const prev = prevIndex.current;
    if (prev === selectedIndex) return;
    if (allSvs[prev]) {
      allSvs[prev].value = 0;
    }
    if (allSvs[selectedIndex]) {
      allSvs[selectedIndex].value = withSpring(1, Springs.snappy);
    }
    prevIndex.current = selectedIndex;
  }, [selectedIndex]);

  return (
    <View style={styles.container}>
      {options.map((option, i) => (
        <SegmentedTab
          key={option.value}
          option={option}
          selected={option.value === value}
          localProgress={allSvs[i] ?? sv0}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(option.value);
          }}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: componentTokens.segmentedControl.gap,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: componentTokens.segmentedControl.tabGap,
    paddingVertical: componentTokens.segmentedControl.tabPaddingVertical,
    paddingHorizontal: componentTokens.segmentedControl.tabPaddingHorizontal,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  label: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  count: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
});

export default memo(SegmentedControl);
