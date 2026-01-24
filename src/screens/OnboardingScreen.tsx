import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle } from "react-native-svg";

import { useAuth, type ApiError } from "@context/AuthContext";
import { RootStackParamList } from "@navigation/types";
import { typography } from "@theme/index";

// Lazy import to handle missing native module gracefully
let ImagePicker: typeof import("expo-image-picker") | null = null;
try {
  ImagePicker = require("expo-image-picker");
} catch (e) {
  console.warn("expo-image-picker not available:", e);
}

type OnboardingStep = 1 | 2 | 3;

// Person icon for avatar placeholder
const PersonIcon = () => (
  <Svg width={64} height={64} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={8} r={4} fill="#FFFFFF" />
    <Path
      d="M4 20c0-4 4-6 8-6s8 2 8 6"
      stroke="#FFFFFF"
      strokeWidth={2}
      fill="#FFFFFF"
    />
  </Svg>
);

// Camera icon for the badge
const CameraIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path
      d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z"
      stroke="#6B7280"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Circle cx={12} cy={13} r={4} stroke="#6B7280" strokeWidth={2} fill="none" />
  </Svg>
);

// Back arrow icon
const BackArrowIcon = () => <Feather name="chevron-left" size={24} color="#000000" />;

const OnboardingScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, updateProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  const [step, setStep] = useState<OnboardingStep>(1);
  const [name, setName] = useState(user?.name ?? "");
  const [nameSelection, setNameSelection] = useState<{start: number; end: number} | undefined>(undefined);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [gender, setGender] = useState<"Female" | "Male" | null>(null);
  const [age, setAge] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNameFocus = useCallback(() => {
    if (name === "") {
      setNameSelection({ start: 0, end: 0 });
    }
  }, [name]);

  const handleNameChange = useCallback((text: string) => {
    setName(text);
    setNameSelection(undefined);
  }, []);

  const pickImage = useCallback(async () => {
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
      setAvatarBase64(result.assets[0].base64);
    }
  }, []);

  const handleContinueStep1 = useCallback(() => {
    if (!name.trim()) {
      Alert.alert("Name Required", "Please enter your name.");
      return;
    }
    setStep(2);
  }, [name]);

  const handleContinueStep2 = useCallback(() => {
    if (!gender) {
      Alert.alert("Gender Required", "Please select your gender.");
      return;
    }
    setStep(3);
  }, [gender]);

  const handleDone = useCallback(async () => {
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 13 || ageNum > 120) {
      Alert.alert("Invalid Age", "Please enter a valid age between 13 and 120.");
      return;
    }

    if (!gender) {
      return;
    }

    setIsSubmitting(true);
    try {
      await updateProfile({
        name: name.trim(),
        gender,
        age: ageNum,
        avatar: avatarBase64 ?? undefined,
      });
      navigation.reset({
        index: 0,
        routes: [{ name: "Main" }],
      });
    } catch (error) {
      console.warn("Profile update failed", error);
      const status = error instanceof Error ? (error as ApiError).status : undefined;
      if (status === 401) {
        return;
      }
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to save profile.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [age, gender, name, avatarBase64, updateProfile, navigation]);

  const handleBack = useCallback(() => {
    if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      setStep(2);
    }
  }, [step]);

  const canContinueStep1 = name.trim().length > 0;
  const canContinueStep2 = gender !== null;
  const ageNum = parseInt(age, 10);
  const canDone = !isNaN(ageNum) && ageNum >= 13 && ageNum <= 120;
  const headerTopOffset = Math.round((screenHeight * 172) / 844);
  const containerTopPadding = insets.top + 16;
  const headerTopMargin = Math.max(0, headerTopOffset - containerTopPadding);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {step === 1 && (
        <View style={styles.stepContainer}>
          {/* Main content area */}
          <View style={styles.mainContent}>
            {/* Header */}
            <View style={[styles.headerSection, { marginTop: headerTopMargin }]}>
              <Text style={styles.title}>Enter personal Information</Text>
              <Text style={styles.subtitle}>
                Provide some information about you.
              </Text>
            </View>

            {/* Avatar and Name */}
            <View style={styles.avatarSection}>
              <TouchableOpacity
                onPress={pickImage}
                style={styles.avatarWrapper}
                testID="avatar-button"
                accessibilityRole="button"
              >
                {avatarBase64 ? (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${avatarBase64}` }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <LinearGradient
                    colors={["#818CF8", "#6366F1", "#8B5CF6"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarGradient}
                  >
                    <PersonIcon />
                  </LinearGradient>
                )}
                {/* Camera badge */}
                <View style={styles.cameraBadge}>
                  <CameraIcon />
                </View>
              </TouchableOpacity>

              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={handleNameChange}
                onFocus={handleNameFocus}
                selection={nameSelection}
                placeholder="Your Name"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
                autoCorrect={false}
                textAlign="center"
              />
            </View>
          </View>

          {/* Button - Fixed at bottom */}
          <View style={[styles.buttonSection, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={[
                styles.button,
                !canContinueStep1 && styles.buttonDisabled,
              ]}
              onPress={handleContinueStep1}
              disabled={!canContinueStep1}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.buttonText,
                  !canContinueStep1 && styles.buttonTextDisabled,
                ]}
              >
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={styles.stepContainer}>
          <TouchableOpacity
            onPress={handleBack}
            style={[
              styles.backButton,
              { position: "absolute", top: insets.top, left: 24 },
            ]}
            testID="back-button"
            accessibilityRole="button"
          >
            <BackArrowIcon />
          </TouchableOpacity>
          {/* Main content area */}
          <View style={styles.mainContent}>
            {/* Header with back button */}
            <View
              style={[styles.headerSectionWithBack, { marginTop: headerTopMargin }]}
            >
              <Text style={styles.title}>What's your gender?</Text>
              <Text style={styles.subtitle}>
                This can't be changed later. Your{"\n"}gender will not remain public.
              </Text>
            </View>

            {/* Gender Options */}
            <View style={styles.genderSection}>
              <View style={styles.genderOptions}>
                <TouchableOpacity
                  style={[
                    styles.genderButton,
                    gender === "Female" && styles.genderButtonSelected,
                  ]}
                  onPress={() => setGender("Female")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.genderButtonText,
                      gender === "Female" && styles.genderButtonTextSelected,
                    ]}
                  >
                    Female
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.genderButton,
                    gender === "Male" && styles.genderButtonSelected,
                  ]}
                  onPress={() => setGender("Male")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.genderButtonText,
                      gender === "Male" && styles.genderButtonTextSelected,
                    ]}
                  >
                    Male
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Button - Fixed at bottom */}
          <View style={[styles.buttonSection, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={[
                styles.button,
                !canContinueStep2 && styles.buttonDisabled,
              ]}
              onPress={handleContinueStep2}
              disabled={!canContinueStep2}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.buttonText,
                  !canContinueStep2 && styles.buttonTextDisabled,
                ]}
              >
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 3 && (
        <View style={styles.stepContainer}>
          <TouchableOpacity
            onPress={handleBack}
            style={[
              styles.backButton,
              { position: "absolute", top: insets.top, left: 24 },
            ]}
            testID="back-button"
            accessibilityRole="button"
          >
            <BackArrowIcon />
          </TouchableOpacity>
          {/* Main content area */}
          <View style={styles.mainContent}>
            {/* Header with back button */}
            <View
              style={[styles.headerSectionWithBack, { marginTop: headerTopMargin }]}
            >
              <Text style={styles.title}>What's your age?</Text>
              <Text style={styles.subtitle}>
                This can't be changed later. Your{"\n"}age will not remain public.
              </Text>
            </View>

            {/* Age Input */}
            <View style={styles.ageSection}>
              <TextInput
                style={styles.ageInput}
                value={age}
                onChangeText={setAge}
                placeholder="Enter Age"
                placeholderTextColor="#00000066"
                keyboardType="number-pad"
                maxLength={3}
                textAlign="center"
              />
            </View>
          </View>

          {/* Button - Fixed at bottom */}
          <View style={[styles.buttonSection, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={[
                styles.button,
                (!canDone || isSubmitting) && styles.buttonDisabled,
              ]}
              onPress={handleDone}
              disabled={!canDone || isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#9CA3AF" />
              ) : (
                <Text
                  style={[
                    styles.buttonText,
                    !canDone && styles.buttonTextDisabled,
                  ]}
                >
                  Done
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  stepContainer: {
    flex: 1,
    justifyContent: "space-between",
  },
  // Main content wrapper
  mainContent: {
    flex: 1,
    justifyContent: "flex-start",
  },
  // Header section - at top with padding
  headerSection: {
    paddingHorizontal: 24,
    marginBottom: 32,
    alignItems: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
  },
  title: {
    fontFamily: typography.fontFamilySemiBold,
    fontSize: 24,
    fontWeight: "600",
    color: "#000000",
    marginBottom: 12,
    textAlign: "center",
    lineHeight: 32,
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 16,
    fontWeight: "500",
    color: "#777777",
    lineHeight: 20,
    letterSpacing: -1,
    textAlign: "center",
  },
  // Header section with back button
  headerSectionWithBack: {
    paddingHorizontal: 24,
    paddingTop: 32,
    marginBottom: 48,
    alignItems: "center",
  },
  // Avatar section - centered horizontally
  avatarSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    marginTop: 24,
  },
  // Gender section
  genderSection: {
    paddingHorizontal: 24,
  },
  // Age section
  ageSection: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  // Content section - centered vertically (for steps 2 and 3)
  contentSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  // Avatar styles
  avatarWrapper: {
    position: "relative",
    marginBottom: 24,
  },
  avatarGradient: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  cameraBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // Name input - clean, no border
  nameInput: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 24,
    color: "#000000",
    textAlign: "center",
    paddingVertical: 12,
    minWidth: 150,
  },
  // Age input
  ageInput: {
    fontFamily: typography.fontFamilySemiBold,
    fontSize: 24,
    color: "#000000",
    textAlign: "center",
    lineHeight: Platform.select({ ios: 24, android: 26, default: 24 }),
    letterSpacing: -1,
    paddingVertical: 12,
    width: "100%",
  },
  // Gender options
  genderOptions: {
    flexDirection: "column",
    gap: 16,
    width: "100%",
    alignItems: "center",
  },
  genderButton: {
    width: 116,
    minHeight: 48,
    padding: 13.33,
    borderRadius: 13.33,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.33,
    borderColor: "#E6E6E6",
  },
  genderButtonSelected: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },
  genderButtonText: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 20,
    fontWeight: "500",
    lineHeight: 26.67,
    letterSpacing: -0.4,
    color: "#494949",
  },
  genderButtonTextSelected: {
    color: "#FFFFFF",
  },
  // Button section - fixed at bottom
  buttonSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  button: {
    backgroundColor: "#000000",
    height: 52,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 54,
  },
  buttonDisabled: {
    backgroundColor: "#E5E5E5",
  },
  buttonText: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 17,
    color: "#FFFFFF",
  },
  buttonTextDisabled: {
    color: "#9CA3AF",
  },
});

export default OnboardingScreen;
