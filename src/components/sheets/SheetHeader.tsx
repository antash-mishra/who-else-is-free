import React, { memo, type ReactNode } from 'react';

import { StyleSheet, Text, View } from 'react-native';

import CloseIcon from '@assets/ui/close.svg';
import { IconButton } from '@components/ui';
import { colors, componentTokens, spacing, typography } from '@theme/index';

type SheetHeaderProps = {
  title: string;
  onClose: () => void;
  closeTestID?: string;
  /**
   * Optional text under the title. It shares the title's column, so it wraps
   * before the close button instead of running underneath it. Render it inside
   * a row with `alignItems: 'flex-start'` so the close button stays at the top.
   */
  description?: ReactNode;
};

const SheetHeader = ({ title, onClose, closeTestID, description }: SheetHeaderProps) => (
  <React.Fragment>
    {description ? (
      <View style={styles.titleColumn}>
        <Text style={[styles.title, styles.columnTitle]}>{title}</Text>
        {description}
      </View>
    ) : (
      <Text style={styles.title}>{title}</Text>
    )}
    <IconButton
      accessibilityLabel="Close sheet"
      icon={
        <CloseIcon
          width={componentTokens.iconButton.iconSm}
          height={componentTokens.iconButton.iconSm}
          color={colors.iconMuted}
        />
      }
      onPress={onClose}
      size="sm"
      variant="soft"
      testID={closeTestID}
    />
  </React.Fragment>
);

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: 24,
    letterSpacing: -0.5,
    marginRight: spacing.md,
    flex: 1,
  },
  titleColumn: {
    flex: 1,
    marginRight: spacing.md,
    gap: spacing.xs,
  },
  columnTitle: {
    flex: 0,
    marginRight: 0,
  },
});

export default memo(SheetHeader);
