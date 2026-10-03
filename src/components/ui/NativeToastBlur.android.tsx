import { requireNativeViewManager } from 'expo-modules-core';

import type { NativeToastBlurProps } from './NativeToastBlur.types';

export default requireNativeViewManager<NativeToastBlurProps>('ToastBlur');
