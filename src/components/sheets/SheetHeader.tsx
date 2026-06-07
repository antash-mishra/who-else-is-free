import React, { memo } from 'react';

import { StyleSheet, Text } from 'react-native';

import CloseIcon from '@assets/ui/close.svg';
import { IconButton } from '@components/ui';
import { colors, componentTokens, spacing, typography } from '@theme/index';

type SheetHeaderProps = {
  title: string;
  onClose: () => void;
  closeTestID?: string;
};

const SheetHeader = ({ title, onClose, closeTestID }: SheetHeaderProps) => (
  <React.Fragment>
    <Text style={styles.title}>{title}</Text>
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
    fontSize: 20,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: 24,
    letterSpacing: -0.5,
    marginRight: spacing.md,
    flex: 1,
  },
});

export default memo(SheetHeader);
