import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCallback, useState } from 'react';
import { BlurView } from 'expo-blur';
import ScalePressable from '@components/ScalePressable';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import CloseIcon from '@assets/ui/close.svg';

import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import UserAvatar from '@components/UserAvatar';
import { colors, typography } from '@theme/index';
import { useAuth, type ApiError } from '@context/AuthContext';
import { RootStackParamList } from '@navigation/types';
import { triggerHaptic } from '@services/haptics';
import CameraIcon from '@assets/onboarding/camera.svg';
import ProfileIcon from '@assets/onboarding/profile.svg';
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
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library to upload an avatar.',
      );
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
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save profile.');
    } finally {
      setIsSubmitting(false);
    }
  }, [editName, editAvatarBase64, removedAvatar, user, updateProfile, navigation]);

  return (
    <ScreenContainer>
      <View style={styles.inner}>
        <ScreenHeader title="Edit Profile" onBack={navigation.goBack} />

        {/* Avatar + Name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <TouchableOpacity onPress={pickImage} accessibilityRole="button">
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
              <View style={styles.cameraBadgeShadow}>
                <BlurView style={styles.cameraBadge} intensity={15} tint="light">
                  <CameraIcon width={20} height={20} color={colors.iconColor} />
                </BlurView>
              </View>
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
            placeholder="Your Name"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
            autoCorrect={false}
            textAlign="center"
            returnKeyType="done"
            maxLength={50}
          />
        </View>

        {/* Save Button — pinned to bottom */}
        <View style={styles.buttonSection}>
          <ScalePressable
            onPress={handleSave}
            disabled={!editHasChanges || isSubmitting}
            style={[
              styles.saveButton,
              (!editHasChanges || isSubmitting) && styles.saveButtonDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : (
              <Text
                style={[
                  styles.saveButtonText,
                  (!editHasChanges || isSubmitting) && styles.saveButtonTextDisabled,
                ]}
              >
                Save
              </Text>
            )}
          </ScalePressable>
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
  cameraBadgeShadow: {
    position: 'absolute',
    bottom: 4,
    right: -2,
    width: 40,
    height: 40,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cameraBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
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
    letterSpacing: -0.5,
  },
  buttonSection: {
    paddingHorizontal: 16,
  },
  saveButton: {
    backgroundColor: colors.primaryButtonBackground,
    borderRadius: 999,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#E5E5E5',
  },
  saveButtonText: {
    color: colors.buttonText,
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    textAlign: 'center',
  },
  saveButtonTextDisabled: {
    color: '#9CA3AF',
  },
});

export default EditProfileScreen;
