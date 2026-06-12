import React, { useEffect, useMemo, useState } from 'react';

import { Dimensions, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CheckSelectedCoverIcon from '@assets/create-event/check-selected-cover.svg';
import SearchIcon from '@assets/create-event/search.svg';
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

type CoverPickerContentProps = Omit<CoverPickerModalProps, 'visible' | 'onClose'>;

// Fixed content height that lands the whole sheet (content + title chrome)
// at ~80% of the screen, so more covers are visible per scroll.
const LIST_HEIGHT = Dimensions.get('window').height * 0.73;
// Mount the image grid only after the sheet's open animation has settled —
// inflating ~130 image cells competes with the UI-thread spring and stutters.
// The bouncyUp spring needs ~400ms to settle.
const GRID_MOUNT_DELAY_MS = 500;

export const CoverPickerContent: React.FC<CoverPickerContentProps> = ({
  selectedCoverKey,
  onSelect,
}) => {
  const { bottom } = useSafeAreaInsets();
  const { covers, categories } = useCovers();
  const [query, setQuery] = useState('');
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [gridReady, setGridReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setGridReady(true), GRID_MOUNT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

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
    <View style={{ height: LIST_HEIGHT, marginBottom: -(8 + bottom) }}>
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
      {gridReady && (
        <Animated.View entering={FadeIn.duration(180)} style={styles.gridContainer}>
          <FlatList
            data={results}
            numColumns={3}
            keyExtractor={(item) => item.key}
            columnWrapperStyle={styles.column}
            contentContainerStyle={styles.grid}
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
        </Animated.View>
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
