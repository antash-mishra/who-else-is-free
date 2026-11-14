import { memo } from 'react';
import { Image, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import { AppButton, AppText } from '@components/ui';
import { colors, componentTokens, spacing, typography } from '@theme/index';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
  secondaryActionLabel?: string;
  onSecondaryActionPress?: () => void;
  imageSource?: ImageSourcePropType;
  imageSize?: number;
  imageWidth?: number;
  imageHeight?: number;
  illustration?: React.FC<SvgProps>;
  illustrationSize?: number;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const EmptyState = ({
  title,
  description,
  actionLabel,
  onActionPress,
  secondaryActionLabel,
  onSecondaryActionPress,
  imageSource,
  imageSize,
  imageWidth = imageSize ?? 245,
  imageHeight = imageSize ?? 245,
  illustration: Illustration,
  illustrationSize = 245,
  icon,
  style,
}: EmptyStateProps) => {
  return (
    <View style={[styles.container, style]} testID="empty-state">
      {icon}
      {imageSource && (
        <Image
          source={imageSource}
          style={[styles.image, { width: imageWidth, height: imageHeight }]}
          resizeMode="contain"
        />
      )}
      {!icon && !imageSource && Illustration ? (
        <Illustration width={illustrationSize} height={illustrationSize} />
      ) : null}
      <View style={styles.textContainer}>
        <AppText variant="subtitle" style={styles.title}>
          {title}
        </AppText>
        <AppText variant="body" style={styles.description}>
          {description}
        </AppText>
      </View>
      {actionLabel || secondaryActionLabel ? (
        <View style={styles.buttonContainer}>
          {secondaryActionLabel ? (
            <AppButton
              label={secondaryActionLabel}
              variant="secondary"
              style={styles.secondaryButton}
              onPress={() => onSecondaryActionPress?.()}
            />
          ) : null}
          {actionLabel ? (
            <AppButton
              label={actionLabel}
              variant="primary"
              style={styles.button}
              onPress={() => onActionPress?.()}
              testID="empty-state-action"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  image: {
    maxWidth: '82%',
  },
  textContainer: {
    // Pull the text block up so the image→title gap is spacing.xs (4) while the
    // container's other gaps (title block → buttons) stay spacing.md.
    marginTop: spacing.xs - spacing.md,
    // Title → description, matching Profile's signed-out card. FullPageEmptyState's
    // TEXT_BLOCK_HEIGHT counts this.
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: typography.subtitle,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: 20,
    letterSpacing: typography.letterSpacing,
  },
  description: {
    // One size below body, matching Profile's signed-out card.
    fontSize: typography.body - 1,
    color: colors.mutedText,
    textAlign: 'center',
    fontFamily: typography.fontFamilyRegular,
    lineHeight: 20,
    letterSpacing: typography.letterSpacing,
    maxWidth: 280,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    height: componentTokens.emptyStateButton.height,
    minHeight: componentTokens.emptyStateButton.height,
    borderRadius: componentTokens.emptyStateButton.radius,
  },
  secondaryButton: {
    height: componentTokens.emptyStateButton.height,
    minHeight: componentTokens.emptyStateButton.height,
    borderRadius: componentTokens.emptyStateButton.radius,
  },
});

export default memo(EmptyState);
