import { memo } from 'react';

import { type SharedValue } from 'react-native-reanimated';

import { AppTabs } from '@components/ui';

export interface SegmentedOption {
  label: string;
  value: string;
  count?: number;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  /** Continuous page index from AnimatedPager, for a swipe-tracking indicator. */
  pageOffsetSV?: SharedValue<number>;
}

const SegmentedControl = ({ options, value, onChange, pageOffsetSV }: SegmentedControlProps) => (
  <AppTabs
    options={options}
    value={value}
    onChange={onChange}
    variant="pill"
    testIDPrefix="segment"
    pageOffsetSV={pageOffsetSV}
  />
);

export default memo(SegmentedControl);
