import { memo, ReactNode, useCallback, useMemo } from 'react';

import {
  RefreshControl,
  SectionList,
  SectionListRenderItemInfo,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import EventCard, { EventItemProps } from '@components/EventCard';
import { Placed } from '@components/motion';
import ScalePressable from '@components/ScalePressable';
import { triggerHaptic } from '@services/haptics';
import { colors, componentTokens, spacing, typography } from '@theme/index';
import { motionTiming } from '@theme/motion';

import { EventSection } from './eventListSections';

export type EventSectionListProps<TItem extends EventItemProps = EventItemProps> = {
  sections: EventSection<TItem>[];
  onEventPress: (item: TItem) => void;
  emptyState?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  footer?: ReactNode;
  /** Initial mode bounds entry staggering across date sections and appended pages. */
  entryAnimation?: 'section' | 'initial';
  headerPaddingTop?: number;
  bottomInset?: number;
  bottomPadding?: number;
  footerSpacingHeight?: number;
  contentHorizontalPadding?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  emptyContentStyle?: StyleProp<ViewStyle>;
  /**
   * When set and the list is empty, the empty state is top-anchored at this
   * padding from the top of the list content (instead of `headerPaddingTop`),
   * so it lands at a consistent screen position across screens.
   */
  emptyStateTopPadding?: number;
};

type EventCardRowProps<TItem extends EventItemProps> = {
  item: TItem;
  onPress: (item: TItem) => void;
};

const EventCardRow = <TItem extends EventItemProps>({
  item,
  onPress,
}: EventCardRowProps<TItem>) => (
  <ScalePressable
    onPress={() => {
      triggerHaptic('light');
      onPress(item);
    }}
    delay={80}
    tilt
    tiltSeed={item.id}
  >
    <EventCard {...item} />
  </ScalePressable>
);

const EventSectionList = <TItem extends EventItemProps>({
  sections,
  onEventPress,
  emptyState,
  refreshing = false,
  onRefresh,
  onEndReached,
  footer,
  entryAnimation = 'section',
  headerPaddingTop = 0,
  bottomInset = 0,
  bottomPadding,
  footerSpacingHeight = spacing.xl,
  contentHorizontalPadding = true,
  contentContainerStyle,
  emptyContentStyle,
  emptyStateTopPadding,
}: EventSectionListProps<TItem>) => {
  const resolvedBottomPadding = bottomPadding ?? spacing.xl + bottomInset;
  const shouldShowFooterSpacing = sections.length > 0 && footerSpacingHeight > 0;
  const isEmpty = sections.length === 0;
  // When empty, top-anchor the empty state at a fixed offset instead of pushing
  // it below the header, so it lands at a consistent screen position.
  const resolvedTopPadding =
    isEmpty && emptyStateTopPadding != null ? emptyStateTopPadding : headerPaddingTop;

  const renderSectionHeader = useCallback(
    ({ section }: { section: EventSection<TItem> }) => (
      <Text style={styles.sectionHeader}>{section.title}</Text>
    ),
    [],
  );

  const initialEntryIndices = useMemo(() => {
    const indices = new Map<string, number>();
    if (entryAnimation === 'initial') {
      for (const section of sections) {
        for (const item of section.data) {
          if (indices.size > motionTiming.staggerMaxSteps) return indices;
          indices.set(item.id, indices.size);
        }
      }
    }
    return indices;
  }, [entryAnimation, sections]);

  // Section mode preserves the existing per-date cascade. Initial mode bounds
  // animation work across date groups and appended pages.
  const renderItem = useCallback(
    ({ item, index }: SectionListRenderItemInfo<TItem, EventSection<TItem>>) => (
      <Placed
        id={item.id}
        index={
          entryAnimation === 'initial'
            ? (initialEntryIndices.get(item.id) ?? motionTiming.staggerMaxSteps + 1)
            : index
        }
        testID={`placed-${item.id}`}
      >
        <EventCardRow item={item} onPress={onEventPress} />
      </Placed>
    ),
    [entryAnimation, initialEntryIndices, onEventPress],
  );

  return (
    <SectionList<TItem, EventSection<TItem>>
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReached ? 0.5 : undefined}
      contentContainerStyle={[
        contentHorizontalPadding && styles.horizontalPadding,
        {
          paddingTop: resolvedTopPadding,
          paddingBottom: resolvedBottomPadding,
        },
        sections.length === 0 && styles.emptyList,
        contentContainerStyle,
      ]}
      SectionSeparatorComponent={({ leadingItem }) =>
        leadingItem ? <View style={styles.sectionSeparator} /> : null
      }
      ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
      ListFooterComponent={
        footer || shouldShowFooterSpacing ? (
          <View>
            {footer}
            {shouldShowFooterSpacing && (
              <View style={[styles.footerSpacing, { height: footerSpacingHeight }]} />
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={
        emptyState ? (
          <View style={[styles.emptyStateWrapper, emptyContentStyle]}>{emptyState}</View>
        ) : null
      }
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    />
  );
};

const styles = StyleSheet.create({
  horizontalPadding: {
    paddingHorizontal: spacing.md,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyStateWrapper: {
    flexGrow: 1,
    alignItems: 'center',
  },
  sectionHeader: {
    fontSize: 15,
    color: colors.cardMeta,
    marginTop: 0,
    marginBottom: spacing.sm + spacing.xs,
    fontFamily: typography.fontFamilyMedium,
    flexShrink: 1,
    lineHeight: typography.body + spacing.xs,
    letterSpacing: typography.detailLetterSpacing,
  },
  sectionSeparator: {
    height: componentTokens.eventList.sectionSeparatorHeight,
  },
  itemSeparator: {
    height: componentTokens.eventList.itemSeparatorHeight,
  },
  footerSpacing: {
    height: spacing.xl,
  },
});

export default memo(EventSectionList) as typeof EventSectionList;
