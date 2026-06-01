import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { Springs } from "@theme/springs";
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
import { useCovers } from "@context/CoversContext";
import { CoverKey, DEFAULT_COVER_KEY } from "@constants/covers";
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
import { formatEventLocationName } from "@utils/eventDisplay";
import UploadIcon from "@assets/create-event/choose-cover.svg";
import WarningIcon from "@assets/ui/error.svg";
import CreateEventBottomSheet from "@components/CreateEventBottomSheet";
import { SelectionModalContent } from "@components/SelectionModal";
import { CoverPickerContent } from "@components/CoverPickerModal";
import { EventDateTimePickerContent } from "@components/EventDateTimeModal";
import { LocationPickerContent } from "@components/LocationPickerModal";
import type { PlaceDetail } from "@hooks/usePlacesAutocomplete";
import SignInButtons from "../components/SignInButtons";
import styles from "./CreateEventScreen.styles";

type ButtonLayout = { x: number; y: number; width: number; height: number };
type CreateEventSheet =
    | "age"
    | "gender"
    | "groupType"
    | "cover"
    | "dateTime"
    | "location"
    | "signIn";

const SHEET_CLOSE_DURATION_MS = 320;
const KEYBOARD_SHEET_SETTLE_DELAY_MS = Platform.OS === "ios" ? 90 : 140;
const KEYBOARD_SHEET_OPEN_FALLBACK_MS = Platform.OS === "ios" ? 420 : 360;

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

