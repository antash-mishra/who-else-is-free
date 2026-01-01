import React from "react";
import { FlatList, Image, Modal, Pressable, Text, View } from "react-native";

import { COVER_OPTIONS, CoverKey } from "@constants/covers";
import { spacing } from "@theme/index";
import styles from "./CoverPickerModal.styles";

export type CoverPickerModalProps = {
    visible: boolean;
    selectedCoverKey: CoverKey;
    onSelect: (key: CoverKey) => void;
    onClose: () => void;
};

const CoverPickerModal: React.FC<CoverPickerModalProps> = ({
    visible,
    selectedCoverKey,
    onSelect,
    onClose,
}) => {
    return (
        <Modal visible={visible} transparent animationType="fade">
            <Pressable style={styles.backdrop} onPress={onClose}>
                <View style={styles.content}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Choose a cover</Text>
                        <Text style={styles.subtitle}>
                            Pick a card that best matches your vibe.
                        </Text>
                    </View>
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
                        ListFooterComponent={<View style={styles.footer} />}
                        showsVerticalScrollIndicator={false}
                    />
                </View>
            </Pressable>
        </Modal>
    );
};

export default CoverPickerModal;
