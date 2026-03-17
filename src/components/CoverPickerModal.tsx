import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, FlatList, Image, Modal, Pressable, Text, View } from "react-native";

import { COVER_OPTIONS, CoverKey } from "@constants/covers";
import { spacing } from "@theme/index";
import styles from "./CoverPickerModal.styles";

export type CoverPickerModalProps = {
    visible: boolean;
    selectedCoverKey: CoverKey;
    onSelect: (key: CoverKey) => void;
    onClose: () => void;
};

const SLIDE_DURATION = 250;
const SLIDE_DISTANCE = Dimensions.get('window').height;

const CoverPickerModal: React.FC<CoverPickerModalProps> = ({
    visible,
    selectedCoverKey,
    onSelect,
    onClose,
}) => {
    const slideAnim = useRef(new Animated.Value(SLIDE_DISTANCE)).current;

    useEffect(() => {
        if (visible) {
            slideAnim.setValue(SLIDE_DISTANCE);
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: SLIDE_DURATION,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, slideAnim]);

    const animateOut = (callback: () => void) => {
        Animated.timing(slideAnim, {
            toValue: SLIDE_DISTANCE,
            duration: SLIDE_DURATION,
            useNativeDriver: true,
        }).start(() => {
            callback();
        });
    };

    const handleClose = () => {
        animateOut(onClose);
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            <Pressable style={styles.backdrop} onPress={handleClose}>
                <Animated.View style={[styles.content, { transform: [{ translateY: slideAnim }] }]}>
                    <Pressable onPress={(e) => e.stopPropagation()}>
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
                                        onPress={() => {
                                            animateOut(() => onSelect(item.key));
                                        }}
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
                    </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
};

export default CoverPickerModal;
