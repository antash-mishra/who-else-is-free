import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import styles from "./LocationPickerModal.styles";

export type LocationPickerModalProps = {
    visible: boolean;
    onClose: () => void;
    onSelect: (place: PlaceDetail) => void;
    initialQuery?: string;
};

export const LocationPickerContent = ({
    visible,
    onClose,
    onSelect,
    initialQuery = "",
}: LocationPickerModalProps) => {
    const { height: windowHeight } = useWindowDimensions();
    const [query, setQuery] = useState(initialQuery);
    const { results, loading, error: autocompleteError, search, clear } = usePlacesAutocomplete();
    const [selectingId, setSelectingId] = useState<string | null>(null);
    const [selectionError, setSelectionError] = useState<string | null>(null);

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
                console.warn("Failed to fetch place details", error);
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
                    style={styles.searchInput}
                    placeholder="Search Location"
                    placeholderTextColor="#C7C7CC"
                    value={query}
                    onChangeText={handleQueryChange}
                    autoFocus
                    returnKeyType="search"
                    underlineColorAndroid="transparent"
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
                        <Text style={styles.inlineHintNopad}>Searching places...</Text>
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
                    <Text style={styles.inlineHint}>No places with this name found</Text>
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
    const { height: windowHeight } = useWindowDimensions();
    const sheetHeight = useMemo(
        () => Math.round(windowHeight * 0.9),
        [windowHeight],
    );

    return (
        <BottomSheetModal visible={props.visible} onClose={props.onClose} title="Select Location" avoidKeyboard={false} snapHeight={sheetHeight}>
            <LocationPickerContent {...props} />
        </BottomSheetModal>
    );
};

export default LocationPickerModal;
