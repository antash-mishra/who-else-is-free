import { memo } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@components/ui';
import { typography } from '@theme/index';

interface NotificationAccessModalProps {
  visible: boolean;
  message: string;
  onDismiss: () => void;
}

/**
 * Centered overlay shown when a user taps a notification whose event or
 * conversation is no longer accessible. The Discover Events page stays
 * visible behind the modal. Tapping anywhere outside the modal dismisses it.
 *
 * Styling per Figma spec: #D9D9D9 background, 325×153, 30px border radius.
 */
const NotificationAccessModal = ({ visible, message, onDismiss }: NotificationAccessModalProps) => {
  if (!visible) return null;

  const { height } = Dimensions.get('window');

  return (
    <View style={[styles.overlay, { height }]} pointerEvents="auto">
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()} accessibilityRole="alert">
          <AppText style={styles.message}>{message}</AppText>
        </Pressable>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#D9D9D9',
    borderRadius: 30,
    width: 325,
    height: 153,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  message: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: -0.3,
    color: 'rgba(0, 0, 0, 0.6)',
  },
});

export default memo(NotificationAccessModal);
