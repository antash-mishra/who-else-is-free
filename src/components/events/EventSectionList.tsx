import { memo, ReactNode, useCallback } from 'react';

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
import ScalePressable from '@components/ScalePressable';
import { triggerHaptic } from '@services/haptics';
import { colors, componentTokens, spacing, typography } from '@theme/index';

import { EventSection } from './eventListSections';

export type EventSectionListProps<TItem extends EventItemProps = EventItemProps> = {
  sections: EventSection<TItem>[];
  onEventPress: (item: TItem) => void;
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
  headerPaddingTop = 0,
  bottomInset = 0,
  bottomPadding,
  footerSpacingHeight = spacing.xl,
  contentHorizontalPadding = true,
  contentContainerStyle,
  emptyContentStyle,
}: EventSectionListProps<TItem>) => {
  const resolvedBottomPadding = bottomPadding ?? spacing.xl + bottomInset;
  const shouldShowFooterSpacing = sections.length > 0 && footerSpacingHeight > 0;

  const renderSectionHeader = useCallback(
    ({ section }: { section: EventSection<TItem> }) => (
      <Text style={styles.sectionHeader}>{section.title}</Text>
    ),
    [],
  );

  const renderItem = useCallback(
    ({ item }: SectionListRenderItemInfo<TItem, EventSection<TItem>>) => (
      <EventCardRow item={item} onPress={onEventPress} />
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
          paddingTop: headerPaddingTop,
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
    justifyContent: 'center',
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
