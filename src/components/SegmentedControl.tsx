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
            style={[styles.tab, isActive && styles.tabActive]}
            testID={`segment-${option.value}`}
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
    gap: 5,
    marginVertical: spacing.sm,
  },
  tab: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E6E6E6',
    backgroundColor: 'transparent',
  },
  tabActive: {
    borderColor: 'transparent',
    backgroundColor: '#E6E6E6',
  },
  label: {
    fontSize: 15,
    color: '#494949',
    fontFamily: typography.fontFamilyMedium,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  labelActive: {
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
  },
});

export default memo(SegmentedControl);
