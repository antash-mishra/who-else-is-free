import React, { memo } from 'react';

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { triggerHaptic } from '@services/haptics';
import { colors, componentTokens, radii, spacing, typography } from '@theme/index';

export type SheetActionItem = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
};

type SheetActionListProps = {
  items: SheetActionItem[];
};

const getActionLabel = (item: SheetActionItem) => {
  if (!item.loading) {
    return item.label;
  }

  return item.label.endsWith('…') || item.label.endsWith('...') ? item.label : `${item.label}…`;
};

const SheetActionList = ({ items }: SheetActionListProps) => (
  <View style={styles.list}>
    {items.map((item, index) => {
      const isDisabled = item.loading || item.disabled;
      return (
        <Pressable
          key={`${item.label}-${index}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDisabled }}
          disabled={isDisabled}
          onPress={() => {
            if (isDisabled) {
              return;
            }
            triggerHaptic(item.destructive ? 'destructive' : 'light');
            item.onPress();
          }}
          style={({ pressed }) => [
            styles.action,
            isDisabled && styles.disabled,
            pressed && !isDisabled && styles.pressed,
          ]}
          testID={item.testID}
        >
          <Text style={[styles.label, item.destructive && styles.destructiveLabel]}>
            {getActionLabel(item)}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  action: {
    backgroundColor: colors.actionSurface,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
    height: componentTokens.button.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  destructiveLabel: {
    color: colors.error,
  },
});

export default memo(SheetActionList);
