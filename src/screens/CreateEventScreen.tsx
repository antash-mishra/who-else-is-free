import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import MaskedView from '@react-native-masked-view/masked-view';
import {
  RouteProp,
  StackActions,
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AgeOption,
  ageOptions,
  GenderOption,
  genderDisplayLabels,
  genderOptions,
  getAgeLabel,
  GroupOption,
  groupDisplayLabels,
  groupOptions,
} from '@constants/eventOptions';
import {
  formatPickerDateTimeValue,
  getMaxEventDateTime,
  isPastDateTimeSelection,
} from '@utils/dateTime';
import UploadIcon from '@assets/create-event/choose-cover.svg';
import CloseIcon from '@assets/ui/close.svg';
import WarningIcon from '@assets/ui/error.svg';
import { SelectionModalContent } from '@components/SelectionModal';
import { CoverPickerContent } from '@components/CoverPickerModal';
import CreateEventBottomSheet from '@components/CreateEventBottomSheet';
import { EventDateTimePickerContent } from '@components/EventDateTimeModal';
import { LocationPickerContent } from '@components/LocationPickerModal';
import { CoverKey } from '@constants/covers';
import { useAuth } from '@context/AuthContext';
import { useCovers } from '@context/CoversContext';
import { useEvents } from '@context/EventsContext';
import type { PlaceDetail } from '@hooks/usePlacesAutocomplete';
import { RootStackParamList } from '@navigation/types';
import { trackEvent } from '@services/analytics';
import { triggerHaptic } from '@services/haptics';
import { colors, spacing } from '@theme/index';
import { Springs } from '@theme/springs';

import SignInButtons from '../components/SignInButtons';

import {
  CreateEventFormState,
  buildCreateEventPayload,
  buildGuestEventDraft,
  buildUpdateEventPayload,
  createEmptyFormState,
  createFormStateFromEvent,
  getFormLocationDisplayName,
  hasGuestDraftContent,
  hasSelectedPlaceLocation,
  normalizeCreateEventForm,
} from './create-event/createEventForm';
import styles from './CreateEventScreen.styles';

type ButtonLayout = { x: number; y: number; width: number; height: number };
type CreateEventSheet =
  | 'age'
  | 'gender'
  | 'groupType'
  | 'cover'
  | 'dateTime'
  | 'location'
  | 'signIn';

const SHEET_CLOSE_DURATION_MS = 320;
const KEYBOARD_SHEET_SETTLE_DELAY_MS = Platform.OS === 'ios' ? 90 : 140;
const KEYBOARD_SHEET_OPEN_FALLBACK_MS = Platform.OS === 'ios' ? 420 : 360;

type CreateNavigation = NativeStackNavigationProp<RootStackParamList, 'CreateEvent'>;

type CreateRoute = RouteProp<RootStackParamList, 'CreateEvent'>;

const EVENT_DATE_WINDOW_DAYS = 30;