const hasSelectedPlaceLocation = (form: FormState) =>
    !!form.placeId &&
    typeof form.latitude === "number" &&
    Number.isFinite(form.latitude) &&
    typeof form.longitude === "number" &&
    Number.isFinite(form.longitude);

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
    const { height: windowHeight } = useWindowDimensions();
    const { addUserEvent, updateUserEvent, events, queueGuestEvent } =
        useEvents();
    const { user } = useAuth();
    const { resolveCover } = useCovers();
    const scrollViewRef = useRef<KeyboardAwareScrollView>(null);
    const createStartTrackedRef = useRef(false);

    // Responsive gap for spacing between form elements
    const responsiveGap = spacing.xs;
    const locationSheetHeight = useMemo(
        () => Math.round(windowHeight * 0.9),
        [windowHeight],
    );

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
    const [locationDisplayName, setLocationDisplayName] = useState(
        formatEventLocationName(editEvent?.location),
    );
    const [placeId, setPlaceId] = useState(editEvent?.placeId || "");
    const [latitude, setLatitude] = useState<number | undefined>(editEvent?.latitude);
    const [longitude, setLongitude] = useState<number | undefined>(editEvent?.longitude);
    const [coverKey, setCoverKey] = useState<CoverKey>(
        editEvent?.coverKey ?? DEFAULT_COVER_KEY,
    );

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
    const [buttonLayout, setButtonLayout] = useState<ButtonLayout>({ x: 0, y: 0, width: 0, height: 0 });
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
        [activeSheet],
    );

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
        const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
            keyboardVisibleRef.current = true;
        });
        const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
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

    const resetForm = useCallback(() => {
        setEventName("");
        setDescription("");
        setGroupType("Single");
        setGender("Any");
        setAgeRange([AGE_MIN, AGE_MAX]);
        setSelectedDateTime(getDefaultEventDateTime());
        setLocation("");
        setLocationDisplayName("");
        setPlaceId("");
        setLatitude(undefined);
        setLongitude(undefined);
        setCoverKey(DEFAULT_COVER_KEY);
        closeSheetImmediately();
        setSubmitError(null);
        setIsSubmitting(false);
    }, [closeSheetImmediately]);

    const applyEventToForm = useCallback((current: UserEvent) => {
        setEventName(current.title);
        setDescription(current.description ?? "");
        setGroupType(current.groupType === "Group" ? "Group" : "Single");
        setGender((current.gender as GenderOption) || "Any");
        setAgeRange([current.minAge ?? AGE_MIN, current.maxAge ?? AGE_MAX]);
        setSelectedDateTime(getEventDateTime(current));
        setLocation(current.location || "");
        setLocationDisplayName(formatEventLocationName(current.location));
        setPlaceId(current.placeId ?? "");
        setLatitude(current.latitude);
        setLongitude(current.longitude);
        setCoverKey(current.coverKey ?? DEFAULT_COVER_KEY);
        closeSheetImmediately();
        setSubmitError(null);
    }, [closeSheetImmediately]);

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
        if (user && activeSheet === "signIn") {
            closeActiveSheet();
        }
    }, [activeSheet, closeActiveSheet, user]);

    // Open modal handlers - set temp to current value
    const openAgePicker = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTempAgeRange(ageRange);
        openSheet("age");
    }, [ageRange, openSheet]);

    const openGenderPicker = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTempGender(gender);
        openSheet("gender");
    }, [gender, openSheet]);

    const openGroupTypePicker = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTempGroupType(groupType);
        openSheet("groupType");
    }, [groupType, openSheet]);

    // Confirm selection handlers
    const confirmAgeSelection = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setAgeRange(tempAgeRange);
        closeActiveSheet();
    }, [closeActiveSheet, tempAgeRange]);

    const confirmGenderSelection = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setGender(tempGender);
        closeActiveSheet();
    }, [closeActiveSheet, tempGender]);

    const confirmGroupTypeSelection = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setGroupType(tempGroupType);
        closeActiveSheet();
    }, [closeActiveSheet, tempGroupType]);

    const selectedCoverUri = useMemo(
        () => resolveCover(coverKey),
        [coverKey, resolveCover],
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
        closeActiveSheet();
    }, [closeActiveSheet]);

    const handleLocationSelect = useCallback((place: PlaceDetail) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const displayName = place.displayName || place.formattedAddress;
        const fullLocation = place.displayName && place.formattedAddress
            ? `${place.displayName}, ${place.formattedAddress}`
            : displayName;
        setLocation(fullLocation);
        setLocationDisplayName(displayName);
        setPlaceId(place.placeId);
        setLatitude(place.latitude);
        setLongitude(place.longitude);
        closeActiveSheet();
    }, [closeActiveSheet]);

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

            if (!hasSelectedPlaceLocation(form)) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                setSubmitError("Choose a location from search suggestions");
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
                    navigation.dispatch(
                        StackActions.popTo(
                            "EventDetails",
                            {
                                eventId: String(editEventId),
                                origin: "MyEvents",
                                showEventUpdatedBadge: true,
                            },
                            { merge: true },
                        ),
                    );
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
            openSheet("signIn");
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
    const selectedLocationLabel = locationDisplayName || location;

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
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    openSheet("cover");
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
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            openSheet("dateTime");
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

                    <Pressable
                        style={[styles.fieldRow, styles.locationRow]}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            openSheet("location");
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
                                {selectedLocationLabel || "Select Location"}
                            </Text>
                        </View>
                    </Pressable>
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
                    style={{ width: "100%" }}
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
                <Animated.View style={[
                    styles.primaryButton,
                    isSubmitting && styles.primaryButtonDisabled,
                    buttonScaleStyle,
                ]}>
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
                </Animated.View>
                </Pressable>
            </View>
        </>
    );

    const sheetTitle = (() => {
        switch (renderedSheet) {
            case "dateTime":
                return "When is your event?";
            case "cover":
                return "Choose a cover";
            case "groupType":
                return "Group Type";
            case "gender":
                return "Gender";
            case "age":
                return "Age";
            case "location":
                return "Select Location";
            default:
                return undefined;
        }
    })();

    const renderSheetContent = () => {
        switch (renderedSheet) {
            case "dateTime":
                return (
                    <EventDateTimePickerContent
                        visible={activeSheet === "dateTime"}
                        value={selectedDateTime}
                        minDate={pickerMinDate}
                        maxDate={pickerMaxDate}
                        onConfirm={(value) => {
                            setSelectedDateTime(value);
                            closeActiveSheet();
                        }}
                    />
                );
            case "cover":
                return (
                    <CoverPickerContent
                        selectedCoverKey={coverKey}
                        onSelect={handleCoverSelect}
                    />
                );
            case "groupType":
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
            case "gender":
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
            case "age":
                return (
                    <SelectionModalContent<AgeOption>
                        options={ageOptions}
                        selectedValue={{ label: "", min: tempAgeRange[0], max: tempAgeRange[1] }}
                        onSelect={(opt) => setTempAgeRange([opt.min, opt.max])}
                        onConfirm={confirmAgeSelection}
                        getLabel={(opt) => opt.label}
                        getKey={(opt) => opt.label}
                        isSelected={(opt, sel) => opt.min === sel.min && opt.max === sel.max}
                    />
                );
            case "location":
                return (
                    <LocationPickerContent
                        visible={activeSheet === "location"}
                        onClose={closeActiveSheet}
                        onSelect={handleLocationSelect}
                        initialQuery={selectedLocationLabel}
                    />
                );
            case "signIn":
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

            <CreateEventBottomSheet
                visible={activeSheet !== null}
                title={sheetTitle}
                onClose={closeActiveSheet}
                snapHeight={renderedSheet === "location" ? locationSheetHeight : undefined}
            >
                {renderSheetContent()}
            </CreateEventBottomSheet>

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
