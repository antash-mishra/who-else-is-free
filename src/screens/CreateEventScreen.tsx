import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Image,
    Keyboard,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";

import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import CloseIcon from "@assets/ui/close.svg";
import {
    RouteProp,
    StackActions,
    useFocusEffect,
    useNavigation,
    useRoute,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

import { RootStackParamList } from "@navigation/types";
import { trackEvent } from "@services/analytics";
import { colors, spacing } from "@theme/index";
import { GuestEventDraft, UserEvent, useEvents } from "@context/EventsContext";
import { useAuth } from "@context/AuthContext";
import { CoverKey, DEFAULT_COVER_KEY, resolveCoverUri } from "@constants/covers";
import {
    AGE_MAX,
    AGE_MIN,
    AgeOption,
    ageOptions,
    GenderOption,
    genderDisplayLabels,
    genderOptions,
    getAgeLabel,
    GroupOption,
    groupDisplayLabels,
    groupOptions,
} from "@constants/eventOptions";
import {
    combineDateAndTime,
    formatPickerDateTimeValue,
    formatTime,
    getDefaultEventDateTime,
    getLegacyDateLabel,
    getMaxEventDateTime,
    isPastDateTimeSelection,
    toDateKey,
} from "@utils/dateTime";
import UploadIcon from "@assets/create-event/choose-cover.svg";
import WarningIcon from "@assets/ui/error.svg";
import SelectionModal from "@components/SelectionModal";
import CoverPickerModal from "@components/CoverPickerModal";
import EventDateTimeModal from "@components/EventDateTimeModal";
import LocationPickerModal from "@components/LocationPickerModal";
import type { PlaceDetail } from "@hooks/usePlacesAutocomplete";
import SearchIcon from "@assets/ui/search.svg";
import LocationPinIcon from "@assets/ui/location-pin.svg";
import EditIcon from "@assets/ui/edit.svg";
import BottomSheetModal from "../components/BottomSheetModal";
import SignInButtons from "../components/SignInButtons";
import styles from "./CreateEventScreen.styles";

type ButtonLayout = { x: number; y: number; width: number; height: number };

type FormState = {
    eventName: string;
    description: string;
    groupType: GroupOption;
    gender: GenderOption;
    ageRange: [number, number];
    selectedDateTime: Date;
    location: string;
    placeId?: string;
    latitude?: number;
    longitude?: number;
    coverKey: CoverKey;
};

type CreateNavigation = NativeStackNavigationProp<RootStackParamList, "CreateEvent">;

type CreateRoute = RouteProp<RootStackParamList, "CreateEvent">;

const EVENT_DATE_WINDOW_DAYS = 30;

const getEventDateTime = (event?: UserEvent | null): Date => {
    if (!event) {
        return getDefaultEventDateTime();
    }

    if (event.scheduledAt) {
        const parsed = new Date(event.scheduledAt);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    const combined = combineDateAndTime(event.eventDate, event.time);
    if (combined) {
        return combined;
    }

    return getDefaultEventDateTime();
};

const CreateEventScreen = () => {
    const navigation = useNavigation<CreateNavigation>();
    const route = useRoute<CreateRoute>();
    const { addUserEvent, updateUserEvent, events, queueGuestEvent } =
        useEvents();
    const { user } = useAuth();
    const scrollViewRef = useRef<KeyboardAwareScrollView>(null);
    const createStartTrackedRef = useRef(false);

    // Responsive gap for spacing between form elements
    const responsiveGap = spacing.xs;

    const editEventIdParam = route.params?.editEventId;
    const editEventId =
        typeof editEventIdParam === "string" && editEventIdParam.trim().length > 0
            ? editEventIdParam
            : undefined;
    const editEvent = editEventId
        ? events.find((eventItem) => eventItem.id === editEventId)
        : null;
    const isEditing = !!editEvent;

    useEffect(() => {
        if (isEditing || createStartTrackedRef.current) {
            return;
        }

        createStartTrackedRef.current = true;
        trackEvent("event_create_started", {
            source: "create_event_screen",
        }).catch(() => undefined);
    }, [isEditing]);

    // Form state
    const [eventName, setEventName] = useState(editEvent?.title || "");
    const [description, setDescription] = useState(editEvent?.description || "");
    const [groupType, setGroupType] = useState<GroupOption>(
        editEvent?.groupType === "Group" ? "Group" : "Single",
    );
    const [gender, setGender] = useState<GenderOption>(
        (editEvent?.gender as GenderOption) || "Any",
    );
    const [ageRange, setAgeRange] = useState<[number, number]>([
        editEvent?.minAge || AGE_MIN,
        editEvent?.maxAge || AGE_MAX,
    ]);
    const [selectedDateTime, setSelectedDateTime] = useState<Date>(() =>
        getEventDateTime(editEvent),
    );
    const [location, setLocation] = useState(editEvent?.location || "");
    const [placeId, setPlaceId] = useState(editEvent?.placeId || "");
    const [latitude, setLatitude] = useState<number | undefined>(editEvent?.latitude);
    const [longitude, setLongitude] = useState<number | undefined>(editEvent?.longitude);
    const [isManualLocation, setIsManualLocation] = useState(false);
    const [coverKey, setCoverKey] = useState<CoverKey>(
        editEvent?.coverKey ?? DEFAULT_COVER_KEY,
    );

    // Modal visibility state
    const [isAgePickerVisible, setAgePickerVisible] = useState(false);
    const [isGenderPickerVisible, setGenderPickerVisible] = useState(false);
    const [isGroupTypePickerVisible, setGroupTypePickerVisible] = useState(false);
    const [isCoverPickerVisible, setCoverPickerVisible] = useState(false);
    const [isDateTimePickerVisible, setDateTimePickerVisible] = useState(false);
    const [isLocationPickerVisible, setLocationPickerVisible] = useState(false);

    // Sign-in modal state
    const [signInVisible, setSignInVisible] = useState(false);

    // Submission state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Button layout for wow transition
    const [buttonLayout, setButtonLayout] = useState<ButtonLayout>({ x: 0, y: 0, width: 0, height: 0 });
    const primaryButtonRef = useRef<View>(null);

    // Shimmer animation for "Creating event..." state
    const shimmerX = useSharedValue(-160);
    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shimmerX.value }],
    }));

    useEffect(() => {
        if (isSubmitting && !isEditing) {
            shimmerX.value = -160;
            shimmerX.value = withRepeat(
                withSequence(
                    withTiming(360, { duration: 1100, easing: Easing.linear }),
                    withTiming(-160, { duration: 0 }),
                ),
                -1
            );
        }
    }, [isSubmitting]);

    // Temporary selection states for modal confirmation
    const [tempAgeRange, setTempAgeRange] = useState<[number, number]>(ageRange);
    const [tempGender, setTempGender] = useState<GenderOption>(gender);
    const [tempGroupType, setTempGroupType] = useState<GroupOption>(groupType);

    const pickerMinDate = useMemo(
        () => new Date(),
        [isDateTimePickerVisible],
    );

    const pickerMaxDate = useMemo(
        () => getMaxEventDateTime(new Date(), EVENT_DATE_WINDOW_DAYS),
        [isDateTimePickerVisible],
    );

    const resetForm = useCallback(() => {
        setEventName("");
        setDescription("");
        setGroupType("Single");
        setGender("Any");
        setAgeRange([AGE_MIN, AGE_MAX]);
        setSelectedDateTime(getDefaultEventDateTime());
        setLocation("");
        setPlaceId("");
        setLatitude(undefined);
        setLongitude(undefined);
        setIsManualLocation(false);
        setCoverKey(DEFAULT_COVER_KEY);
        setAgePickerVisible(false);
        setCoverPickerVisible(false);
        setDateTimePickerVisible(false);
        setSubmitError(null);
        setIsSubmitting(false);
    }, []);

    const applyEventToForm = useCallback((current: UserEvent) => {
        setEventName(current.title);
        setDescription(current.description ?? "");
        setGroupType(current.groupType === "Group" ? "Group" : "Single");
        setGender((current.gender as GenderOption) || "Any");
        setAgeRange([current.minAge ?? AGE_MIN, current.maxAge ?? AGE_MAX]);
        setSelectedDateTime(getEventDateTime(current));
        setLocation(current.location || "");
        setPlaceId(current.placeId ?? "");
        setLatitude(current.latitude);
        setLongitude(current.longitude);
        setIsManualLocation(!current.placeId);
        setCoverKey(current.coverKey ?? DEFAULT_COVER_KEY);
        setAgePickerVisible(false);
        setCoverPickerVisible(false);
        setDateTimePickerVisible(false);
        setSubmitError(null);
    }, []);

    const getCurrentFormState = useCallback(
        (): FormState => ({
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
        if (user && signInVisible) {
            setSignInVisible(false);
        }
    }, [user, signInVisible]);

    // Open modal handlers - set temp to current value
    const openAgePicker = useCallback(() => {
        Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTempAgeRange(ageRange);
        setAgePickerVisible(true);
    }, [ageRange]);

    const openGenderPicker = useCallback(() => {
        Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTempGender(gender);
        setGenderPickerVisible(true);
    }, [gender]);

    const openGroupTypePicker = useCallback(() => {
        Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTempGroupType(groupType);
        setGroupTypePickerVisible(true);
    }, [groupType]);

    // Confirm selection handlers
    const confirmAgeSelection = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setAgeRange(tempAgeRange);
        setAgePickerVisible(false);
    }, [tempAgeRange]);

    const confirmGenderSelection = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setGender(tempGender);
        setGenderPickerVisible(false);
    }, [tempGender]);

    const confirmGroupTypeSelection = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setGroupType(tempGroupType);
        setGroupTypePickerVisible(false);
    }, [tempGroupType]);

    const selectedCoverUri = useMemo(
        () => resolveCoverUri(coverKey),
        [coverKey],
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

    const handleCoverSelect = useCallback((key: CoverKey) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setCoverKey(key);
        setCoverPickerVisible(false);
    }, []);

    const handleLocationSelect = useCallback((place: PlaceDetail) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setLocation(`${place.displayName}, ${place.formattedAddress}`);
        setPlaceId(place.placeId);
        setLatitude(place.latitude);
        setLongitude(place.longitude);
        setIsManualLocation(false);
        setLocationPickerVisible(false);
    }, []);

    const handleManualLocation = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsManualLocation(true);
        setPlaceId("");
        setLatitude(undefined);
        setLongitude(undefined);
        setLocationPickerVisible(false);
    }, []);

    const handleSubmit = useCallback(
        async (formOverride?: FormState) => {
            if (isSubmitting) {
                return;
            }

            const form = formOverride ?? getCurrentFormState();
            const trimmedName = form.eventName.trim();
            const trimmedDescription = form.description.trim();
            const trimmedLocation = form.location.trim();

            if (!trimmedName || !trimmedDescription || !trimmedLocation) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                setSubmitError("All fields are required");
                return;
            }

            if (Number.isNaN(form.selectedDateTime.getTime())) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                setSubmitError("Choose a valid date and time");
                return;
            }

            const now = new Date();
            const maxAllowedDate = getMaxEventDateTime(now, EVENT_DATE_WINDOW_DAYS);
            const normalizedDateTime = new Date(form.selectedDateTime);
            normalizedDateTime.setSeconds(0, 0);

            if (isPastDateTimeSelection(normalizedDateTime, now)) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                setSubmitError("Choose a future date and time");
                return;
            }

            if (normalizedDateTime.getTime() > maxAllowedDate.getTime()) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                setSubmitError("Choose a time within the next 30 days");
                return;
            }

            if (!user) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                setSubmitError("You must be signed in to create an event");
                return;
            }

            setSubmitError(null);
            setIsSubmitting(true);

            const locationLabel = trimmedLocation;
            const [rangeStart, rangeEnd] = form.ageRange;
            const minAge = Math.min(rangeStart, rangeEnd);
            const maxAge = Math.max(rangeStart, rangeEnd);
            const selectedCover = form.coverKey || DEFAULT_COVER_KEY;
            const eventDate = toDateKey(normalizedDateTime);
            const eventTime = formatTime(
                normalizedDateTime.getHours(),
                normalizedDateTime.getMinutes(),
            );
            const selectedLabel = getLegacyDateLabel(eventDate);
            const scheduledAt = normalizedDateTime.toISOString();

            try {
                if (isEditing && editEventId) {
                    await updateUserEvent(editEventId, {
                        title: trimmedName || "New event",
                        location: locationLabel,
                        time: eventTime,
                        eventDate,
                        dateLabel: selectedLabel,
                        description: trimmedDescription.length
                            ? trimmedDescription
                            : undefined,
                        gender: form.gender,
                        minAge,
                        maxAge,
                        groupType: form.groupType,
                        badgeLabel: form.groupType === "Group" ? "Group" : null,
                        coverKey: selectedCover,
                        scheduledAt,
                        placeId: form.placeId,
                        latitude: form.latitude,
                        longitude: form.longitude,
                    });
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    navigation.navigate("EventDetails", {
                        eventId: String(editEventId),
                        origin: "MyEvents",
                        showEventUpdatedBadge: true,
                    });
                } else {
                    const minDelay = new Promise<void>(r => setTimeout(r, 1500));
                    await addUserEvent({
                        title: trimmedName || "New event",
                        location: locationLabel,
                        time: eventTime,
                        eventDate,
                        dateLabel: selectedLabel,
                        description: trimmedDescription.length
                            ? trimmedDescription
                            : undefined,
                        gender: form.gender,
                        minAge,
                        maxAge,
                        groupType: form.groupType,
                        badgeLabel: form.groupType === "Group" ? "Group" : undefined,
                        coverKey: selectedCover,
                        userId: user.id,
                        hostName: user.name,
                        scheduledAt,
                        placeId: form.placeId,
                        latitude: form.latitude,
                        longitude: form.longitude,
                    });
                    await minDelay;
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    resetForm();
                    navigation.dispatch(StackActions.replace("EventCreated", {
                        eventTitle: trimmedName || "New event",
                        coverUri: selectedCoverUri,
                        buttonLayout,
                        skipAnimation: true,
                    }));
                }
            } catch (err) {
                console.error("Failed to submit event", err);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                setSubmitError(
                    `Unable to ${isEditing ? "update" : "publish"} the event. Please try again`,
                );
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const formState = getCurrentFormState();

        // Guest user flow — always open sign-in modal
        if (!user) {
            const hasContent =
                formState.eventName.trim().length > 0 ||
                formState.description.trim().length > 0;

            if (hasContent) {
                // Validate date/time only when there's content to publish
                if (Number.isNaN(formState.selectedDateTime.getTime())) {
                    setSubmitError("Choose a valid date and time");
                    return;
                }

                const now = new Date();
                const maxAllowedDate = getMaxEventDateTime(now, EVENT_DATE_WINDOW_DAYS);
                if (isPastDateTimeSelection(formState.selectedDateTime, now)) {
                    setSubmitError("Choose a future date and time");
                    return;
                }

                if (formState.selectedDateTime.getTime() > maxAllowedDate.getTime()) {
                    setSubmitError("Choose a time within the next 30 days");
                    return;
                }

                // Queue the draft for auto-submit after sign-in
                const trimmedName = formState.eventName.trim();
                const trimmedDescription = formState.description.trim();
                const locationLabel = formState.location.trim() || "To be decided";
                const [rangeStart, rangeEnd] = formState.ageRange;
                const minAge = Math.min(rangeStart, rangeEnd);
                const maxAge = Math.max(rangeStart, rangeEnd);
                const selectedCover = formState.coverKey || DEFAULT_COVER_KEY;
                const normalizedDateTime = new Date(formState.selectedDateTime);
                normalizedDateTime.setSeconds(0, 0);

                const eventDate = toDateKey(normalizedDateTime);
                const selectedLabel = getLegacyDateLabel(eventDate);
                const eventTime = formatTime(
                    normalizedDateTime.getHours(),
                    normalizedDateTime.getMinutes(),
                );
                const scheduledAt = normalizedDateTime.toISOString();

                const draftPayload: GuestEventDraft = {
                    title: trimmedName || "New event",
                    location: locationLabel,
                    time: eventTime,
                    eventDate,
                    dateLabel: selectedLabel,
                    description: trimmedDescription.length ? trimmedDescription : undefined,
                    gender: formState.gender,
                    minAge,
                    maxAge,
                    groupType: formState.groupType,
                    badgeLabel: formState.groupType === "Group" ? "Group" : undefined,
                    coverKey: selectedCover,
                    scheduledAt,
                    placeId: formState.placeId,
                    latitude: formState.latitude,
                    longitude: formState.longitude,
                };

                queueGuestEvent(draftPayload);
            }

            // Always open sign-in modal (no validation blocking for empty fields)
            setSubmitError(null);
            setSignInVisible(true);
            return;
        }

        // Authenticated user flow — validate and submit
        if (!formState.eventName.trim() || !formState.description.trim() || !formState.location.trim()) {
            setSubmitError("All fields are required");
            return;
        }

        if (Number.isNaN(formState.selectedDateTime.getTime())) {
            setSubmitError("Choose a valid date and time");
            return;
        }

        const now = new Date();
        const maxAllowedDate = getMaxEventDateTime(now, EVENT_DATE_WINDOW_DAYS);
        if (isPastDateTimeSelection(formState.selectedDateTime, now)) {
            setSubmitError("Choose a future date and time");
            return;
        }

        if (formState.selectedDateTime.getTime() > maxAllowedDate.getTime()) {
            setSubmitError("Choose a time within the next 30 days");
            return;
        }

        void handleSubmit(formState);
    };

    const primaryButtonLabel = user
        ? isSubmitting
            ? isEditing
                ? "Updating..."
                : "Creating..."
            : isEditing
                ? "Update Event"
                : "Create Event"
        : "Sign Up or Log In";

    const ageLabel = useMemo(() => getAgeLabel(ageRange), [ageRange]);
    const dateTimeLabel = useMemo(
        () => formatPickerDateTimeValue(selectedDateTime),
        [selectedDateTime],
    );

    // Fixed header component (outside scroll view)
    const renderHeader = () => (
        <View style={styles.headerRow}>
            <View style={styles.headerSpacer} />
            <Text style={styles.pageTitle}>{isEditing ? "Edit Details" : "Create Event"}</Text>
            <Pressable
                accessibilityRole="button"
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                    Keyboard.dismiss();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCoverPickerVisible(true);
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
                    <Pressable
                        style={styles.fieldRow}
                        onPress={openGroupTypePicker}
                    >
                        <Text style={styles.fieldLabel}>Group Type</Text>
                        <View style={styles.fieldValuePill}>
                            <Text style={styles.fieldValueText}>
                                {groupDisplayLabels[groupType]}
                            </Text>
                        </View>
                    </Pressable>
                </View>
            </View>

            <View style={styles.fieldCard}>
                <View style={styles.fieldCardInner}>
                    <Pressable
                        style={styles.fieldRow}
                        onPress={openGenderPicker}
                    >
                        <Text style={styles.fieldLabel}>Gender</Text>
                        <View style={styles.fieldValuePill}>
                            <Text style={styles.fieldValueText}>
                                {genderDisplayLabels[gender]}
                            </Text>
                        </View>
                    </Pressable>

                    <View style={styles.fieldDivider} />

                    <Pressable
                        style={styles.fieldRow}
                        onPress={openAgePicker}
                    >
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
                            Keyboard.dismiss();
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setDateTimePickerVisible(true);
                        }}
                    >
                        <Text style={styles.fieldLabel}>Date & Time</Text>
                        <View style={[styles.fieldValuePill, styles.dateTimeValuePill]}>
                            <Text
                                style={[styles.fieldValueText, styles.dateTimeValueText]}
                                numberOfLines={1}
                            >
                                {dateTimeLabel}
                            </Text>
                        </View>
                    </Pressable>

                    <View style={styles.fieldDivider} />

                    {isManualLocation ? (
                        <View style={[styles.fieldRow, styles.locationRow]}>
                            <Text style={styles.fieldLabel}>Location</Text>
                            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <TextInput
                                    placeholder="Example: Bambino"
                                    value={location}
                                    onChangeText={(text) => {
                                        setLocation(text);
                                        setPlaceId("");
                                        setLatitude(undefined);
                                        setLongitude(undefined);
                                    }}
                                    placeholderTextColor="rgba(255, 255, 255, 0.4)"
                                    cursorColor="#FFFFFF"
                                    selectionColor="#FFFFFF"
                                    style={[
                                        styles.textInput,
                                        styles.compactInput,
                                        styles.locationInput,
                                        { flex: 1 },
                                    ]}
                                />
                                <Pressable
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        setIsManualLocation(false);
                                        setLocationPickerVisible(true);
                                    }}
                                    style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 8,
                                        backgroundColor: "rgba(255, 255, 255, 0.2)",
                                        justifyContent: "center",
                                        alignItems: "center",
                                    }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <SearchIcon width={14} height={14} color="#FFFFFF" />
                                </Pressable>
                            </View>
                        </View>
                    ) : (
                        <Pressable
                            style={[styles.fieldRow, styles.locationRow]}
                            onPress={() => {
                                Keyboard.dismiss();
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setLocationPickerVisible(true);
                            }}
                        >
                            <Text style={styles.fieldLabel}>Location</Text>
                            <View style={[styles.fieldValuePill, styles.locationValuePill]}>
                                {location ? (
                                    <LocationPinIcon
                                        width={14}
                                        height={14}
                                        color="rgba(255, 255, 255, 0.9)"
                                        style={{ marginRight: 6 }}
                                    />
                                ) : (
                                    <SearchIcon
                                        width={14}
                                        height={14}
                                        color="rgba(255, 255, 255, 0.4)"
                                        style={{ marginRight: 6 }}
                                    />
                                )}
                                <Text
                                    style={[
                                        styles.fieldValueText,
                                        !location && styles.locationPlaceholder,
                                    ]}
                                    numberOfLines={1}
                                >
                                    {location || "Search for a place..."}
                                </Text>
                            </View>
                        </Pressable>
                    )}
                </View>
            </View>

            <View style={styles.spacer} />

            <View style={styles.footer}>
                {submitError ? (
                    <View style={styles.errorContainer}>
                        <WarningIcon width={14} height={14} style={{ alignSelf: "center" }} />
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
                    style={[
                        styles.primaryButton,
                        isSubmitting && styles.primaryButtonDisabled,
                    ]}
                    onPress={handlePrimaryAction}
                    disabled={isSubmitting}
                    accessibilityRole="button"
                    testID="create-event-submit"
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
                                    colors={["transparent", "rgba(255,255,255,0.8)", "transparent"]}
                                    start={{ x: 0, y: 0.5 }}
                                    end={{ x: 1, y: 0.5 }}
                                    style={StyleSheet.absoluteFill}
                                />
                            </Animated.View>
                        </MaskedView>
                    ) : (
                        <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>
                    )}
                </Pressable>
            </View>
        </>
    );

    return (
        <View style={styles.root}>
            <Image
                source={{ uri: selectedCoverUri }}
                style={styles.backgroundImage}
                resizeMode="cover"
                blurRadius={28}
            />
            <View style={styles.backgroundOverlay} />
            <SafeAreaView style={styles.safeArea} edges={["top"]}>
                {renderHeader()}
                <View style={[styles.overlay, styles.contentWrapper]}>
                    <KeyboardAwareScrollView
                        ref={scrollViewRef}
                        style={styles.formScroll}
                        contentContainerStyle={contentContainerStyle}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
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

            <EventDateTimeModal
                visible={isDateTimePickerVisible}
                value={selectedDateTime}
                minDate={pickerMinDate}
                maxDate={pickerMaxDate}
                onClose={() => setDateTimePickerVisible(false)}
                onConfirm={(value) => {
                    setSelectedDateTime(value);
                    setDateTimePickerVisible(false);
                }}
            />

            {/* Cover Picker Modal */}
            <CoverPickerModal
                visible={isCoverPickerVisible}
                selectedCoverKey={coverKey}
                onSelect={handleCoverSelect}
                onClose={() => setCoverPickerVisible(false)}
            />

            {/* Group Type Selection Modal */}
            <SelectionModal
                visible={isGroupTypePickerVisible}
                title="Group Type"
                options={groupOptions}
                selectedValue={tempGroupType}
                onSelect={setTempGroupType}
                onConfirm={confirmGroupTypeSelection}
                onClose={() => setGroupTypePickerVisible(false)}
                getLabel={(opt) => groupDisplayLabels[opt]}
                getKey={(opt) => opt}
                isSelected={(opt, sel) => opt === sel}
            />

            {/* Gender Selection Modal */}
            <SelectionModal
                visible={isGenderPickerVisible}
                title="Gender"
                options={genderOptions}
                selectedValue={tempGender}
                onSelect={setTempGender}
                onConfirm={confirmGenderSelection}
                onClose={() => setGenderPickerVisible(false)}
                getLabel={(opt) => genderDisplayLabels[opt]}
                getKey={(opt) => opt}
                isSelected={(opt, sel) => opt === sel}
            />

            {/* Age Selection Modal */}
            <SelectionModal<AgeOption>
                visible={isAgePickerVisible}
                title="Age"
                options={ageOptions}
                selectedValue={{ label: "", min: tempAgeRange[0], max: tempAgeRange[1] }}
                onSelect={(opt) => setTempAgeRange([opt.min, opt.max])}
                onConfirm={confirmAgeSelection}
                onClose={() => setAgePickerVisible(false)}
                getLabel={(opt) => opt.label}
                getKey={(opt) => opt.label}
                isSelected={(opt, sel) => opt.min === sel.min && opt.max === sel.max}
            />

            <LocationPickerModal
                visible={isLocationPickerVisible}
                onClose={() => setLocationPickerVisible(false)}
                onSelect={handleLocationSelect}
                onManualEntry={handleManualLocation}
                initialQuery={location}
            />

            <BottomSheetModal visible={signInVisible} onClose={() => setSignInVisible(false)}>
                <SignInButtons />
            </BottomSheetModal>

        </View>
    );
};

const shimmerStyles = StyleSheet.create({
    root: {
        alignItems: "center",
    },
    mask: {
        backgroundColor: "transparent",
        alignItems: "center",
    },
    dimText: {
        opacity: 0.45,
    },
    strip: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: 160,
    },
});

export default CreateEventScreen;