const CreateEventScreen = () => {
  const navigation = useNavigation<CreateNavigation>();
  const route = useRoute<CreateRoute>();
  const { height: windowHeight } = useWindowDimensions();
  const { addUserEvent, updateUserEvent, events, queueGuestEvent } = useEvents();
  const { user } = useAuth();
  const { resolveCover } = useCovers();
  const scrollViewRef = useRef<KeyboardAwareScrollView>(null);
  const createStartTrackedRef = useRef(false);

  // Responsive gap for spacing between form elements
  const responsiveGap = spacing.xs;
  const locationSheetHeight = useMemo(() => Math.round(windowHeight * 0.9), [windowHeight]);

  const editEventIdParam = route.params?.editEventId;
  const editEventId =
    typeof editEventIdParam === 'string' && editEventIdParam.trim().length > 0
      ? editEventIdParam
      : undefined;
  const editEvent = editEventId ? events.find((eventItem) => eventItem.id === editEventId) : null;
  const isEditing = !!editEvent;
  const initialFormState = useMemo(() => createFormStateFromEvent(editEvent), [editEvent]);
  const initialLocationDisplayName = useMemo(
    () => getFormLocationDisplayName(editEvent),
    [editEvent],
  );

  useEffect(() => {
    if (isEditing || createStartTrackedRef.current) {
      return;
    }

    createStartTrackedRef.current = true;
    trackEvent('event_create_started', {
      source: 'create_event_screen',
    }).catch(() => undefined);
  }, [isEditing]);

  // Form state
  const [eventName, setEventName] = useState(initialFormState.eventName);
  const [description, setDescription] = useState(initialFormState.description);
  const [groupType, setGroupType] = useState<GroupOption>(initialFormState.groupType);
  const [gender, setGender] = useState<GenderOption>(initialFormState.gender);
  const [ageRange, setAgeRange] = useState<[number, number]>(initialFormState.ageRange);
  const [selectedDateTime, setSelectedDateTime] = useState<Date>(
    () => initialFormState.selectedDateTime,
  );
  const [location, setLocation] = useState(initialFormState.location);
  const [locationDisplayName, setLocationDisplayName] = useState(initialLocationDisplayName);
  const [placeId, setPlaceId] = useState(initialFormState.placeId ?? '');
  const [latitude, setLatitude] = useState<number | undefined>(initialFormState.latitude);
  const [longitude, setLongitude] = useState<number | undefined>(initialFormState.longitude);
  const [coverKey, setCoverKey] = useState<CoverKey>(initialFormState.coverKey);

  // Sheet state
  const [activeSheet, setActiveSheet] = useState<CreateEventSheet | null>(null);
  const [renderedSheet, setRenderedSheet] = useState<CreateEventSheet | null>(null);
  const renderedSheetRef = useRef<CreateEventSheet | null>(null);
  const keyboardVisibleRef = useRef(false);
  const pendingSheetRef = useRef<CreateEventSheet | null>(null);
  const pendingSheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderedSheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Button layout for wow transition
  const [buttonLayout, setButtonLayout] = useState<ButtonLayout>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const primaryButtonRef = useRef<View>(null);

  // Shimmer animation for "Creating event..." state
  const shimmerX = useSharedValue(-160);
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  const buttonScale = useSharedValue(1);
  const buttonScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  useEffect(() => {
    if (isSubmitting && !isEditing) {
      shimmerX.value = -160;
      shimmerX.value = withRepeat(
        withSequence(
          withTiming(360, { duration: 1100, easing: Easing.linear }),
          withTiming(-160, { duration: 0 }),
        ),
        -1,
      );
    }
  }, [isSubmitting]);

  // Temporary selection states for modal confirmation
  const [tempAgeRange, setTempAgeRange] = useState<[number, number]>(ageRange);
  const [tempGender, setTempGender] = useState<GenderOption>(gender);
  const [tempGroupType, setTempGroupType] = useState<GroupOption>(groupType);

  const pickerMinDate = useMemo(() => new Date(), [activeSheet]);

  const pickerMaxDate = useMemo(
    () => getMaxEventDateTime(new Date(), EVENT_DATE_WINDOW_DAYS),
    [activeSheet],
  );

  useEffect(() => {
    renderedSheetRef.current = renderedSheet;
  }, [renderedSheet]);

  const clearPendingSheetOpen = useCallback(() => {
    if (pendingSheetTimerRef.current) {
      clearTimeout(pendingSheetTimerRef.current);
      pendingSheetTimerRef.current = null;
    }
    if (keyboardSettleTimerRef.current) {
      clearTimeout(keyboardSettleTimerRef.current);
      keyboardSettleTimerRef.current = null;
    }
    pendingSheetRef.current = null;
  }, []);

  const clearRenderedSheetClose = useCallback(() => {
    if (renderedSheetTimerRef.current) {
      clearTimeout(renderedSheetTimerRef.current);
      renderedSheetTimerRef.current = null;
    }
  }, []);

  const presentSheet = useCallback(
    (sheet: CreateEventSheet) => {
      clearRenderedSheetClose();
      setRenderedSheet(sheet);
      setActiveSheet(sheet);
    },
    [clearRenderedSheetClose],
  );

  const closeSheetImmediately = useCallback(() => {
    clearPendingSheetOpen();
    clearRenderedSheetClose();
    setActiveSheet(null);
    setRenderedSheet(null);
  }, [clearPendingSheetOpen, clearRenderedSheetClose]);

  const closeActiveSheet = useCallback(() => {
    clearPendingSheetOpen();
    Keyboard.dismiss();
    setActiveSheet(null);
    clearRenderedSheetClose();
    const sheetToUnmount = renderedSheetRef.current;
    renderedSheetTimerRef.current = setTimeout(() => {
      setRenderedSheet(null);
      if (renderedSheetRef.current === sheetToUnmount) {
        renderedSheetRef.current = null;
      }
      renderedSheetTimerRef.current = null;
    }, SHEET_CLOSE_DURATION_MS);
  }, [clearPendingSheetOpen, clearRenderedSheetClose]);

  const openSheet = useCallback(
    (sheet: CreateEventSheet) => {
      clearPendingSheetOpen();
      Keyboard.dismiss();

      if (keyboardVisibleRef.current) {
        pendingSheetRef.current = sheet;
        pendingSheetTimerRef.current = setTimeout(() => {
          if (pendingSheetRef.current !== sheet) {
            return;
          }
          pendingSheetRef.current = null;
          pendingSheetTimerRef.current = null;
          keyboardSettleTimerRef.current = setTimeout(() => {
            keyboardSettleTimerRef.current = null;
            presentSheet(sheet);
          }, KEYBOARD_SHEET_SETTLE_DELAY_MS);
        }, KEYBOARD_SHEET_OPEN_FALLBACK_MS);
        return;
      }

      presentSheet(sheet);
    },
    [clearPendingSheetOpen, presentSheet],
  );

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisibleRef.current = true;
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisibleRef.current = false;
      const pendingSheet = pendingSheetRef.current;
      if (!pendingSheet) {
        return;
      }
      if (pendingSheetTimerRef.current) {
        clearTimeout(pendingSheetTimerRef.current);
        pendingSheetTimerRef.current = null;
      }
      pendingSheetRef.current = null;
      keyboardSettleTimerRef.current = setTimeout(() => {
        keyboardSettleTimerRef.current = null;
        presentSheet(pendingSheet);
      }, KEYBOARD_SHEET_SETTLE_DELAY_MS);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [clearPendingSheetOpen, presentSheet]);

  useEffect(() => {
    return () => {
      clearPendingSheetOpen();
      clearRenderedSheetClose();
    };
  }, [clearPendingSheetOpen, clearRenderedSheetClose]);

  const applyFormState = useCallback((form: CreateEventFormState, displayLocationName = '') => {
    setEventName(form.eventName);
    setDescription(form.description);
    setGroupType(form.groupType);
    setGender(form.gender);
    setAgeRange(form.ageRange);
    setSelectedDateTime(form.selectedDateTime);
    setLocation(form.location);
    setLocationDisplayName(displayLocationName);
    setPlaceId(form.placeId ?? '');
    setLatitude(form.latitude);
    setLongitude(form.longitude);
    setCoverKey(form.coverKey);
  }, []);

  const resetForm = useCallback(() => {
    applyFormState(createEmptyFormState());
    closeSheetImmediately();
    setSubmitError(null);
    setIsSubmitting(false);
  }, [applyFormState, closeSheetImmediately]);

  const applyEventToForm = useCallback(
    (current: NonNullable<typeof editEvent>) => {
      applyFormState(createFormStateFromEvent(current), getFormLocationDisplayName(current));
      closeSheetImmediately();
      setSubmitError(null);
    },
    [applyFormState, closeSheetImmediately],
  );

  const getCurrentFormState = useCallback(
    (): CreateEventFormState => ({
      eventName,
      description,
      groupType,
      gender,
      ageRange,
      selectedDateTime,
      location,
      placeId,
      latitude,
      longitude,
      coverKey,
    }),
    [
      ageRange,
      coverKey,
      description,
      eventName,
      gender,
      groupType,
      location,
      placeId,
      latitude,
      longitude,
      selectedDateTime,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      if (editEvent && editEventId) {
        applyEventToForm(editEvent);
      } else {
        resetForm();
      }
    }, [applyEventToForm, editEvent, editEventId, resetForm]),
  );

  useEffect(() => {
    if (user && activeSheet === 'signIn') {
      closeActiveSheet();
    }
  }, [activeSheet, closeActiveSheet, user]);

  // Open modal handlers - set temp to current value
  const openAgePicker = useCallback(() => {
    triggerHaptic('light');
    setTempAgeRange(ageRange);
    openSheet('age');
  }, [ageRange, openSheet]);

  const openGenderPicker = useCallback(() => {
    triggerHaptic('light');
    setTempGender(gender);
    openSheet('gender');
  }, [gender, openSheet]);

  const openGroupTypePicker = useCallback(() => {
    triggerHaptic('light');
    setTempGroupType(groupType);
    openSheet('groupType');
  }, [groupType, openSheet]);

  // Confirm selection handlers
  const confirmAgeSelection = useCallback(() => {
    triggerHaptic('submit');
    setAgeRange(tempAgeRange);
    closeActiveSheet();
  }, [closeActiveSheet, tempAgeRange]);

  const confirmGenderSelection = useCallback(() => {
    triggerHaptic('submit');
    setGender(tempGender);
    closeActiveSheet();
  }, [closeActiveSheet, tempGender]);

  const confirmGroupTypeSelection = useCallback(() => {
    triggerHaptic('submit');
    setGroupType(tempGroupType);
    closeActiveSheet();
  }, [closeActiveSheet, tempGroupType]);

  const selectedCoverUri = useMemo(() => resolveCover(coverKey), [coverKey, resolveCover]);

  const contentContainerStyle = useMemo(
    () => [
      styles.content,
      {
        paddingBottom: 0,
        flexGrow: 1,
        gap: responsiveGap,
      },
    ],
    [responsiveGap],
  );

  const handleCoverSelect = useCallback(
    (key: CoverKey) => {
      triggerHaptic('selection');
      setCoverKey(key);
      closeActiveSheet();
    },
    [closeActiveSheet],
  );

  const handleLocationSelect = useCallback(
    (place: PlaceDetail) => {
      triggerHaptic('selection');
      const displayName = place.displayName || place.formattedAddress;
      const fullLocation =
        place.displayName && place.formattedAddress
          ? `${place.displayName}, ${place.formattedAddress}`
          : displayName;
      setLocation(fullLocation);
      setLocationDisplayName(displayName);
      setPlaceId(place.placeId);
      setLatitude(place.latitude);
      setLongitude(place.longitude);
      closeActiveSheet();
    },
    [closeActiveSheet],
  );

  const handleSubmit = useCallback(
    async (formOverride?: CreateEventFormState) => {
      if (isSubmitting) {
        return;
      }

      const form = formOverride ?? getCurrentFormState();
      const trimmedName = form.eventName.trim();
      const trimmedDescription = form.description.trim();
      const trimmedLocation = form.location.trim();

      if (!trimmedName || !trimmedDescription || !trimmedLocation) {
        triggerHaptic('error');
        setSubmitError('All fields are required');
        return;
      }

      if (!hasSelectedPlaceLocation(form)) {
        triggerHaptic('error');
        setSubmitError('Choose a location from search suggestions');
        return;
      }

      if (Number.isNaN(form.selectedDateTime.getTime())) {
        triggerHaptic('error');
        setSubmitError('Choose a valid date and time');
        return;
      }

      const now = new Date();
      const maxAllowedDate = getMaxEventDateTime(now, EVENT_DATE_WINDOW_DAYS);
      const normalized = normalizeCreateEventForm(form);
      const { normalizedDateTime } = normalized;

      if (isPastDateTimeSelection(normalizedDateTime, now)) {
        triggerHaptic('error');
        setSubmitError('Choose a future date and time');
        return;
      }

      if (normalizedDateTime.getTime() > maxAllowedDate.getTime()) {
        triggerHaptic('error');
        setSubmitError('Choose a time within the next 30 days');
        return;
      }

      if (!user) {
        triggerHaptic('error');
        setSubmitError('You must be signed in to create an event');
        return;
      }

      setSubmitError(null);
      setIsSubmitting(true);

      try {
        if (isEditing && editEventId) {
          await updateUserEvent(editEventId, buildUpdateEventPayload(form));
          triggerHaptic('success');
          navigation.dispatch(
            StackActions.popTo(
              'EventDetails',
              {
                eventId: String(editEventId),
                origin: 'MyEvents',
                showEventUpdatedBadge: true,
              },
              { merge: true },
            ),
          );
        } else {
          const minDelay = new Promise<void>((r) => setTimeout(r, 1500));
          await addUserEvent(buildCreateEventPayload(form, user));
          await minDelay;
          triggerHaptic('success');
          resetForm();
          navigation.dispatch(
            StackActions.replace('EventCreated', {
              eventTitle: normalized.title,
              coverUri: selectedCoverUri,
              buttonLayout,
              skipAnimation: true,
            }),
          );
        }
      } catch (err) {
        console.error('Failed to submit event', err);
        triggerHaptic('error');
        setSubmitError(`Unable to ${isEditing ? 'update' : 'publish'} the event. Please try again`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      addUserEvent,
      buttonLayout,
      editEventId,
      getCurrentFormState,
      isEditing,
      isSubmitting,
      navigation,
      resetForm,
      selectedCoverUri,
      updateUserEvent,
      user,
    ],
  );

  const handlePrimaryAction = () => {
    triggerHaptic('submit');
    const formState = getCurrentFormState();

    // Guest user flow — always open sign-in modal
    if (!user) {
      const hasContent = hasGuestDraftContent(formState);

      if (hasContent) {
        // Validate date/time only when there's content to publish
        if (Number.isNaN(formState.selectedDateTime.getTime())) {
          setSubmitError('Choose a valid date and time');
          return;
        }

        const now = new Date();
        const maxAllowedDate = getMaxEventDateTime(now, EVENT_DATE_WINDOW_DAYS);
        const { normalizedDateTime } = normalizeCreateEventForm(formState);
        if (isPastDateTimeSelection(normalizedDateTime, now)) {
          setSubmitError('Choose a future date and time');
          return;
        }

        if (normalizedDateTime.getTime() > maxAllowedDate.getTime()) {
          setSubmitError('Choose a time within the next 30 days');
          return;
        }

        // Queue the draft for auto-submit after sign-in
        queueGuestEvent(buildGuestEventDraft(formState));
      }

      // Always open sign-in modal (no validation blocking for empty fields)
      setSubmitError(null);
      openSheet('signIn');
      return;
    }

    // Authenticated user flow — validate and submit
    if (
      !formState.eventName.trim() ||
      !formState.description.trim() ||
      !formState.location.trim()
    ) {
      setSubmitError('All fields are required');
      return;
    }

    if (Number.isNaN(formState.selectedDateTime.getTime())) {
      setSubmitError('Choose a valid date and time');
      return;
    }

    const now = new Date();
    const maxAllowedDate = getMaxEventDateTime(now, EVENT_DATE_WINDOW_DAYS);
    const { normalizedDateTime } = normalizeCreateEventForm(formState);
    if (isPastDateTimeSelection(normalizedDateTime, now)) {
      setSubmitError('Choose a future date and time');
      return;
    }

    if (normalizedDateTime.getTime() > maxAllowedDate.getTime()) {
      setSubmitError('Choose a time within the next 30 days');
      return;
    }

    void handleSubmit(formState);
  };

  const primaryButtonLabel = user
    ? isSubmitting
      ? isEditing
        ? 'Updating...'
        : 'Creating...'
      : isEditing
        ? 'Update Event'
        : 'Create Event'
    : 'Sign Up or Log In';

  const ageLabel = useMemo(() => getAgeLabel(ageRange), [ageRange]);
  const dateTimeLabel = useMemo(
    () => formatPickerDateTimeValue(selectedDateTime),
    [selectedDateTime],
  );
  const selectedLocationLabel = locationDisplayName || location;

  // Fixed header component (outside scroll view)
  const renderHeader = () => (
    <View style={styles.headerRow}>
      <View style={styles.headerSpacer} />
      <Text style={styles.pageTitle}>{isEditing ? 'Edit Details' : 'Create Event'}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          triggerHaptic('light');
          navigation.goBack();
        }}
        style={styles.dismissButton}
      >
        <CloseIcon width={24} height={24} color={colors.createTextPrimary} />
      </Pressable>
    </View>
  );

  // Shared form content to avoid iOS/Android duplication
  const renderFormContent = () => (
    <>
      <Pressable
        style={styles.coverCard}
        onPress={() => {
          triggerHaptic('light');
          openSheet('cover');
        }}
        accessibilityRole="button"
      >
        <Image source={{ uri: selectedCoverUri }} style={styles.coverImage} />
        <BlurView intensity={60} tint="dark" style={styles.coverChip}>
          <UploadIcon width={20} height={20} color="white" />
        </BlurView>
      </Pressable>

      <View style={styles.fieldCard}>
        <View style={styles.fieldCardInner}>
          <TextInput
            placeholder="Event Name"
            value={eventName}
            onChangeText={setEventName}
            placeholderTextColor="rgba(255, 255, 255, 0.6)"
            cursorColor="#FFFFFF"
            selectionColor="#FFFFFF"
            style={styles.textInput}
          />
          <View style={styles.fieldDivider} />
          <TextInput
            placeholder="Description"
            value={description}
            onChangeText={setDescription}
            placeholderTextColor="rgba(255, 255, 255, 0.6)"
            cursorColor="#FFFFFF"
            selectionColor="#FFFFFF"
            style={[styles.textInput, styles.descriptionInput]}
            multiline
            textAlignVertical="top"
          />
        </View>
      </View>

      <View style={styles.fieldCard}>
        <View style={styles.fieldCardInner}>
          <Pressable style={styles.fieldRow} onPress={openGroupTypePicker}>
            <Text style={styles.fieldLabel}>Group Type</Text>
            <View style={styles.fieldValuePill}>
              <Text style={styles.fieldValueText}>{groupDisplayLabels[groupType]}</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.fieldCard}>
        <View style={styles.fieldCardInner}>
          <Pressable style={styles.fieldRow} onPress={openGenderPicker}>
            <Text style={styles.fieldLabel}>Gender</Text>
            <View style={styles.fieldValuePill}>
              <Text style={styles.fieldValueText}>{genderDisplayLabels[gender]}</Text>
            </View>
          </Pressable>

          <View style={styles.fieldDivider} />

          <Pressable style={styles.fieldRow} onPress={openAgePicker}>
            <Text style={styles.fieldLabel}>Age</Text>
            <View style={styles.fieldValuePill}>
              <Text style={styles.fieldValueText}>{ageLabel}</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.fieldCard}>
        <View style={styles.fieldCardInner}>
          <Pressable
            style={[styles.fieldRow, styles.dateRow]}
            onPress={() => {
              triggerHaptic('light');
              openSheet('dateTime');
            }}
          >
            <Text style={styles.fieldLabel}>Date & Time</Text>
            <View style={[styles.fieldValuePill, styles.dateTimeValuePill]}>
              <Text style={[styles.fieldValueText, styles.dateTimeValueText]} numberOfLines={1}>
                {dateTimeLabel}
              </Text>
            </View>
          </Pressable>

          <View style={styles.fieldDivider} />

          <Pressable
            style={[styles.fieldRow, styles.locationRow]}
            onPress={() => {
              triggerHaptic('light');
              openSheet('location');
            }}
          >
            <Text style={styles.fieldLabel}>Location</Text>
            <View style={[styles.fieldValuePill, styles.locationValuePill]}>
              <Text
                style={[
                  styles.fieldValueText,
                  !selectedLocationLabel && styles.locationPlaceholder,
                ]}
                numberOfLines={1}
              >
                {selectedLocationLabel || 'Select Location'}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.spacer} />

      <View style={styles.footer}>
        {submitError ? (
          <View style={styles.errorContainer}>
            <WarningIcon width={14} height={14} style={{ alignSelf: 'center' }} />
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        ) : null}

        <Pressable
          ref={primaryButtonRef as any}
          onLayout={() => {
            primaryButtonRef.current?.measureInWindow((x, y, w, h) => {
              setButtonLayout({ x, y, width: w, height: h });
            });
          }}
          style={{ width: '100%' }}
          onPress={handlePrimaryAction}
          onPressIn={() => {
            if (!isSubmitting) buttonScale.value = withSpring(0.96, Springs.snappy);
          }}
          onPressOut={() => {
            buttonScale.value = withSpring(1, Springs.press);
          }}
          disabled={isSubmitting}
          accessibilityRole="button"
          testID="create-event-submit"
        >
          <Animated.View
            style={[
              styles.primaryButton,
              isSubmitting && styles.primaryButtonDisabled,
              buttonScaleStyle,
            ]}
          >
            {isSubmitting && !isEditing ? (
              <MaskedView
                style={shimmerStyles.root}
                maskElement={
                  <View style={shimmerStyles.mask}>
                    <Text style={styles.primaryButtonText}>Creating event...</Text>
                  </View>
                }
              >
                <View style={shimmerStyles.mask}>
                  <Text style={[styles.primaryButtonText, shimmerStyles.dimText]}>
                    Creating event...
                  </Text>
                </View>
                <Animated.View style={[shimmerStyles.strip, shimmerStyle]} pointerEvents="none">
                  <LinearGradient
                    colors={['transparent', 'rgba(255,255,255,0.8)', 'transparent']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </MaskedView>
            ) : (
              <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>
            )}
          </Animated.View>
        </Pressable>
      </View>
    </>
  );

  const sheetTitle = (() => {
    switch (renderedSheet) {
      case 'dateTime':
        return 'When is your event?';
      case 'cover':
        return 'Choose a cover';
      case 'groupType':
        return 'Group Type';
      case 'gender':
        return 'Gender';
      case 'age':
        return 'Age';
      case 'location':
        return 'Select Location';
      default:
        return undefined;
    }
  })();

  const renderSheetContent = () => {
    switch (renderedSheet) {
      case 'dateTime':
        return (
          <EventDateTimePickerContent
            visible={activeSheet === 'dateTime'}
            value={selectedDateTime}
            minDate={pickerMinDate}
            maxDate={pickerMaxDate}
            onConfirm={(value) => {
              setSelectedDateTime(value);
              closeActiveSheet();
            }}
          />
        );
      case 'cover':
        return <CoverPickerContent selectedCoverKey={coverKey} onSelect={handleCoverSelect} />;
      case 'groupType':
        return (
          <SelectionModalContent
            options={groupOptions}
            selectedValue={tempGroupType}
            onSelect={setTempGroupType}
            onConfirm={confirmGroupTypeSelection}
            getLabel={(opt) => groupDisplayLabels[opt]}
            getKey={(opt) => opt}
            isSelected={(opt, sel) => opt === sel}
          />
        );
      case 'gender':
        return (
          <SelectionModalContent
            options={genderOptions}
            selectedValue={tempGender}
            onSelect={setTempGender}
            onConfirm={confirmGenderSelection}
            getLabel={(opt) => genderDisplayLabels[opt]}
            getKey={(opt) => opt}
            isSelected={(opt, sel) => opt === sel}
          />
        );
      case 'age':
        return (
          <SelectionModalContent<AgeOption>
            options={ageOptions}
            selectedValue={{ label: '', min: tempAgeRange[0], max: tempAgeRange[1] }}
            onSelect={(opt) => setTempAgeRange([opt.min, opt.max])}
            onConfirm={confirmAgeSelection}
            getLabel={(opt) => opt.label}
            getKey={(opt) => opt.label}
            isSelected={(opt, sel) => opt.min === sel.min && opt.max === sel.max}
          />
        );
      case 'location':
        return (
          <LocationPickerContent
            visible={activeSheet === 'location'}
            onClose={closeActiveSheet}
            onSelect={handleLocationSelect}
            initialQuery={selectedLocationLabel}
          />
        );
      case 'signIn':
        return <SignInButtons />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.root}>
      <Image
        source={{ uri: selectedCoverUri }}
        style={styles.backgroundImage}
        resizeMode="cover"
        blurRadius={28}
      />
      <View style={styles.backgroundOverlay} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {renderHeader()}
        <View style={[styles.overlay, styles.contentWrapper]}>
          <KeyboardAwareScrollView
            ref={scrollViewRef}
            style={styles.formScroll}
            contentContainerStyle={contentContainerStyle}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            enableOnAndroid={true}
            enableAutomaticScroll={true}
            extraScrollHeight={0}
            extraHeight={0}
            enableResetScrollToCoords={false}
            contentInsetAdjustmentBehavior="never"
          >
            {renderFormContent()}
          </KeyboardAwareScrollView>
        </View>
      </SafeAreaView>

      <CreateEventBottomSheet
        visible={activeSheet !== null}
        title={sheetTitle}
        onClose={closeActiveSheet}
        snapHeight={renderedSheet === 'location' ? locationSheetHeight : undefined}
      >
        {renderSheetContent()}
      </CreateEventBottomSheet>
    </View>
  );
};

const shimmerStyles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  mask: {
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  dimText: {
    opacity: 0.45,
  },
  strip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 160,
  },
});

export default CreateEventScreen;
