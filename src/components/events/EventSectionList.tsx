import { memo, ReactNode, useCallback, useMemo, useRef } from 'react';

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

import EventCard, { EventItemProps, eventCardTitleStyle } from '@components/EventCard';
import { Placed } from '@components/motion';
import ScalePressable from '@components/ScalePressable';
import { triggerHaptic } from '@services/haptics';
import { colors, componentTokens, spacing, typography } from '@theme/index';

import { EventSection } from './eventListSections';
import { useEventSharedTransition, useEventSharedTransitionState } from './EventSharedTransition';

export type EventSectionListProps<TItem extends EventItemProps = EventItemProps> = {
  sections: EventSection<TItem>[];
  onEventPress: (item: TItem, sharedCover?: boolean) => void;
  emptyState?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
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
  onPress: (item: TItem, sharedCover?: boolean) => void;
};

const EventCardRow = <TItem extends EventItemProps>({
  item,
  onPress,
}: EventCardRowProps<TItem>) => {
  const coverRef = useRef<View>(null);
  const titleRef = useRef<Text>(null);
  const { prime, open } = useEventSharedTransition();
  const { eventId: activeEventId, phase } = useEventSharedTransitionState();
  // The overlay carries this card's cover and title once airborne; hide the originals
  // so the elements move rather than duplicate.
  const sharedElementsHidden = activeEventId === item.id && phase === 'flying';
  const source = useMemo(
    () => ({
      imageUri: item.imageUri,
      title: item.title,
      titleStyle: eventCardTitleStyle,
      coverRef,
      titleRef,
    }),
    [item.imageUri, item.title],
  );
  return (
    <ScalePressable
      // Measure at press-in, before the press scale distorts the card.
      onPressIn={() => prime(item.id, source)}
      onPress={() => {
        triggerHaptic('light');
        open(item.id, source, (shared) => onPress(item, shared));
      }}
      delay={80}
    >
      <EventCard
        {...item}
        coverRef={coverRef}
        titleRef={titleRef}
        sharedElementsHidden={sharedElementsHidden}
      />
    </ScalePressable>
  );
};

const EventSectionList = <TItem extends EventItemProps>({
  sections,
  onEventPress,
  emptyState,
  refreshing = false,
  onRefresh,
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

  // Index is per-section on purpose: each date group cascades on its own,
  // which reads better than one continuous ramp down a long list.
  const renderItem = useCallback(
    ({ item, index }: SectionListRenderItemInfo<TItem, EventSection<TItem>>) => (
      <Placed id={item.id} index={index} testID={`placed-${item.id}`}>
        <EventCardRow item={item} onPress={onEventPress} />
      </Placed>
    ),
    [onEventPress],
  );

  return (
    <SectionList<TItem, EventSection<TItem>>
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
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
        shouldShowFooterSpacing ? (
          <View style={[styles.footerSpacing, { height: footerSpacingHeight }]} />
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
