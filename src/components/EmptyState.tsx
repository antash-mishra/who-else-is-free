import { ComponentType, memo } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgProps } from 'react-native-svg';

import CreateEventIllustration from '@assets/create-event.svg';
import { colors, spacing, typography } from '@theme/index';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
  secondaryActionLabel?: string;
  onSecondaryActionPress?: () => void;
  illustration?: ComponentType<SvgProps>;
  illustrationSize?: number;
  imageSource?: ImageSourcePropType;
  imageSize?: number;
}

const EmptyState = ({
  title,
  description,
  actionLabel,
  onActionPress,
  secondaryActionLabel,
  onSecondaryActionPress,
  illustration: Illustration = CreateEventIllustration,
  illustrationSize = 245,
  imageSource,
  imageSize = 245
}: EmptyStateProps) => {
  return (
    <View style={styles.container} testID="empty-state">
      {imageSource ? (
        <Image
          source={imageSource}
          style={{ width: imageSize, height: imageSize }}
          resizeMode="contain"
        />
      ) : (
        <Illustration width={illustrationSize} height={illustrationSize} />
      )}    
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {(actionLabel || secondaryActionLabel) ? (
        <View style={styles.buttonContainer}>
          {secondaryActionLabel ? (
            <Pressable style={styles.secondaryButton} onPress={onSecondaryActionPress}>
              <Text style={styles.secondaryButtonText}>{secondaryActionLabel}</Text>
            </Pressable>
          ) : null}
          {actionLabel ? (
            <Pressable style={styles.button} onPress={onActionPress} testID="empty-state-action">
              <Text style={styles.buttonText}>{actionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingBottom: '20%'
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
    lineHeight: 20,
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
  buttonContainer: {
    flexDirection: 'row',
    gap: 10
  },
  button: {
    width: 173,
    height: 48,
    borderRadius: 52,
    backgroundColor: colors.buttonBackground,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: {
    color: colors.buttonText,
    fontFamily: typography.fontFamilyMedium,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.5,
    textAlign: 'center'
  },
  secondaryButton: {
    width: 173,
    height: 48,
    borderRadius: 52,
    backgroundColor: '#E6E6E6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: colors.buttonBackground,
    fontFamily: typography.fontFamilyMedium,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.5,
    textAlign: 'center'
  }
});

export default memo(EmptyState);
