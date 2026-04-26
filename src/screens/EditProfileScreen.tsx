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
import ScalePressable from "@components/ScalePressable";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const insets = useSafeAreaInsets();

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
<<<<<<< Updated upstream
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
=======
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack(); }}
            style={styles.backButton}
            hitSlop={8}
          >
            <Feather name="chevron-left" size={20} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Profile</Text>
>>>>>>> Stashed changes
        </View>

        {/* Avatar + Name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <TouchableOpacity onPress={pickImage} accessibilityRole="button">
              {editAvatarUri ? (
                <Image source={{ uri: editAvatarUri }} style={styles.avatarImage} />
              ) : (
                <LinearGradient
                  colors={["#818CF8", "#6366F1", "#8B5CF6"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarGradient}
                >
                  <Text style={styles.avatarInitial}>
                    {user?.name?.charAt(0).toUpperCase() ?? "?"}
                  </Text>
                </LinearGradient>
              )}
              <View style={styles.cameraBadge}>
                <CameraIcon width={20} height={20} />
              </View>
            </TouchableOpacity>
            {editAvatarUri && (
              <TouchableOpacity
                style={styles.removeBadge}
                onPress={handleRemoveAvatar}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <Feather name="x" size={16} color="#FFFFFF" />
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
            style={[styles.saveButton, (!editHasChanges || isSubmitting) && styles.saveButtonDisabled]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : (
              <Text style={[styles.saveButtonText, (!editHasChanges || isSubmitting) && styles.saveButtonTextDisabled]}>
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
    justifyContent: "space-between",
  },
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
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 100,
  },
  avatarWrapper: {
    position: "relative",
    marginBottom: 24,
  },
<<<<<<< Updated upstream
  avatarFrame: {
    width: 80,
    height: 80,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: "#E6E6E6",
=======
  avatarGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarInitial: {
    fontSize: 40,
    color: "#FFFFFF",
    fontFamily: typography.fontFamilyBold,
>>>>>>> Stashed changes
  },
  cameraBadge: {
    position: "absolute",
    bottom: 4,
    right: -2,
    width: 40,
    height: 40,
    borderRadius: 20,
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
    top: 0,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
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
    paddingVertical: 12,
    minWidth: 200,
    letterSpacing: -0.5,
  },
  buttonSection: {
    paddingHorizontal: 16,
  },
  saveButton: {
    backgroundColor: "#000000",
    borderRadius: 999,
    borderCurve: "continuous",
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#E5E5E5",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    textAlign: "center",
  },
  saveButtonTextDisabled: {
    color: "#9CA3AF",
  },
});

export default EditProfileScreen;
