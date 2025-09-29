import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@theme/index';

export interface SegmentedOption {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
}

const SegmentedControl = ({ options, value, onChange }: SegmentedControlProps) => {
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={styles.tab}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.lg
  },
  tab: {
    paddingVertical: spacing.xs
  },
  label: {
    fontSize: typography.title,
    color: colors.tabInactive,
    fontFamily: typography.fontFamilySemiBold,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  labelActive: {
    color: colors.tabActive,
    fontFamily: typography.fontFamilyBold
  }
});

export default memo(SegmentedControl);
