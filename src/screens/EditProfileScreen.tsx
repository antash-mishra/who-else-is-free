import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useCallback, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import ScreenContainer from "@components/ScreenContainer";
import UserAvatar from "@components/UserAvatar";
import { colors, spacing, typography } from "@theme/index";
import { useAuth, type ApiError } from "@context/AuthContext";
import { RootStackParamList } from "@navigation/types";
import CameraIcon from "@assets/camera.svg";

let ImagePicker: typeof import("expo-image-picker") | null = null;
try {
  ImagePicker = require("expo-image-picker");
} catch (e) {
  // expo-image-picker not available in Expo Go
}

type EditProfileNavigation = NativeStackNavigationProp<RootStackParamList>;

const EditProfileScreen = () => {
  const navigation = useNavigation<EditProfileNavigation>();
  const { user, updateProfile } = useAuth();

  const [editName, setEditName] = useState(user?.name ?? "");
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
    editName.trim() !== (user?.name ?? "") ||
    editAvatarBase64 !== null ||
    removedAvatar;

  const pickImage = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!ImagePicker) {
      Alert.alert(
        "Not Available",
        "Image picker requires a native rebuild. Avatar upload is disabled.",
      );
      return;
    }

    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert(
        "Permission Required",
        "Please allow access to your photo library to upload an avatar.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditAvatarBase64(null);
    setRemovedAvatar(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editName.trim() || !user) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        gender: user.gender ?? "Male",
        age: user.age ?? 18,
        avatar: avatarValue,
      });
      navigation.goBack();
    } catch (error) {
      const status =
        error instanceof Error ? (error as ApiError).status : undefined;
      if (status === 401) return;
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to save profile.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [editName, editAvatarBase64, removedAvatar, user, updateProfile, navigation]);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.backButton} />
      </View>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarWrapper}>
          <TouchableOpacity onPress={pickImage} accessibilityRole="button">
            <UserAvatar
              avatar={editAvatarValue}
              name={editName.trim() || user?.name}
              seed={user?.id ?? editName}
              size={80}
              style={styles.avatarFrame}
            />
            <View style={styles.cameraBadge}>
              <CameraIcon width={14} height={14} />
            </View>
          </TouchableOpacity>
          {editAvatarValue && (
            <TouchableOpacity
              style={styles.removeBadge}
              onPress={handleRemoveAvatar}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
            >
              <Feather name="x" size={13} color="#FFFFFF" />
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

      {/* Save Button */}
      <Pressable
        style={[
          styles.saveButton,
          (!editHasChanges || isSubmitting) && styles.saveButtonDisabled,
        ]}
        onPress={handleSave}
        disabled={!editHasChanges || isSubmitting}
        accessibilityRole="button"
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.saveButtonText}>Save</Text>
        )}
      </Pressable>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    letterSpacing: -0.4,
  },
  backButton: {
    width: 32,
    height: 44,
    justifyContent: "center",
  },
  avatarSection: {
    alignItems: "center",
    paddingTop: spacing.xl,
    marginBottom: spacing.md,
  },
  avatarWrapper: {
    position: "relative",
    marginBottom: 16,
  },
  avatarFrame: {
    width: 80,
    height: 80,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: "#E6E6E6",
  },
  cameraBadge: {
    position: "absolute",
    bottom: -2,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  removeBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  nameInput: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 24,
    color: "#000000",
    textAlign: "center",
    paddingVertical: 8,
    minWidth: 200,
    letterSpacing: -0.5,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    borderCurve: "continuous",
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: colors.buttonText,
    fontSize: 18,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: 24,
    letterSpacing: -0.5,
    textAlign: "center",
  },
});

export default EditProfileScreen;
