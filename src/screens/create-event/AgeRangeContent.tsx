import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { View } from 'react-native';

import RangeSlider from 'react-native-fast-range-slider';
import { useReducedMotion } from 'react-native-reanimated';

import { AppButton, AppText } from '@components/ui';
import { AGE_MIN, PLAN_AGE_MIN_GAP, PLAN_AGE_SLIDER_MAX } from '@constants/eventOptions';
import { triggerHaptic } from '@services/haptics';
import { colors, componentTokens, radii, shadows } from '@theme/index';
import { getAgeGroupsLabel } from '@utils/ageGroups';
import {
  ageSelectionNeedsReplacement,
  formatAgeSliderValue,
  fromAgeSliderRange,
  getAgePickerDraft,
  isValidPlanAgeRange,
  PlanAgeRange,
  toAgeSliderRange,
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

  const updateDraft = (sliderValue: PlanAgeRange) => {
    const value = fromAgeSliderRange(sliderValue);
    if (!visibleRef.current || !isValidPlanAgeRange(value)) return;
    // The slider reports on every gesture frame; tick only when an age changes,
    // like a picker wheel, rather than buzzing for the whole drag.
    if (value[0] !== draft[0] || value[1] !== draft[1]) triggerHaptic('selection');
    setDraft(value);
    setReplacing(true);
  };

  const sliderWidth = width - componentTokens.ageRange.thumbSize;
  const initialSliderRange = toAgeSliderRange(initial);
  // The slider draws each thumb's centre at thumbSize / 2 + its fraction of the
  // travel; the labels above the thumbs follow the same math.
  const thumbCenter = (value: number) =>
    componentTokens.ageRange.thumbSize / 2 +
    ((value - AGE_MIN) / (PLAN_AGE_SLIDER_MAX - AGE_MIN)) * sliderWidth;

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
      <View
        testID="age-range-layout"
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
        style={styles.slider}
      >
        {sliderWidth > 0 && (
          <>
            {/* Above, not on, the thumbs: a finger covers the thumb while dragging. */}
            <View style={styles.thumbLabels} pointerEvents="none">
              {toAgeSliderRange(draft).map((value, index) => (
                <AppText
                  key={index === 0 ? 'min' : 'max'}
                  testID={index === 0 ? 'age-range-min-label' : 'age-range-max-label'}
                  style={[
                    styles.thumbLabel,
                    { left: thumbCenter(value) - componentTokens.ageRange.labelWidth / 2 },
                  ]}
                >
                  {formatAgeSliderValue(value)}
                </AppText>
              ))}
            </View>
            <RangeSlider
              key={`${initialSliderRange[0]}:${initialSliderRange[1]}:${width}`}
              min={AGE_MIN}
              max={PLAN_AGE_SLIDER_MAX}
              step={1}
              initialMinValue={initialSliderRange[0]}
              initialMaxValue={initialSliderRange[1]}
              width={sliderWidth}
              minimumDistance={(sliderWidth * PLAN_AGE_MIN_GAP) / (PLAN_AGE_SLIDER_MAX - AGE_MIN)}
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
          </>
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
