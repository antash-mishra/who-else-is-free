import type { ProcessedColorValue, ViewProps } from 'react-native';

export interface NativeToastBlurProps extends ViewProps {
  blurSigmaDp: number;
  materialColor: ProcessedColorValue;
}
