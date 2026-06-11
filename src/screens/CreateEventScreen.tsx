import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Image, Platform, useWindowDimensions, View } from 'react-native';

import {
  RouteProp,
  StackActions,
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';

import CreateEventBottomSheet from '@components/CreateEventBottomSheet';
import { CoverKey } from '@constants/covers';
import { genderDisplayLabels, getAgeLabel, groupDisplayLabels } from '@constants/eventOptions';
import { useAuth } from '@context/AuthContext';
import { useCovers } from '@context/CoversContext';
import { UserEvent, useEvents } from '@context/EventsContext';
import type { PlaceDetail } from '@hooks/usePlacesAutocomplete';
import { RootStackParamList } from '@navigation/types';
import { trackEvent } from '@services/analytics';
import { triggerHaptic } from '@services/haptics';
import { logger } from '@services/logger';
import { spacing } from '@theme/index';
import {
  formatPickerDateTimeValue,
  getMaxEventDateTime,
  isPastDateTimeSelection,
} from '@utils/dateTime';

import {
  CreateEventFormState,
  buildCreateEventPayload,
  buildGuestEventDraft,
  buildUpdateEventPayload,
  createFormStateFromEvent,
  getFormLocationDisplayName,
  hasGuestDraftContent,
  hasSelectedPlaceLocation,
  normalizeCreateEventForm,
} from './create-event/createEventForm';
import CreateEventFormFields from './create-event/CreateEventFormFields';
import CreateEventHeader from './create-event/CreateEventHeader';
import CreateEventSheetContent, {
  getCreateEventSheetTitle,
} from './create-event/CreateEventSheetContent';
import CreateEventSubmitButton, { ButtonLayout } from './create-event/CreateEventSubmitButton';
import { useCreateEventForm } from './create-event/useCreateEventForm';
import { useCreateEventSheets } from './create-event/useCreateEventSheets';
import styles from './CreateEventScreen.styles';

type CreateNavigation = NativeStackNavigationProp<RootStackParamList, 'CreateEvent'>;

type CreateRoute = RouteProp<RootStackParamList, 'CreateEvent'>;

const EVENT_DATE_WINDOW_DAYS = 30;

/** Shared date/time validation for submit and guest-draft flows. Returns an error message or null. */
const getScheduleValidationError = (formState: CreateEventFormState): string | null => {
  if (Number.isNaN(formState.selectedDateTime.getTime())) {
    return 'Choose a valid date and time';
  }

  const now = new Date();
  const maxAllowedDate = getMaxEventDateTime(now, EVENT_DATE_WINDOW_DAYS);
  const { normalizedDateTime } = normalizeCreateEventForm(formState);

  if (isPastDateTimeSelection(normalizedDateTime, now)) {
    return 'Choose a future date and time';
  }

  if (normalizedDateTime.getTime() > maxAllowedDate.getTime()) {
    return 'Choose a time within the next 30 days';
  }

  return null;
};

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
  const {
    form,
    locationDisplayName,
    tempAgeRange,
    tempGender,
    tempGroupType,
    setEventName,
    setDescription,
    setGroupType,
    setGender,
    setAgeRange,
    setSelectedDateTime,
    setCoverKey,
    selectLocation,
    setTempAgeRange,
    setTempGender,
    setTempGroupType,
    resetForm: resetFormFields,
    applyEventToForm: applyEventToFormFields,
    getCurrentFormState,
  } = useCreateEventForm(initialFormState, initialLocationDisplayName);

  // Sheet state
  const { activeSheet, renderedSheet, openSheet, closeActiveSheet, closeSheetImmediately } =
    useCreateEventSheets();

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

  const pickerMinDate = useMemo(() => new Date(), [activeSheet]);

  const pickerMaxDate = useMemo(
    () => getMaxEventDateTime(new Date(), EVENT_DATE_WINDOW_DAYS),
    [activeSheet],
  );

  const resetForm = useCallback(() => {
    resetFormFields();
    closeSheetImmediately();
    setSubmitError(null);
    setIsSubmitting(false);
  }, [closeSheetImmediately, resetFormFields]);

  const applyEventToForm = useCallback(
    (current: UserEvent) => {
      applyEventToFormFields(current);
      closeSheetImmediately();
      setSubmitError(null);
    },
    [applyEventToFormFields, closeSheetImmediately],
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

  // Open sheet handlers - pickers set temp to current value first
  const openCoverPicker = useCallback(() => {
    triggerHaptic('light');
    openSheet('cover');
  }, [openSheet]);

  const openAgePicker = useCallback(() => {
    triggerHaptic('light');
    setTempAgeRange(form.ageRange);
    openSheet('age');
  }, [form.ageRange, openSheet, setTempAgeRange]);

  const openGenderPicker = useCallback(() => {
    triggerHaptic('light');
    setTempGender(form.gender);
    openSheet('gender');
  }, [form.gender, openSheet, setTempGender]);

  const openGroupTypePicker = useCallback(() => {
    triggerHaptic('light');
    setTempGroupType(form.groupType);
    openSheet('groupType');
  }, [form.groupType, openSheet, setTempGroupType]);

  const openDateTimePicker = useCallback(() => {
    triggerHaptic('light');
    openSheet('dateTime');
  }, [openSheet]);

  const openLocationPicker = useCallback(() => {
    triggerHaptic('light');
    openSheet('location');
  }, [openSheet]);

  // Confirm selection handlers
  const confirmAgeSelection = useCallback(() => {
    triggerHaptic('submit');
    setAgeRange(tempAgeRange);
    closeActiveSheet();
  }, [closeActiveSheet, setAgeRange, tempAgeRange]);

  const confirmGenderSelection = useCallback(() => {
    triggerHaptic('submit');
    setGender(tempGender);
    closeActiveSheet();
  }, [closeActiveSheet, setGender, tempGender]);

  const confirmGroupTypeSelection = useCallback(() => {
    triggerHaptic('submit');
    setGroupType(tempGroupType);
    closeActiveSheet();
  }, [closeActiveSheet, setGroupType, tempGroupType]);

  const selectedCoverUri = useMemo(
    () => resolveCover(form.coverKey),
    [form.coverKey, resolveCover],
  );

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
    [closeActiveSheet, setCoverKey],
  );

  const handleDateTimeConfirm = useCallback(
    (value: Date) => {
      setSelectedDateTime(value);
      closeActiveSheet();
    },
    [closeActiveSheet, setSelectedDateTime],
  );

  const handleLocationSelect = useCallback(
    (place: PlaceDetail) => {
      triggerHaptic('selection');
      const displayName = place.displayName || place.formattedAddress;
      const fullLocation =
        place.displayName && place.formattedAddress
          ? `${place.displayName}, ${place.formattedAddress}`
          : displayName;
      selectLocation({
        location: fullLocation,
        locationDisplayName: displayName,
        placeId: place.placeId,
        latitude: place.latitude,
        longitude: place.longitude,
      });
      closeActiveSheet();
    },
    [closeActiveSheet, selectLocation],
  );

  const handleSubmit = useCallback(
    async (formOverride?: CreateEventFormState) => {
      if (isSubmitting) {
        return;
      }

      const formState = formOverride ?? getCurrentFormState();
      const trimmedName = formState.eventName.trim();
      const trimmedDescription = formState.description.trim();
      const trimmedLocation = formState.location.trim();

      if (!trimmedName || !trimmedDescription || !trimmedLocation) {
        triggerHaptic('error');
        setSubmitError('All fields are required');
        return;
      }

      if (!hasSelectedPlaceLocation(formState)) {
        triggerHaptic('error');
        setSubmitError('Choose a location from search suggestions');
        return;
      }

      const scheduleError = getScheduleValidationError(formState);
      if (scheduleError) {
        triggerHaptic('error');
        setSubmitError(scheduleError);
        return;
      }

      const normalized = normalizeCreateEventForm(formState);

      if (!user) {
        triggerHaptic('error');
        setSubmitError('You must be signed in to create an event');
        return;
      }

      setSubmitError(null);
      setIsSubmitting(true);

      try {
        if (isEditing && editEventId) {
          await updateUserEvent(editEventId, buildUpdateEventPayload(formState));
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
          await addUserEvent(buildCreateEventPayload(formState, user));
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
        logger.error('Failed to submit event', err);
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
        const scheduleError = getScheduleValidationError(formState);
        if (scheduleError) {
          setSubmitError(scheduleError);
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

    const scheduleError = getScheduleValidationError(formState);
    if (scheduleError) {
      setSubmitError(scheduleError);
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

  const ageLabel = useMemo(() => getAgeLabel(form.ageRange), [form.ageRange]);
  const dateTimeLabel = useMemo(
    () => formatPickerDateTimeValue(form.selectedDateTime),
    [form.selectedDateTime],
  );
  const selectedLocationLabel = locationDisplayName || form.location;

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
        <CreateEventHeader isEditing={isEditing} onClose={() => navigation.goBack()} />
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
            <CreateEventFormFields
              selectedCoverUri={selectedCoverUri}
              eventName={form.eventName}
              description={form.description}
              groupTypeLabel={groupDisplayLabels[form.groupType]}
              genderLabel={genderDisplayLabels[form.gender]}
              ageLabel={ageLabel}
              dateTimeLabel={dateTimeLabel}
              selectedLocationLabel={selectedLocationLabel}
              onChangeEventName={setEventName}
              onChangeDescription={setDescription}
              onOpenCoverPicker={openCoverPicker}
              onOpenGroupTypePicker={openGroupTypePicker}
              onOpenGenderPicker={openGenderPicker}
              onOpenAgePicker={openAgePicker}
              onOpenDateTimePicker={openDateTimePicker}
              onOpenLocationPicker={openLocationPicker}
            />

            <View style={styles.spacer} />

            <CreateEventSubmitButton
              label={primaryButtonLabel}
              submitError={submitError}
              isSubmitting={isSubmitting}
              isEditing={isEditing}
              onPress={handlePrimaryAction}
              onMeasured={setButtonLayout}
            />
          </KeyboardAwareScrollView>
        </View>
      </SafeAreaView>

      <CreateEventBottomSheet
        visible={activeSheet !== null}
        title={getCreateEventSheetTitle(renderedSheet)}
        onClose={closeActiveSheet}
        snapHeight={renderedSheet === 'location' ? locationSheetHeight : undefined}
      >
        <CreateEventSheetContent
          renderedSheet={renderedSheet}
          activeSheet={activeSheet}
          selectedDateTime={form.selectedDateTime}
          pickerMinDate={pickerMinDate}
          pickerMaxDate={pickerMaxDate}
          onConfirmDateTime={handleDateTimeConfirm}
          coverKey={form.coverKey}
          onSelectCover={handleCoverSelect}
          tempGroupType={tempGroupType}
          onSelectTempGroupType={setTempGroupType}
          onConfirmGroupType={confirmGroupTypeSelection}
          tempGender={tempGender}
          onSelectTempGender={setTempGender}
          onConfirmGender={confirmGenderSelection}
          tempAgeRange={tempAgeRange}
          onSelectTempAgeRange={setTempAgeRange}
          onConfirmAge={confirmAgeSelection}
          selectedLocationLabel={selectedLocationLabel}
          onSelectLocation={handleLocationSelect}
          onClose={closeActiveSheet}
        />
      </CreateEventBottomSheet>
    </View>
  );
};

export default CreateEventScreen;
