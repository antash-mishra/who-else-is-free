import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from "react-native";

import BottomSheetModal from "./BottomSheetModal";
import SearchIcon from "@assets/create-event/search.svg";
import {
    usePlacesAutocomplete,
    fetchPlaceDetails,
    PlacePrediction,
    PlaceDetail,
} from "@hooks/usePlacesAutocomplete";
import { logger } from "@services/logger";
import styles from "./LocationPickerModal.styles";

export type LocationPickerModalProps = {
    visible: boolean;
    onClose: () => void;
    onSelect: (place: PlaceDetail) => void;
    initialQuery?: string;
    countryCode?: string | null;
    /** Focus only after the parent sheet has finished its entry animation. */
    isSheetReady?: boolean;
};

export const LocationPickerContent = ({
    visible,
    onClose,
    onSelect,
    initialQuery = "",
    countryCode,
    isSheetReady = visible,
}: LocationPickerModalProps) => {
    const { height: windowHeight } = useWindowDimensions();
    const [query, setQuery] = useState(initialQuery);
    const { results, loading, error: autocompleteError, search, clear } = usePlacesAutocomplete(countryCode);
    const [selectingId, setSelectingId] = useState<string | null>(null);
    const [selectionError, setSelectionError] = useState<string | null>(null);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const inputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (visible) {
            setQuery(initialQuery);
            if (initialQuery.length >= 2) {
                search(initialQuery);
            }
        } else {
            const timer = setTimeout(() => {
                clear();
                setQuery("");
                setSelectingId(null);
                setSelectionError(null);
            }, 350);
            return () => clearTimeout(timer);
        }
    }, [visible, initialQuery, search, clear]);

    useEffect(() => {
        if (!visible || !isSheetReady) {
            return undefined;
        }

        const timer = setTimeout(() => inputRef.current?.focus(), 16);
        return () => clearTimeout(timer);
    }, [isSheetReady, visible]);

    const handleQueryChange = useCallback(
        (text: string) => {
            setQuery(text);
            setSelectionError(null);
            search(text);
        },
        [search],
    );

    const handleSelect = useCallback(
        async (prediction: PlacePrediction) => {
            if (selectingId) return;
            setSelectingId(prediction.placeId);
            try {
                const details = await fetchPlaceDetails(prediction.placeId);
                onSelect(details);
            } catch (error) {
                logger.warn("Failed to fetch place details", error);
                setSelectionError("Could not get coordinates for that place. Please try another result.");
            } finally {
                setSelectingId(null);
            }
        },
        [onSelect, selectingId],
    );

    const hasQuery = query.length >= 2;
    const error = selectionError ?? autocompleteError;
    const showResults = hasQuery && !loading && !error;
    const showEmpty = hasQuery && !loading && !error && results.length === 0;
    const showTypingHint = query.length > 0 && query.length < 2 && !loading;
    const shouldCenterResults = Boolean(error);

    return (
        <View style={[styles.container, { flex: 1 }]}>
            <View style={styles.searchContainer}>
                <SearchIcon width={16} height={16} color="#8E8E93" />
                <TextInput
                    ref={inputRef}
                    style={styles.searchInput}
                    placeholder={isSearchFocused ? "" : "Search Location"}
                    placeholderTextColor="#C7C7CC"
                    value={query}
                    onChangeText={handleQueryChange}
                    returnKeyType="search"
                    underlineColorAndroid="transparent"
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                    onSubmitEditing={() => search(query)}
                />
            </View>

            <ScrollView
                style={[styles.resultsList, { maxHeight: Math.round(windowHeight * 0.35) }]}
                contentContainerStyle={[
                    styles.resultsContent,
                    { flexGrow: 1 },
                    shouldCenterResults && styles.resultsContentCentered,
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {loading && (
                    <View style={styles.inlineLoadingContainer}>
                        <ActivityIndicator size="small" color="#8E8E93" />
                        <Text style={styles.inlineHintNopad}>Searching for places...</Text>
                    </View>
                )}

                {error && !loading && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                        <Text style={styles.errorRetryText}>
                            Search again or choose another result
                        </Text>
                    </View>
                )}

                {showEmpty && (
                    <Text style={styles.inlineHint}>No places found</Text>
                )}

                {showTypingHint && (
                    <Text style={styles.inlineHint}>Keep typing to discover places nearby...</Text>
                )}

                {showResults && results.length > 0 && (
                    <>
                        {results.map((prediction, index) => (
                            <Pressable
                                key={`${prediction.placeId}-${index}`}
                                style={({ pressed }) => [
                                    styles.resultRow,
                                    pressed && styles.resultRowPressed,
                                ]}
                                onPress={() => {
                                    onClose();
                                    handleSelect(prediction);
                                }}
                                disabled={selectingId === prediction.placeId}
                            >
                                <View style={styles.resultTextContainer}>
                                    <Text style={styles.resultMainText} numberOfLines={1}>
                                        {prediction.mainText}
                                    </Text>
                                    <Text style={styles.resultSecondaryText} numberOfLines={1}>
                                        {prediction.secondaryText}
                                    </Text>
                                </View>
                                {selectingId === prediction.placeId && (
                                    <ActivityIndicator size="small" color="#C7C7CC" />
                                )}
                            </Pressable>
                        ))}
                    </>
                )}
            </ScrollView>
        </View>
    );
};

const LocationPickerModal = (props: LocationPickerModalProps) => {
    const { visible, onClose, ...contentProps } = props;
    const { height: windowHeight } = useWindowDimensions();
    const sheetHeight = useMemo(
        () => Math.round(windowHeight * 0.9),
        [windowHeight],
    );
    const [isSheetReady, setIsSheetReady] = useState(false);

    const handleClose = useCallback(() => {
        setIsSheetReady(false);
        onClose();
    }, [onClose]);

    return (
        <BottomSheetModal
            visible={visible}
            onClose={handleClose}
            title="Select Location"
            avoidKeyboard={false}
            snapHeight={sheetHeight}
            onOpened={() => setIsSheetReady(true)}
        >
            <LocationPickerContent
                {...contentProps}
                visible={visible}
                onClose={handleClose}
                isSheetReady={isSheetReady}
            />
        </BottomSheetModal>
    );
};

export default LocationPickerModal;
