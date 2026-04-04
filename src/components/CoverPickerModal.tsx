import React from "react";
import { Dimensions, FlatList, Image, Pressable, Text, View } from "react-native";

import { COVER_OPTIONS, CoverKey } from "@constants/covers";
import { spacing } from "@theme/index";
import BottomSheetModal from "./BottomSheetModal";
import styles from "./CoverPickerModal.styles";

export type CoverPickerModalProps = {
    visible: boolean;
    selectedCoverKey: CoverKey;
    onSelect: (key: CoverKey) => void;
    onClose: () => void;
};

const LIST_MAX_HEIGHT = Dimensions.get("window").height * 0.5;

const CoverPickerModal: React.FC<CoverPickerModalProps> = ({
    visible,
    selectedCoverKey,
    onSelect,
    onClose,
}) => {
    return (
        <BottomSheetModal visible={visible} onClose={onClose} title="Choose a cover">
            <Text style={styles.subtitle}>
                Pick a card that best matches your vibe.
            </Text>
            <View style={{ maxHeight: LIST_MAX_HEIGHT }}>
                <FlatList
                    data={COVER_OPTIONS}
                    numColumns={2}
                    keyExtractor={(item) => item.key}
                    columnWrapperStyle={styles.column}
                    contentContainerStyle={styles.grid}
                    renderItem={({ item }) => {
                        const isSelected = item.key === selectedCoverKey;
                        return (
                            <Pressable
                                style={[
                                    styles.option,
                                    isSelected && styles.optionSelected,
                                ]}
                                onPress={() => onSelect(item.key)}
                            >
                                <Image
                                    source={item.source}
                                    style={styles.optionImage}
                                />
                            </Pressable>
                        );
                    }}
                    ListFooterComponent={<View style={{ height: spacing.md }} />}
                    showsVerticalScrollIndicator={false}
                />
            </View>
        </BottomSheetModal>
    );
};

export default CoverPickerModal;
