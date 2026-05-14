import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Keyboard,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

import BottomSheetModal from "./BottomSheetModal";
import SearchIcon from "@assets/ui/search.svg";
import CloseIcon from "@assets/ui/close.svg";
import LocationPinIcon from "@assets/ui/location-pin.svg";
import ChevronRightIcon from "@assets/ui/chevron-right.svg";
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

const LocationPickerModal = ({
    visible,
    onClose,
    onSelect,
    initialQuery = "",
}: LocationPickerModalProps) => {
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
            clear();
            setSelectingId(null);
            setSelectionError(null);
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
    const showInitialHint = query.length === 0 && !loading;

    return (
        <BottomSheetModal visible={visible} onClose={onClose} title="Choose Location">
            <View style={styles.container}>
                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <SearchIcon width={18} height={18} color="#8E8E93" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search restaurants, bars, venues..."
                        placeholderTextColor="#C7C7CC"
                        value={query}
                        onChangeText={handleQueryChange}
                        autoFocus
                        returnKeyType="search"
                        onSubmitEditing={() => search(query)}
                    />
                    {query.length > 0 && (
                        <Pressable
                            style={styles.clearButton}
                            onPress={() => {
                                setQuery("");
                                clear();
                                setSelectionError(null);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <CloseIcon width={10} height={10} color="#FFFFFF" />
                        </Pressable>
                    )}
                </View>

                <ScrollView
                    style={styles.resultsList}
                    contentContainerStyle={styles.resultsContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Loading State */}
                    {loading && (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator color="#8E8E93" />
                            <Text style={styles.loadingText}>Searching places...</Text>
                        </View>
                    )}

                    {/* Error State */}
                    {error && !loading && (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>{error}</Text>
                            <Text style={styles.errorRetryText}>
                                Search again or choose another result
                            </Text>
                        </View>
                    )}

                    {/* Empty State */}
                    {showEmpty && (
                        <View style={styles.emptyState}>
                            <LocationPinIcon width={48} height={48} color="#C7C7CC" />
                            <Text style={styles.emptyStateTitle}>
                                No places found
                            </Text>
                            <Text style={styles.emptyStateText}>
                                Try searching with a different name or more specific area
                            </Text>
                        </View>
                    )}

                    {/* Typing Hint */}
                    {showTypingHint && (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyStateText}>
                                Keep typing to discover places nearby...
                            </Text>
                        </View>
                    )}

                    {/* Initial Hint */}
                    {showInitialHint && (
                        <View style={styles.emptyState}>
                            <LocationPinIcon width={48} height={48} color="#C7C7CC" />
                            <Text style={styles.emptyStateTitle}>
                                Where&apos;s the vibe at?
                            </Text>
                            <Text style={styles.emptyStateText}>
                                Search for restaurants, bars, cafes, or any cool spot for your event
                            </Text>
                        </View>
                    )}

                    {/* Results */}
                    {showResults && results.length > 0 && (
                        <>
                            <Text style={styles.sectionLabel}>Suggestions</Text>
                            {results.map((prediction, index) => (
                                <Pressable
                                    key={`${prediction.placeId}-${index}`}
                                    style={({ pressed }) => [
                                        styles.resultRow,
                                        pressed && styles.resultRowPressed,
                                    ]}
                                    onPress={() => {
                                        Keyboard.dismiss();
                                        handleSelect(prediction);
                                    }}
                                    disabled={selectingId === prediction.placeId}
                                >
                                    <View style={styles.resultIconContainer}>
                                        <LocationPinIcon
                                            width={20}
                                            height={20}
                                            color="#2563EB"
                                        />
                                    </View>
                                    <View style={styles.resultTextContainer}>
                                        <Text style={styles.resultMainText} numberOfLines={1}>
                                            {prediction.mainText}
                                        </Text>
                                        <Text style={styles.resultSecondaryText} numberOfLines={1}>
                                            {prediction.secondaryText}
                                        </Text>
                                    </View>
                                    {selectingId === prediction.placeId ? (
                                        <ActivityIndicator size="small" color="#C7C7CC" />
                                    ) : (
                                        <ChevronRightIcon
                                            width={16}
                                            height={16}
                                            color="#C7C7CC"
                                        />
                                    )}
                                </Pressable>
                            ))}
                        </>
                    )}
                </ScrollView>
            </View>
        </BottomSheetModal>
    );
};

export default LocationPickerModal;
