import React from "react";
import { Dimensions, FlatList, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";

import { CoverKey } from "@constants/covers";
import { useCovers } from "@context/CoversContext";
import { spacing } from "@theme/index";
import CheckSelectedCoverIcon from "@assets/create-event/check-selected-cover.svg";
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
    const { bottom } = useSafeAreaInsets();
    const { covers } = useCovers();
    return (
        <BottomSheetModal visible={visible} onClose={onClose} title="Choose a cover">
            <View style={{ maxHeight: LIST_MAX_HEIGHT, marginBottom: -(8 + bottom) }}>
                <FlatList
                    data={covers}
                    numColumns={2}
                    keyExtractor={(item) => item.key}
                    columnWrapperStyle={styles.column}
                    contentContainerStyle={styles.grid}
                    renderItem={({ item }) => {
                        const isSelected = item.key === selectedCoverKey;
                        return (
                            <View style={[styles.optionRing, isSelected && styles.optionRingSelected]}>
                                <Pressable
                                    style={styles.option}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        onSelect(item.key);
                                    }}
                                >
                                    <View style={styles.optionImageWrapper}>
                                        <Image
                                            source={item.source}
                                            style={styles.optionImage}
                                            contentFit="cover"
                                        />
                                    </View>
                                    {isSelected && (
                                        <BlurView intensity={60} tint="dark" style={styles.checkBadge}>
                                            <CheckSelectedCoverIcon width={14} height={14} />
                                        </BlurView>
                                    )}
                                </Pressable>
                            </View>
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
