import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  Keyboard,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { useAuth, type ApiError } from "@context/AuthContext";
import { RootStackParamList } from "@navigation/types";
import { typography } from "@theme/index";
import AvatarPlaceholder from "@assets/avatar.png";
import CameraIcon from "@assets/camera.svg";

// Lazy import to handle missing native module gracefully
let ImagePicker: typeof import("expo-image-picker") | null = null;
try {
  ImagePicker = require("expo-image-picker");
} catch (e) {
  console.warn("expo-image-picker not available:", e);
}

type OnboardingStep = 1 | 2 | 3;

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
  const [age, setAge] = useState("30");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Wheel picker
  const wheelScrollRef = useRef<ScrollView>(null);
  const hasScrolledToDefault = useRef(false);
  const ITEM_HEIGHT = 50;
  const MIN_AGE = 18;
  const MAX_AGE = 120;
  const DEFAULT_AGE = 30;
  const ages = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => i + MIN_AGE); // 18 to 120

  // Scroll to default age (30) only once when entering step 3
  useEffect(() => {
    if (step === 3 && !hasScrolledToDefault.current) {
      hasScrolledToDefault.current = true;
      const index = DEFAULT_AGE - MIN_AGE;
      setTimeout(() => {
        wheelScrollRef.current?.scrollTo({
          y: index * ITEM_HEIGHT,
          animated: false,
        });
      }, 50);
    }
  }, [step]);

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
      setAvatarBase64(result.assets[0].base64);
    }
  }, []);

  const handleContinueStep1 = useCallback(() => {
    if (!name.trim()) {
      Alert.alert("Name Required", "Please enter your name.");
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(2);
  }, [name]);

  const handleContinueStep2 = useCallback(() => {
    if (!gender) {
      Alert.alert("Gender Required", "Please select your gender.");
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(3);
  }, [gender]);

  const handleDone = useCallback(async () => {
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < MIN_AGE || ageNum > MAX_AGE) {
      Alert.alert("Invalid Age", `Please enter a valid age between ${MIN_AGE} and ${MAX_AGE}.`);
      return;
    }

    if (!gender) {
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      setStep(2);
    }
  }, [step]);

  const canContinueStep1 = name.trim().length > 0;
  const canContinueStep2 = gender !== null;
  const ageNum = parseInt(age, 10);
  const canDone = !isNaN(ageNum) && ageNum >= MIN_AGE && ageNum <= MAX_AGE;
  const headerTopOffset = Math.round((screenHeight * 172) / 844);
  const containerTopPadding = insets.top + 16;
  const headerTopMargin = Math.max(0, headerTopOffset - containerTopPadding);

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + 16 }]}
    >
      {step === 1 && (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
                <View style={styles.avatarWrapper}>
                  <TouchableOpacity
                    onPress={pickImage}
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
                        <Image
                          source={AvatarPlaceholder}
                          style={styles.avatarPlaceholderImage}
                        />
                      </LinearGradient>
                    )}
                    {/* Camera badge */}
                    <View style={styles.cameraBadge}>
                      <CameraIcon width={20} height={20}/>
                    </View>
                  </TouchableOpacity>
                  {/* Remove photo button */}
                  {avatarBase64 && (
                    <TouchableOpacity
                      style={styles.removePhotoBadge}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setAvatarBase64(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                    >
                      <Feather name="x" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>

                <TextInput
                  style={styles.nameInput}
                  value={name}
                  onChangeText={handleNameChange}
                  onFocus={handleNameFocus}
                  onSubmitEditing={Keyboard.dismiss}
                  selection={nameSelection}
                  placeholder="Your Name"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  autoCorrect={false}
                  textAlign="center"
                  returnKeyType="done"
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
        </TouchableWithoutFeedback>
      )}

      {step === 2 && (
        <View style={styles.stepContainer}>
          <TouchableOpacity
            onPress={handleBack}
            style={[
              styles.backButton,
              { position: "absolute", top: 0, left: 24 },
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
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setGender("Female");
                  }}
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
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setGender("Male");
                  }}
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
              { position: "absolute", top: 0, left: 24, zIndex: 10 },
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

            {/* Wheel Picker */}
            <View style={styles.wheelPickerContainer}>
              <View style={styles.wheelPickerHighlight} />
              <ScrollView
                ref={wheelScrollRef}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                contentContainerStyle={{
                  paddingVertical: ITEM_HEIGHT * 2,
                }}
                onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                  const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
                  if (ages[index]) {
                    void Haptics.selectionAsync();
                    setAge(String(ages[index]));
                  }
                }}
              >
                {ages.map((ageVal) => (
                  <TouchableOpacity
                    key={ageVal}
                    style={styles.wheelPickerItem}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setAge(String(ageVal));
                      const index = ages.indexOf(ageVal);
                      wheelScrollRef.current?.scrollTo({
                        y: index * ITEM_HEIGHT,
                        animated: true,
                      });
                    }}
                  >
                    <Text
                      style={[
                        styles.wheelPickerText,
                        age === String(ageVal) && styles.wheelPickerTextSelected,
                      ]}
                    >
                      {ageVal}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
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
    </View>
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
    marginBottom: 8,
    textAlign: "center",
    lineHeight: 32,
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: typography.fontFamilyRegular,
    fontSize: 16,
    fontWeight: "500",
    color: "#777777",
    lineHeight: 20,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  // Header section with back button (same as headerSection for alignment)
  headerSectionWithBack: {
    paddingHorizontal: 24,
    marginBottom: 32,
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
  avatarPlaceholderImage: {
    width: 64,
    height: 64,
    resizeMode: "contain",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 4,
    right: -2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "white",
    // borderWidth: 2,
    // borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  removePhotoBadge: {
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
  // Name input - clean, no border
  nameInput: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 24,
    color: "#000000",
    textAlign: "center",
    paddingVertical: 12,
    minWidth: 200,
    letterSpacing: -0.5,
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
    borderRadius: 16,
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
  // Wheel picker styles
  wheelPickerContainer: {
    height: 250,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 24,
  },
  wheelPickerHighlight: {
    position: "absolute",
    top: "50%",
    width: 240,
    height: 50,
    marginTop: -25,
    backgroundColor: "#F0F0F0",
    borderRadius: 12,
  },
  wheelPickerItem: {
    width: 240,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  wheelPickerText: {
    fontSize: 24,
    fontFamily: typography.fontFamilyMedium,
    color: "#CCCCCC",
  },
  wheelPickerTextSelected: {
    fontSize: 28,
    fontFamily: typography.fontFamilySemiBold,
    color: "#000000",
  },
});

export default OnboardingScreen;
