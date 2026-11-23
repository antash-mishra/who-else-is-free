import { memo } from 'react';

import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

import { colors } from '@theme/index';

interface LocationMapIllustrationProps {
  size?: number;
}

// A close-up street map on a 120×120 tile: water in one corner, two parks and
// a handful of streets crossing at the "you are here" dot.
const WATER_PATH = 'M0 0 H34 C30 14 22 22 10 30 C6 33 2 36 0 38 Z';
const PARK_PATHS = ['M70 6 H104 L112 30 L84 38 L72 24 Z', 'M6 76 L30 70 L36 94 L12 104 Z'];
const MAIN_STREET_PATHS = ['M-6 60 L126 34', 'M40 -6 L82 126'];
const SIDE_STREET_PATHS = ['M-6 100 L126 74', 'M12 -6 L46 126', 'M78 -6 L112 126'];
const LANE_PATH = 'M-6 22 L126 -4';

const DOT_X = 60;
const DOT_Y = 60;

/**
 * A small map tile with a "you are here" dot, shown above the location
 * permission sheet's title. Drawn in SVG so it stays crisp at any size and its
 * colours come from the theme (`colors.locationMap*`).
 */
const LocationMapIllustration = ({ size = 120 }: LocationMapIllustrationProps) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
  >
    <Defs>
      <ClipPath id="locationMapTile">
        <Rect x="0" y="0" width="120" height="120" rx="15" />
      </ClipPath>
    </Defs>
    <G clipPath="url(#locationMapTile)">
      <Rect x="0" y="0" width="120" height="120" fill={colors.locationMapLand} />
      <Path d={WATER_PATH} fill={colors.locationMapWater} />
      {PARK_PATHS.map((d) => (
        <Path key={d} d={d} fill={colors.locationMapPark} />
      ))}
      <G stroke={colors.locationMapRoad} strokeLinecap="round" fill="none">
        {MAIN_STREET_PATHS.map((d) => (
          <Path key={d} d={d} strokeWidth="7" />
        ))}
        {SIDE_STREET_PATHS.map((d) => (
          <Path key={d} d={d} strokeWidth="4" />
        ))}
        <Path d={LANE_PATH} strokeWidth="3" />
      </G>
      {/* You are here. */}
      <Circle cx={DOT_X} cy={DOT_Y} r="22" fill={colors.locationDotHalo} />
      <Circle cx={DOT_X} cy={DOT_Y} r="11" fill={colors.background} />
      <Circle cx={DOT_X} cy={DOT_Y} r="8" fill={colors.unreadIndicator} />
    </G>
    {/* Hairline frame, inset half a unit so the 1px stroke stays inside the tile. */}
    <Rect
      x="0.5"
      y="0.5"
      width="119"
      height="119"
      rx="14.5"
      fill="none"
      stroke={colors.locationMapFrame}
      strokeWidth="1"
    />
  </Svg>
);

export default memo(LocationMapIllustration);
