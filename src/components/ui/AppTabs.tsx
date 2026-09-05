import { memo, useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import ScalePressable from '@components/ScalePressable';
import { colors, componentTokens, radii, typography } from '@theme/index';
import { Springs } from '@theme/springs';

export interface AppTabOption {
  label: string;
  value: string;
  count?: number;
}

export interface AppTabsProps {
  options: AppTabOption[];
  value: string;
  onChange: (value: string) => void;
  variant?: 'pill' | 'underline';
  style?: StyleProp<ViewStyle>;
  testIDPrefix?: string;
  /**
   * Continuous page index from AnimatedPager. When supplied, the indicator
   * tracks the swipe instead of springing on selection change.
   */
  pageOffsetSV?: SharedValue<number>;
}

interface AppTabProps {
  option: AppTabOption;
  index: number;
  selected: boolean;
  variant: 'pill' | 'underline';
  onPress: () => void;
  testIDPrefix: string;
  pageOffsetSV?: SharedValue<number>;
}

const AppTab = ({
  option,
  index,
  selected,
  variant,
  onPress,
  testIDPrefix,
  pageOffsetSV,
}: AppTabProps) => {
  const selectedProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withSpring(selected ? 1 : 0, Springs.snappy);
  }, [selectedProgress, selected]);

  // With a pager offset the indicator follows the finger; without one it
  // springs on selection exactly as before.
  const progress = useDerivedValue(() => {
    if (!pageOffsetSV) {
      return selectedProgress.value;
    }
    const distance = Math.abs(pageOffsetSV.value - index);
    return Math.min(Math.max(1 - distance, 0), 1);
  });

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.transparent, colors.primaryButtonBackground],
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.borderSubtle, colors.transparent],
    ),
  }));
  const underlineStyle = useAnimatedStyle(() => ({
    borderBottomColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.transparent, colors.activeTabIndicator],
    ),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [colors.eventDetailRowText, variant === 'pill' ? colors.selectedTextOnDark : colors.text],
    ),
  }));
  const countStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [colors.subText, variant === 'pill' ? colors.selectedTextMutedOnDark : colors.text],
    ),
  }));

  return (
    <ScalePressable
      onPress={onPress}
      haptic="selection"
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      testID={`${testIDPrefix}-${option.value}`}
      style={[
        styles.tab,
        variant === 'pill' ? styles.pillTab : styles.underlineTab,
        variant === 'pill' ? pillStyle : underlineStyle,
      ]}
    >
      <Animated.Text style={[styles.label, labelStyle]}>{option.label}</Animated.Text>
      {option.count != null && option.count > 0 ? (
        <Animated.Text style={[styles.count, countStyle]}>{option.count}</Animated.Text>
      ) : null}
    </ScalePressable>
  );
};

const AppTabs = ({
  options,
  value,
  onChange,
  variant = 'pill',
  style,
  testIDPrefix = 'tab',
  pageOffsetSV,
}: AppTabsProps) => (
  <View style={[styles.container, variant === 'underline' && styles.underlineContainer, style]}>
    {options.map((option, index) => (
      <AppTab
        key={option.value}
        option={option}
        index={index}
        pageOffsetSV={pageOffsetSV}
        selected={option.value === value}
        variant={variant}
        onPress={() => onChange(option.value)}
        testIDPrefix={testIDPrefix}
      />
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: componentTokens.segmentedControl.gap,
  },
  underlineContainer: {
    gap: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: componentTokens.segmentedControl.tabGap,
  },
  pillTab: {
    paddingVertical: componentTokens.segmentedControl.tabPaddingVertical,
    paddingHorizontal: componentTokens.segmentedControl.tabPaddingHorizontal,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  underlineTab: {
    paddingVertical: componentTokens.segmentedControl.tabPaddingVertical,
    paddingHorizontal: componentTokens.segmentedControl.tabPaddingHorizontal,
    borderBottomWidth: 2,
  },
  label: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: 20,
    letterSpacing: typography.detailLetterSpacing,
  },
  count: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: 20,
    letterSpacing: typography.detailLetterSpacing,
  },
});

export default memo(AppTabs);
