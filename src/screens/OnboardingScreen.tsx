import { useState, useCallback, useRef } from 'react';

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Alert,
  useWindowDimensions,
  Keyboard,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

import CameraIcon from '@assets/onboarding/camera.svg';
import ProfileIcon from '@assets/onboarding/profile.svg';
import ChevronLeftIcon from '@assets/ui/chevron-left.svg';
import CloseIcon from '@assets/ui/close.svg';
import { AppButton, IconButton } from '@components/ui';
import UserAvatar from '@components/UserAvatar';
import { userGenderOptions, type UserGender } from '@constants/profileOptions';
import { useAuth, type ApiError } from '@context/AuthContext';
import { RootStackParamList } from '@navigation/types';
import { triggerHaptic } from '@services/haptics';
import { logger } from '@services/logger';
import { colors, typography } from '@theme/index';
import { getAvatarColor } from '@utils/avatar';

// Lazy import to handle missing native module gracefully
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  logger.warn('expo-image-picker not available:', e);
}

type OnboardingStep = 1 | 2 | 3;

// Back arrow icon
const BackArrowIcon = () => <ChevronLeftIcon width={28} height={28} color={colors.text} />;

const OnboardingScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, updateProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height: screenHeight } = useWindowDimensions();
  const avatarColor = getAvatarColor(user?.id);

  const [step, setStep] = useState<OnboardingStep>(1);

  const slideX = useSharedValue(0);
  const pagerAnimStyle = useAnimatedStyle(() => ({
    flexDirection: 'row',
    width: width * 3,
    flex: 1,
    transform: [{ translateX: slideX.value }],
  }));

  const goForward = useCallback(
    (nextStep: OnboardingStep) => {
      setStep(nextStep);
      slideX.value = withTiming(-(nextStep - 1) * width, {
        duration: 350,
        easing: Easing.out(Easing.cubic),
      });
    },
    [slideX, width],
  );

  const goBack = useCallback(
    (prevStep: OnboardingStep) => {
      setStep(prevStep);
      slideX.value = withTiming(-(prevStep - 1) * width, {
        duration: 350,
        easing: Easing.out(Easing.cubic),
      });
    },
    [slideX, width],
  );
  const [name, setName] = useState(user?.name ?? '');
  const [nameSelection, setNameSelection] = useState<{ start: number; end: number } | undefined>(
    undefined,
  );
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [gender, setGender] = useState<UserGender | null>(null);
  const [age, setAge] = useState('30');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Wheel picker
  const wheelScrollRef = useRef<ScrollView>(null);
  const ITEM_HEIGHT = 50;
  const MIN_AGE = 18;
  const MAX_AGE = 120;
  const DEFAULT_AGE = 30;
  const ages = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => i + MIN_AGE); // 18 to 120

  const handleNameFocus = useCallback(() => {
    if (name === '') {
      setNameSelection({ start: 0, end: 0 });
    }
  }, [name]);

  const handleNameChange = useCallback((text: string) => {
    setName(text);
    setNameSelection(undefined);
  }, []);

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
      setAvatarBase64(result.assets[0].base64);
    }
  }, []);

  const handleContinueStep1 = useCallback(() => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter your name.');
      return;
    }
    goForward(2);
  }, [name, goForward]);

  const handleContinueStep2 = useCallback(() => {
    if (!gender) {
      Alert.alert('Gender Required', 'Please select your gender.');
      return;
    }
    goForward(3);
  }, [gender, goForward]);

  const handleDone = useCallback(async () => {
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < MIN_AGE || ageNum > MAX_AGE) {
      Alert.alert('Invalid Age', `Please enter a valid age between ${MIN_AGE} and ${MAX_AGE}.`);
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
        routes: [
          {
            name: 'Main',
            params: { screen: 'Events', params: { showWelcomeBadge: true } },
          },
        ],
      });
    } catch (error) {
      logger.warn('Profile update failed', error);
      const status = error instanceof Error ? (error as ApiError).status : undefined;
      if (status === 401) {
        return;
      }
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save profile.');
    } finally {
      setIsSubmitting(false);
    }
  }, [age, gender, name, avatarBase64, updateProfile, navigation]);

  const handleBack = useCallback(() => {
    if (step === 2) {
      goBack(1);
    } else if (step === 3) {
      goBack(2);
    }
  }, [step, goBack]);

  const canContinueStep1 = name.trim().length > 0;
  const canContinueStep2 = gender !== null;
  const ageNum = parseInt(age, 10);
  const canDone = !isNaN(ageNum) && ageNum >= MIN_AGE && ageNum <= MAX_AGE;
  const headerTopOffset = Math.round((screenHeight * 172) / 844);
  const containerTopPadding = insets.top + 16;
  const headerTopMargin = Math.max(0, headerTopOffset - containerTopPadding);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <Svg style={StyleSheet.absoluteFillObject} width={width} height={screenHeight}>
        <Defs>
          <RadialGradient
            id="onboardingBg"
            cx={width / 2}
            cy={0}
            r={screenHeight}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0.24" stopColor={colors.onboardingGradientStart} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.onboardingGradientEnd} stopOpacity="1" />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={screenHeight} fill="url(#onboardingBg)" opacity={0.7} />
      </Svg>
      <Animated.View style={pagerAnimStyle}>
        {/* Step 1 */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={[styles.stepContainer, { width }]}>
            {/* Main content area */}
            <View style={styles.mainContent}>
              {/* Header */}
              <View style={[styles.headerSection, { marginTop: headerTopMargin }]}>
                <Text style={styles.title}>What's your name?</Text>
                <Text style={styles.subtitle}>
                  Add your name and a photo so{'\n'}others know who you are.
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
                    {!avatarBase64 && !name.trim() ? (
                      <View style={[styles.avatarPlaceholder, { backgroundColor: avatarColor }]}>
                        <ProfileIcon width={52} height={52} />
                      </View>
                    ) : (
                      <UserAvatar
                        avatar={avatarBase64}
                        name={name.trim()}
                        seed={user?.id}
                        size={120}
                        style={styles.avatarFrame}
                      />
                    )}
                    {/* Camera badge */}
                    <View style={styles.cameraBadgeShadow}>
                      <BlurView style={styles.cameraBadge} intensity={15} tint="light">
                        <CameraIcon width={20} height={20} color={colors.iconColor} />
                      </BlurView>
                    </View>
                  </TouchableOpacity>
                  {/* Remove photo button */}
                  {avatarBase64 && (
                    <TouchableOpacity
                      style={styles.removePhotoBadge}
                      onPress={() => {
                        triggerHaptic('light');
                        setAvatarBase64(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                    >
                      <CloseIcon width={16} height={16} color={colors.buttonText} />
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
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                  autoCorrect={false}
                  textAlign="center"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Button - Fixed at bottom */}
            <View style={[styles.buttonSection, { paddingBottom: insets.bottom + 16 }]}>
              <AppButton
                label="Continue"
                variant="primary"
                fullWidth
                onPress={handleContinueStep1}
                disabled={!canContinueStep1}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>

        {/* Step 2 */}
        <View style={[styles.stepContainer, { width }]}>
          <View style={styles.backButtonWrapper}>
            <IconButton
              icon={<BackArrowIcon />}
              onPress={handleBack}
              accessibilityLabel="Go back"
              testID="back-button"
            />
          </View>
          {/* Main content area */}
          <View style={styles.mainContent}>
            {/* Header with back button */}
            <View style={[styles.headerSectionWithBack, { marginTop: headerTopMargin }]}>
              <Text style={styles.title}>What's your gender?</Text>
              <Text style={styles.subtitle}>
                {'This is private and will never\nbe shown publicly.'}
              </Text>
            </View>

            {/* Gender Options */}
            <View style={styles.genderSection}>
              <View style={styles.genderOptions}>
                {userGenderOptions.map((option) => {
                  const isSelected = gender === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.genderButton, isSelected && styles.genderButtonSelected]}
                      onPress={() => {
                        triggerHaptic('selection');
                        setGender(option);
                      }}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityLabel={option}
                      accessibilityState={{ checked: isSelected }}
                    >
                      <Text
                        style={[
                          styles.genderButtonText,
                          isSelected && styles.genderButtonTextSelected,
                        ]}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Button - Fixed at bottom */}
          <View style={[styles.buttonSection, { paddingBottom: insets.bottom + 16 }]}>
            <AppButton
              label="Continue"
              variant="primary"
              fullWidth
              onPress={handleContinueStep2}
              disabled={!canContinueStep2}
            />
          </View>
        </View>

        {/* Step 3 */}
        <View style={[styles.stepContainer, { width }]}>
          <View style={[styles.backButtonWrapper, styles.backButtonWrapperRaised]}>
            <IconButton
              icon={<BackArrowIcon />}
              onPress={handleBack}
              accessibilityLabel="Go back"
              testID="back-button"
            />
          </View>
          {/* Main content area */}
          <View style={styles.mainContent}>
            {/* Header with back button */}
            <View style={[styles.headerSectionWithBack, { marginTop: headerTopMargin }]}>
              <Text style={styles.title}>What's your age?</Text>
              <Text style={styles.subtitle}>
                {'This is private and will never\nbe shown publicly.'}
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
                contentOffset={{ x: 0, y: (DEFAULT_AGE - MIN_AGE) * ITEM_HEIGHT }}
                contentContainerStyle={{
                  paddingVertical: ITEM_HEIGHT * 2,
                }}
                onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                  const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
                  if (ages[index]) {
                    triggerHaptic('selection');
                    setAge(String(ages[index]));
                  }
                }}
              >
                {ages.map((ageVal) => (
                  <TouchableOpacity
                    key={ageVal}
                    style={styles.wheelPickerItem}
                    onPress={() => {
                      triggerHaptic('selection');
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
            <AppButton
              label="Done"
              variant="primary"
              fullWidth
              haptic="submit"
              onPress={handleDone}
              disabled={!canDone}
              loading={isSubmitting}
            />
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  stepContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  // Main content wrapper
  mainContent: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  // Header section - at top with padding
  headerSection: {
    paddingHorizontal: 24,
    marginBottom: 32,
    alignItems: 'center',
  },
  backButtonWrapper: {
    position: 'absolute',
    top: 0,
    // Align the *visible* chevron with the bottom button's left edge (16). The
    // IconButton (44) centers the 28px chevron and the chevron glyph is inset
    // inside its SVG, so the wrapper needs a negative offset to compensate.
    left: -2,
  },
  backButtonWrapperRaised: {
    zIndex: 10,
  },
  title: {
    fontFamily: typography.fontFamilySemiBold,
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: typography.fontFamilyRegular,
    fontSize: 16,
    fontWeight: '500',
    color: colors.mutedText,
    lineHeight: 24,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  // Header section with back button (same as headerSection for alignment)
  headerSectionWithBack: {
    paddingHorizontal: 24,
    marginBottom: 32,
    alignItems: 'center',
  },
  // Avatar section - centered horizontally
  avatarSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  // Gender section
  genderSection: {
    paddingHorizontal: 24,
  },
  // Avatar styles
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
  },
  cameraBadgeShadow: {
    position: 'absolute',
    bottom: 4,
    right: -2,
    width: 40,
    height: 40,
    borderRadius: 20,
    shadowColor: colors.text,
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
  removePhotoBadge: {
    position: 'absolute',
    top: 0,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryButtonBackground,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  // Name input - clean, no border
  nameInput: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 12,
    minWidth: 200,
    letterSpacing: -0.5,
  },
  // Gender options
  genderOptions: {
    flexDirection: 'column',
    gap: 16,
    width: '100%',
    alignItems: 'center',
  },
  genderButton: {
    width: 200,
    height: 48,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderButtonSelected: {
    backgroundColor: colors.primaryButtonBackground,
  },
  genderButtonText: {
    fontFamily: typography.fontFamilyMedium,
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 26.67,
    letterSpacing: -0.3,
    color: colors.eventDetailRowText,
  },
  genderButtonTextSelected: {
    color: colors.buttonText,
  },
  // Button section - fixed at bottom
  buttonSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  // Wheel picker styles
  wheelPickerContainer: {
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
  },
  wheelPickerHighlight: {
    position: 'absolute',
    top: '50%',
    width: 240,
    height: 50,
    marginTop: -25,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  wheelPickerItem: {
    width: 240,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelPickerText: {
    fontSize: 22,
    fontFamily: typography.fontFamilyMedium,
    color: colors.tabInactive,
  },
  wheelPickerTextSelected: {
    fontSize: 24,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
  },
});

export default OnboardingScreen;
