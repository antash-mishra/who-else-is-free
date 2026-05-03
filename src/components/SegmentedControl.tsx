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

import { typography } from '@theme/index';
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
  localProgress: SharedValue<number>;
  onPress: () => void;
};

const SegmentedTab = ({ option, localProgress, onPress }: TabProps) => {
  const tabStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(localProgress.value, [0, 1], ['transparent', '#000000']),
    borderColor: interpolateColor(localProgress.value, [0, 1], ['#E6E6E6', 'transparent']),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(localProgress.value, [0, 1], ['#494949', '#FFFFFF']),
  }));
  const countStyle = useAnimatedStyle(() => ({
    color: interpolateColor(localProgress.value, [0, 1], ['#808080', 'rgba(255,255,255,0.7)']),
  }));

  return (
    <Pressable onPress={onPress} accessibilityRole="tab">
      <Animated.View style={[styles.tab, tabStyle]}>
        <Animated.Text style={[styles.label, labelStyle]}>
          {option.label}
        </Animated.Text>
        {option.count != null && option.count > 0 && (
          <Animated.Text style={[styles.count, countStyle]}>
            {option.count}
          </Animated.Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

// Up to 4 tabs — shared values must be created unconditionally at top level.
const SegmentedControl = ({ options, value, onChange }: SegmentedControlProps) => {
  const selectedIndex = options.findIndex(o => o.value === value);
  const prevIndex = useRef(selectedIndex);

  const sv0 = useSharedValue(selectedIndex === 0 ? 1 : 0);
  const sv1 = useSharedValue(selectedIndex === 1 ? 1 : 0);
  const sv2 = useSharedValue(selectedIndex === 2 ? 1 : 0);
  const sv3 = useSharedValue(selectedIndex === 3 ? 1 : 0);
  const allSvs = [sv0, sv1, sv2, sv3];

  useEffect(() => {
    const prev = prevIndex.current;
    if (prev === selectedIndex) return;
    allSvs[prev].value = 0;
    allSvs[selectedIndex].value = withSpring(1, Springs.snappy);
    prevIndex.current = selectedIndex;
  }, [selectedIndex]);

  return (
    <View style={styles.container}>
      {options.map((option, i) => (
        <SegmentedTab
          key={option.value}
          option={option}
          localProgress={allSvs[i]}
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
    gap: 5,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
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
