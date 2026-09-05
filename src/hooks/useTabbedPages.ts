import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSharedValue, type SharedValue } from 'react-native-reanimated';

type TabbedPageOption = {
  label: string;
  value: string;
  count?: number;
};

export type TabbedPages<TOption extends TabbedPageOption> = {
  /** Currently selected tab value. */
  value: string;
  /** Index of the selected tab within `options`. */
  index: number;
  /** Spread onto `AnimatedPager`. */
  pagerProps: {
    selectedIndex: number;
    onPageChange: (index: number) => void;
    pageOffsetSV: SharedValue<number>;
  };
  /** Spread onto `SegmentedControl` (or any `AppTabs`). */
  tabsProps: {
    options: TOption[];
    value: string;
    onChange: (value: string) => void;
    pageOffsetSV: SharedValue<number>;
  };
};

/**
 * Wires a tab strip to a swipeable pager so the two stay in step and the tab
 * indicator tracks the swipe continuously.
 *
 * Returns prop bundles rather than loose values on purpose. Discover and My
 * Events already used the same two components, and the indicator still drifted
 * apart, because it is possible to hand the page offset to the pager and forget
 * the tabs. Spreading `pagerProps` and `tabsProps` makes the correct wiring the
 * only wiring.
 *
 * Selection is tracked by value, not index: Discover's options are dynamic —
 * "Nearest" only exists once location is granted — and an index quietly points
 * at the wrong tab when the list changes length. If the selected value ever
 * leaves `options`, the selection falls back to the first option.
 */
export const useTabbedPages = <TOption extends TabbedPageOption>(
  options: TOption[],
  initialValue: string,
): TabbedPages<TOption> => {
  const [value, setValue] = useState(initialValue);
  const pageOffsetSV = useSharedValue(0);

  const index = useMemo(() => {
    const found = options.findIndex((option) => option.value === value);
    return found >= 0 ? found : 0;
  }, [options, value]);

  const hasValue = useMemo(
    () => options.some((option) => option.value === value),
    [options, value],
  );

  useEffect(() => {
    if (hasValue || options.length === 0) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- The selected tab has left the options list and must fall back.
    setValue(options[0].value);
  }, [hasValue, options]);

  const onPageChange = useCallback(
    (nextIndex: number) => {
      const next = options[nextIndex];
      if (next) {
        setValue(next.value);
      }
    },
    [options],
  );

  const onChange = useCallback(
    (nextValue: string) => {
      if (options.some((option) => option.value === nextValue)) {
        setValue(nextValue);
      }
    },
    [options],
  );

  return {
    value,
    index,
    pagerProps: { selectedIndex: index, onPageChange, pageOffsetSV },
    tabsProps: { options, value, onChange, pageOffsetSV },
  };
};
