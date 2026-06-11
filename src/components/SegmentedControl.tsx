import { memo } from 'react';

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
}

const SegmentedControl = ({ options, value, onChange }: SegmentedControlProps) => (
  <AppTabs
    options={options}
    value={value}
    onChange={onChange}
    variant="pill"
    testIDPrefix="segment"
  />
);

export default memo(SegmentedControl);
