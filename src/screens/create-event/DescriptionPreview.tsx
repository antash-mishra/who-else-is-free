import React, { useCallback, useState } from 'react';

import { NativeSyntheticEvent, StyleSheet, Text, TextLayoutEventData, View } from 'react-native';

import { triggerHaptic } from '@services/haptics';
import { colors, typography } from '@theme/index';

import styles from '../CreateEventScreen.styles';

type Truncation = { firstLine: string; rest: string };

type DescriptionPreviewProps = {
  description: string;
};

/**
 * Read-only description preview for the Create/Edit form. Collapsed to two lines
 * with "See more" pinned to the extreme right of line 2 (a flex row: the wrapped
 * remainder ellipsizes to fill, "See more" sits last). Tapping "See more" toggles
 * inline expand/collapse; the nested Text consumes that touch so the row's press
 * (open editor) does not fire. Tapping the rest of the row opens the editor.
 */
const DescriptionPreview = ({ description }: DescriptionPreviewProps) => {
  const [truncation, setTruncation] = useState<Truncation | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleTextLayout = useCallback((event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const { lines } = event.nativeEvent;
    if (lines.length > 2) {
      setTruncation({
        firstLine: lines[0].text,
        rest: lines
          .slice(1)
          .map((line) => line.text)
          .join(''),
      });
    } else {
      setTruncation(null);
    }
  }, []);

  const toggleExpanded = useCallback(() => {
    triggerHaptic('light');
    setExpanded((prev) => !prev);
  }, []);

  if (!description) {
    return (
      <Text style={[styles.descriptionValue, styles.descriptionPlaceholder]}>Add Description</Text>
    );
  }

  return (
    <View style={previewStyles.root}>
      {/* Hidden full render to measure wrapped lines. In-flow (height 0, clipped)
          so it wraps at the SAME width as the visible text. */}
      <View style={previewStyles.measure} pointerEvents="none">
        <Text style={styles.descriptionValue} onTextLayout={handleTextLayout}>
          {description}
        </Text>
      </View>

      {expanded ? (
        <Text style={styles.descriptionValue}>
          {description}
          {'  '}
          <Text style={previewStyles.seeMore} onPress={toggleExpanded}>
            See less
          </Text>
        </Text>
      ) : truncation ? (
        <>
          <Text style={styles.descriptionValue} numberOfLines={1}>
            {truncation.firstLine}
          </Text>
          <View style={previewStyles.secondLine}>
            <Text
              style={[styles.descriptionValue, previewStyles.secondLineText]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {truncation.rest}
            </Text>
            <Text
              style={[previewStyles.seeMore, previewStyles.seeMoreGap]}
              onPress={toggleExpanded}
            >
              See more
            </Text>
          </View>
        </>
      ) : (
        <Text style={styles.descriptionValue} numberOfLines={2}>
          {description}
        </Text>
      )}
    </View>
  );
};

const previewStyles = StyleSheet.create({
  root: {
    alignSelf: 'stretch', // full row width so the measure matches the visible text
  },
  measure: {
    height: 0,
    overflow: 'hidden',
  },
  secondLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  secondLineText: {
    flex: 1, // fill the line so "See more" is pinned to the far right
  },
  seeMore: {
    fontSize: 15, // slightly smaller than the 16 description body
    fontFamily: typography.fontFamilyMedium,
    color: colors.selectedTextOnDark, // solid white — reads as actionable vs the faint labels
  },
  // Small controlled gap after the "…" (replaces the wider space character).
  seeMoreGap: {
    marginLeft: 2,
  },
});

export default DescriptionPreview;
