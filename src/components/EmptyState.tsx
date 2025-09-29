import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import CreateEventIllustration from '@assets/create-event.svg';
import { colors, spacing, typography } from '@theme/index';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel: string;
  onActionPress?: () => void;
}

const EmptyState = ({ title, description, actionLabel, onActionPress }: EmptyStateProps) => {
  return (
    <View style={styles.container}>
      <CreateEventIllustration width={88} height={88} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Pressable style={styles.button} onPress={onActionPress}>
        <Text style={styles.buttonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md
  },
  title: {
    fontSize: typography.subtitle,
    color: colors.text,
    fontFamily: typography.fontFamilySemiBold,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  description: {
    fontSize: typography.body,
    color: colors.subText,
    textAlign: 'center',
    maxWidth: 240,
    fontFamily: typography.fontFamilyRegular,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.buttonBackground,
    borderRadius: 24
  },
  buttonText: {
    color: colors.buttonText,
    fontSize: typography.body,
    fontFamily: typography.fontFamilySemiBold,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  }
});

export default memo(EmptyState);
