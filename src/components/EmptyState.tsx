import { memo } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors, typography } from '@theme/index';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
  secondaryActionLabel?: string;
  onSecondaryActionPress?: () => void;
  imageSource?: ImageSourcePropType;
  imageWidth?: number;
  imageHeight?: number;
}

const EmptyState = ({
  title,
  description,
  actionLabel,
  onActionPress,
  secondaryActionLabel,
  onSecondaryActionPress,
  imageSource,
  imageWidth = 245,
  imageHeight = 245
}: EmptyStateProps) => {
  return (
    <View style={styles.container} testID="empty-state">
      {imageSource && (
        <Image
          source={imageSource}
          style={{ width: imageWidth, height: imageHeight }}
          resizeMode="contain"
        />
      )}
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {(actionLabel || secondaryActionLabel) ? (
        <View style={styles.buttonContainer}>
          {secondaryActionLabel ? (
            <Pressable style={styles.secondaryButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSecondaryActionPress?.(); }}>
              <Text style={styles.secondaryButtonText}>{secondaryActionLabel}</Text>
            </Pressable>
          ) : null}
          {actionLabel ? (
            <Pressable style={styles.button} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onActionPress?.(); }} testID="empty-state-action">
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
    letterSpacing: typography.letterSpacing,
    maxWidth: 280,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10
  },
  button: {
    height: 52,
    borderRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: '#000000',
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamilyMedium,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.3,
    textAlign: 'center'
  },
  secondaryButton: {
    height: 52,
    borderRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: '#E6E6E6',
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: '#000000',
    fontFamily: typography.fontFamilyMedium,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.3,
    textAlign: 'center'
  }
});

export default memo(EmptyState);
