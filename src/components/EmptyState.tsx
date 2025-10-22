import { ComponentType, memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgProps } from 'react-native-svg';

import CreateEventIllustration from '@assets/create-event.svg';
import { colors, spacing, typography } from '@theme/index';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
  illustration?: ComponentType<SvgProps>;
  illustrationSize?: number;
}

const EmptyState = ({
  title,
  description,
  actionLabel,
  onActionPress,
  illustration: Illustration = CreateEventIllustration,
  illustrationSize = 88
}: EmptyStateProps) => {
  return (
    <View style={styles.container}>
      <Illustration width={illustrationSize} height={illustrationSize} />    
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {actionLabel ? (
        <Pressable style={styles.button} onPress={onActionPress}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20
  },
  textContainer: {
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  title: {
    fontSize: 17,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: 14,
    letterSpacing: typography.letterSpacing
  },
  description: {
    fontSize: typography.body,
    color: '#7C7C7C',
    textAlign: 'center',
    fontFamily: typography.fontFamilyRegular,
    lineHeight: 20,
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
