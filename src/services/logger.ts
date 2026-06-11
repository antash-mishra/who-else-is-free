const isDev = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

export const logger = {
  log: (message?: unknown, ...meta: unknown[]): void => {
    if (isDev()) {
      console.log(message, ...meta);
    }
  },
  warn: (message?: unknown, ...meta: unknown[]): void => {
    if (isDev()) {
      console.warn(message, ...meta);
    }
  },
  error: (message?: unknown, ...meta: unknown[]): void => {
    if (isDev()) {
      console.error(message, ...meta);
    }
  },
};
