import React, { useMemo, useState } from 'react';

import {
  useWindowDimensions,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CheckSelectedCoverIcon from '@assets/create-event/check-selected-cover.svg';
import SearchIcon from '@assets/create-event/search.svg';
import { AppButton, AppText, FrostedSurface } from '@components/ui';
import { CoverKey } from '@constants/covers';
import { useCovers } from '@context/CoversContext';
import { triggerHaptic } from '@services/haptics';
import { colors, spacing } from '@theme/index';
import { searchCovers } from '@utils/coverSearch';

import BottomSheetModal from './BottomSheetModal';
import styles from './CoverPickerModal.styles';

export type CoverPickerModalProps = {
  visible: boolean;
  selectedCoverKey: CoverKey;
  onSelect: (key: CoverKey) => void;
  onClose: () => void;
};

interface CoverPickerContentProps {
  selectedCoverKey?: CoverKey;
  onSelect: (key: CoverKey) => void;
  onPickPhoto?: () => void;
  isPickingPhoto?: boolean;
  pickerError?: string | null;
  isReady?: boolean;
}

export const CoverPickerContent: React.FC<CoverPickerContentProps> = ({
  selectedCoverKey,
  onSelect,
  onPickPhoto,
  isPickingPhoto,
  pickerError,
  isReady = true,
}) => {
  const { height } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const { covers, categories } = useCovers();
  const [query, setQuery] = useState('');
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const results = useMemo(
    () => searchCovers(covers, categories, { query, categoryKey }),
    [covers, categories, query, categoryKey],
  );

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (text.trim().length > 0) {
      setCategoryKey(null);
    }
  };

  const handleChipPress = (key: string) => {
    triggerHaptic('selection');
    setQuery('');
    setCategoryKey((current) => (current === key ? null : key));
  };

  return (
    <View
      style={{
        height: height * 0.73,
        flexShrink: 1,
        marginBottom: onPickPhoto ? 0 : -(spacing.sm + bottom),
      }}
    >
      <View style={styles.searchContainer}>
        <SearchIcon width={16} height={16} color={colors.cardMeta} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Search"
          placeholderTextColor={colors.cardMeta}
          autoCorrect={false}
          returnKeyType="search"
          testID="cover-search-input"
        />
      </View>
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
          keyboardShouldPersistTaps="handled"
        >
          {categories.map((category) => {
            const isActive = category.key === categoryKey;
            return (
              <Pressable
                key={category.key}
                onPress={() => handleChipPress(category.key)}
                style={[styles.chip, isActive && styles.chipActive]}
                testID={`cover-chip-${category.key}`}
              >
                <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                  {category.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {isReady && (
        <Animated.View entering={FadeIn.duration(180)} style={styles.gridContainer}>
          <FlatList
            data={results}
            numColumns={3}
            keyExtractor={(item) => item.key}
            columnWrapperStyle={styles.column}
            contentContainerStyle={[styles.grid, onPickPhoto && styles.gridWithAction]}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={18}
            maxToRenderPerBatch={9}
            windowSize={7}
            removeClippedSubviews
            renderItem={({ item }) => {
              const isSelected = item.key === selectedCoverKey;
              return (
                <View style={[styles.optionRing, isSelected && styles.optionRingSelected]}>
                  <Pressable
                    style={styles.option}
                    onPress={() => {
                      triggerHaptic('selection');
                      onSelect(item.key);
                    }}
                  >
                    <View style={styles.optionImageWrapper}>
                      <Image
                        source={item.source}
                        style={styles.optionImage}
                        contentFit="cover"
                        recyclingKey={item.key}
                      />
                    </View>
                    {isSelected && (
                      <FrostedSurface tint="dark" intensity={60} blur style={styles.checkBadge}>
                        <CheckSelectedCoverIcon width={14} height={14} />
                      </FrostedSurface>
                    )}
                  </Pressable>
                </View>
              );
            }}
            ListFooterComponent={<View style={{ height: spacing.md }} />}
            showsVerticalScrollIndicator={false}
          />
        </Animated.View>
      )}
      {onPickPhoto && (
        <View style={styles.libraryAction}>
          {pickerError && <AppText style={styles.pickerError}>{pickerError}</AppText>}
          <AppButton
            label="Choose from library"
            fullWidth
            onPress={onPickPhoto}
            loading={isPickingPhoto}
            style={styles.libraryButton}
            testID="choose-custom-cover"
          />
        </View>
      )}
    </View>
  );
};

const CoverPickerModal: React.FC<CoverPickerModalProps> = ({
  visible,
  onClose,
  ...contentProps
}) => {
  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="Choose cover">
      <CoverPickerContent {...contentProps} />
    </BottomSheetModal>
  );
};

export default CoverPickerModal;
