import { useState, useCallback } from 'react';
import { Alert, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import UserAvatar from '@components/UserAvatar';
import AvatarEditBadge from '@components/AvatarEditBadge';
import { AppButton } from '@components/ui';
import { useAuth, type ApiError } from '@context/AuthContext';
import { RootStackParamList } from '@navigation/types';
import { triggerHaptic } from '@services/haptics';
import { logger } from '@services/logger';
import { colors, typography } from '@theme/index';
import ProfileIcon from '@assets/onboarding/profile.svg';
import CloseIcon from '@assets/ui/close.svg';
import AvatarBackground from '@components/AvatarBackground';
import { getAvatarColor } from '@utils/avatar';

let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  // expo-image-picker not available in Expo Go
}

type EditProfileNavigation = NativeStackNavigationProp<RootStackParamList>;

const EditProfileScreen = () => {
  const navigation = useNavigation<EditProfileNavigation>();
  const { user, updateProfile } = useAuth();
  const avatarColor = getAvatarColor(user?.id);
  const [editName, setEditName] = useState(user?.name ?? '');
  const [editAvatarBase64, setEditAvatarBase64] = useState<string | null>(null);
  const [removedAvatar, setRemovedAvatar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const editAvatarValue = removedAvatar
    ? null
    : editAvatarBase64
      ? editAvatarBase64
      : user?.avatar
        ? user.avatar
        : null;

  const editHasChanges =
    editName.trim() !== (user?.name ?? '') || editAvatarBase64 !== null || removedAvatar;

  const pickImage = useCallback(async () => {
    triggerHaptic('light');
    if (!ImagePicker) {
      Alert.alert(
        'Not Available',
        'Image picker requires a native rebuild. Avatar upload is disabled.',
      );
      return;
    }

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to add a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0]?.base64) {
      setEditAvatarBase64(result.assets[0].base64);
      setRemovedAvatar(false);
    }
  }, []);

  const handleRemoveAvatar = useCallback(() => {
    triggerHaptic('light');
    setEditAvatarBase64(null);
    setRemovedAvatar(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editName.trim() || !user) return;

    triggerHaptic('submit');
    setIsSubmitting(true);
    try {
      let avatarValue: string | undefined;
      if (editAvatarBase64) {
        avatarValue = editAvatarBase64;
      } else if (removedAvatar) {
        avatarValue = undefined;
      } else {
        avatarValue = user.avatar ?? undefined;
      }

      await updateProfile({
        name: editName.trim(),
        gender: user.gender ?? 'Male',
        age: user.age ?? 18,
        avatar: avatarValue,
      });
      navigation.navigate('Main', {
        screen: 'Profile',
        params: { showProfileUpdatedBadge: true },
      });
    } catch (error) {
      const status = error instanceof Error ? (error as ApiError).status : undefined;
      if (status === 401) return;
      logger.warn('Profile update failed:', error instanceof Error ? error.message : error);
      Alert.alert(
        "Couldn't save your changes",
        'Something went wrong on our end. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [editName, editAvatarBase64, removedAvatar, user, updateProfile, navigation]);

  return (
    <ScreenContainer>
      <View style={styles.inner}>
        <ScreenHeader title="Edit profile" onBack={navigation.goBack} />

        {/* Avatar + Name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <TouchableOpacity
              onPress={pickImage}
              accessibilityRole="button"
              accessibilityLabel={editAvatarValue ? 'Change photo' : 'Add photo'}
            >
              {!editAvatarValue && !editName.trim() ? (
                <View style={[styles.avatarPlaceholder, { backgroundColor: avatarColor }]}>
                  <AvatarBackground seed={user?.id} name={editName.trim() || user?.name} />
                  <ProfileIcon width={52} height={52} />
                </View>
              ) : (
                <UserAvatar
                  avatar={editAvatarValue}
                  name={editName.trim() || user?.name}
                  seed={user?.id ?? editName}
                  size={120}
                  style={styles.avatarFrame}
                />
              )}
              <AvatarEditBadge />
            </TouchableOpacity>
            {editAvatarValue && (
              <TouchableOpacity
                style={styles.removeBadge}
                onPress={handleRemoveAvatar}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <CloseIcon width={16} height={16} color={colors.buttonText} />
              </TouchableOpacity>
            )}
          </View>

          <TextInput
            style={styles.nameInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Your name"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="words"
            autoCorrect={false}
            textAlign="center"
            returnKeyType="done"
            maxLength={50}
          />
        </View>

        {/* Save Button — pinned to bottom */}
        <View style={styles.buttonSection}>
          <AppButton
            label="Save"
            variant="primary"
            fullWidth
            onPress={handleSave}
            disabled={!editHasChanges}
            loading={isSubmitting}
          />
        </View>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  inner: {
    flex: 1,
    justifyContent: 'space-between',
  },
  avatarSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 24,
  },
  avatarFrame: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden', // clip the gradient background to the circle
  },
  removeBadge: {
    position: 'absolute',
    top: 0,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryButtonBackground,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  nameInput: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 12,
    minWidth: 200,
    letterSpacing: typography.inputLetterSpacing,
  },
  // ScreenContainer already provides the 16dp horizontal screen padding, so the
  // full-width Save button matches Onboarding's Continue without extra margins.
  buttonSection: {
    paddingTop: 16,
    paddingBottom: 8,
  },
});

export default EditProfileScreen;
