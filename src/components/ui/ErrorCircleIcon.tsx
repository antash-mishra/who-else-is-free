import { memo } from 'react';

import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@theme/index';

export interface ErrorCircleIconProps {
  /** Rendered size in points. Defaults to the full-page load-failure size. */
  size?: number;
  /** Describes the specific failure, e.g. "Unable to load plans". */
  accessibilityLabel: string;
}

/**
 * Circle-exclamation mark shown above a full-page load failure.
 *
 * Drawn rather than imported: `assets/ui/error.svg` hardcodes the pale Create
 * Event stroke and so cannot follow `colors.error`. Keeping it here means the
 * mark tracks the error token everywhere it appears.
 */
const ErrorCircleIcon = ({ size = 24, accessibilityLabel }: ErrorCircleIconProps) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 38 38"
    accessible
    accessibilityRole="image"
    accessibilityLabel={accessibilityLabel}
  >
    <Circle cx="19" cy="19" r="16" stroke={colors.error} strokeWidth="3" fill="none" />
    <Path d="M19 10.5v10" stroke={colors.error} strokeWidth="3" strokeLinecap="round" />
    <Circle cx="19" cy="27" r="1.7" fill={colors.error} />
  </Svg>
);

export default memo(ErrorCircleIcon);
