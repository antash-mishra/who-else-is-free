/**
 * SVG Mock component for Jest tests
 */

import React from 'react';
import { View, ViewProps } from 'react-native';

interface SvgMockProps extends ViewProps {
  width?: number | string;
  height?: number | string;
}

const SvgMock = ({ testID = 'svg-mock', ...props }: SvgMockProps) => {
  return <View testID={testID} {...props} />;
};

export default SvgMock;
