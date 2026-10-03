import React from 'react';

import { View } from 'react-native';

import type { NativeToastBlurProps } from './NativeToastBlur.types';

// Metro selects the Android native implementation. This host is only used on
// other platforms and by Jest; ActionToastSurface uses FrostedSurface on iOS.
const NativeToastBlur = (props: NativeToastBlurProps) => <View {...props} />;

export default NativeToastBlur;
