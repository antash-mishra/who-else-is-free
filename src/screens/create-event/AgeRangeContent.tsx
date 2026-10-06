import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { View } from 'react-native';

import RangeSlider from 'react-native-fast-range-slider';
import { useReducedMotion } from 'react-native-reanimated';

import { AppButton, AppText } from '@components/ui';
import { AGE_MIN, PLAN_AGE_MAX, PLAN_AGE_MIN_GAP } from '@constants/eventOptions';
import { colors, componentTokens, radii, shadows } from '@theme/index';
import { getAgeGroupsLabel } from '@utils/ageGroups';
import { formatRangeAgeLabel } from '@utils/eventDisplay';
import {
  ageSelectionNeedsReplacement,
  getAgePickerDraft,
  isValidPlanAgeRange,
  PlanAgeRange,
} from '@utils/planAgeRange';

import styles from './AgeRangeContent.styles';

interface AgeRangeContentProps {
  visible: boolean;
  range: PlanAgeRange;
  mode?: 'range';
  ids?: string[];
  onConfirm: (range: PlanAgeRange) => void;
}

export default function AgeRangeContent({
  visible,
  range,
  mode,
  ids,
  onConfirm,
}: AgeRangeContentProps) {
  const visibleRef = useRef(visible);
  useLayoutEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState<PlanAgeRange>(() => getAgePickerDraft(range, mode, ids));
  const [initial, setInitial] = useState<PlanAgeRange>(draft);
  const [width, setWidth] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const needsReplacement = mode !== 'range' && ageSelectionNeedsReplacement(range, ids);

  useEffect(() => {
    if (!visible) return;
    const next = getAgePickerDraft(range, mode, ids);
    // Explicit sheet-session reset discards unconfirmed values on reopen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(next);
    setInitial(next);
    setReplacing(false);
  }, [visible, range, mode, ids]);

  const updateDraft = (value: PlanAgeRange) => {
    if (!visibleRef.current || !isValidPlanAgeRange(value)) return;
    setDraft(value);
    setReplacing(true);
  };

  return (
    <View style={styles.content}>
      {needsReplacement && (
        <View style={styles.legacyNotice}>
          <AppText>Current selection: {getAgeGroupsLabel(ids, range)}</AppText>
          <AppText>
            Applying a range replaces this selection. Move a handle to choose a new range.
          </AppText>
        </View>
      )}
      <View style={styles.labelRow}>
        <AppText style={styles.label}>Age range</AppText>
        <AppText style={styles.label} testID="age-range-value">
          {formatRangeAgeLabel(draft)}
        </AppText>
      </View>
      <View
        testID="age-range-layout"
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
        style={styles.slider}
      >
        {width > componentTokens.ageRange.thumbSize && (
          <RangeSlider
            key={`${initial[0]}:${initial[1]}:${width}`}
            min={AGE_MIN}
            max={PLAN_AGE_MAX}
            step={1}
            initialMinValue={initial[0]}
            initialMaxValue={initial[1]}
            width={width - componentTokens.ageRange.thumbSize}
            minimumDistance={
              ((width - componentTokens.ageRange.thumbSize) * PLAN_AGE_MIN_GAP) /
              (PLAN_AGE_MAX - AGE_MIN)
            }
            thumbSize={componentTokens.ageRange.thumbSize}
            trackHeight={componentTokens.ageRange.trackHeight}
            showThumbLines={false}
            allowOverlap={false}
            enabled={visible}
            selectedTrackStyle={{ backgroundColor: colors.text, borderRadius: radii.pill }}
            unselectedTrackStyle={{ backgroundColor: colors.border, borderRadius: radii.pill }}
            thumbStyle={{ ...shadows.ageRangeThumb, backgroundColor: colors.background }}
            pressedThumbStyle={reducedMotion ? undefined : { opacity: 0.9 }}
            onValuesChange={updateDraft}
            onValuesChangeFinish={updateDraft}
            leftThumbAccessibilityLabel="Minimum age"
            rightThumbAccessibilityLabel="Maximum age"
            testID="age-range-slider"
          />
        )}
      </View>
      <AppButton
        label="Done"
        fullWidth
        onPress={() => onConfirm(draft)}
        disabled={!isValidPlanAgeRange(draft) || (needsReplacement && !replacing)}
        style={styles.done}
        testID="age-range-done"
      />
    </View>
  );
}
