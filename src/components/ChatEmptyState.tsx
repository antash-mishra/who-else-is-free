import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@theme/index';

interface ChatEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

const ChatEmptyState = ({
  title,
  description,
  actionLabel,
  onActionPress,
}: ChatEmptyStateProps) => {
  return (
    <View style={styles.container}>
      <Image
        source={require('@assets/chat_screen_empty_state_default.png')}
        style={styles.image}
        resizeMode="contain"
      />
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
    gap: 20,
  },
  image: {
    width: 245,
    height: 245,
  },
  textContainer: {
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: 20,
    letterSpacing: -0.5,
    color: '#000000',
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    lineHeight: 20,
    letterSpacing: -0.5,
    color: '#707070',
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.buttonBackground,
    borderRadius: 24,
  },
  buttonText: {
    color: colors.buttonText,
    fontSize: typography.body,
    fontFamily: typography.fontFamilySemiBold,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
});

export default memo(ChatEmptyState);
