const DEV_LOGIN_ENV_KEY = 'EXPO_PUBLIC_DEV_LOGIN_ENABLED';

type DevGlobal = typeof globalThis & { __DEV__: boolean };

// featureFlags reads __DEV__ and the environment when it is first evaluated, so every case
// loads a fresh copy of the module and restores both afterwards.
const loadDevLoginEnabled = (isDevBuild: boolean, envValue: string | undefined): unknown => {
  const devGlobal = globalThis as DevGlobal;
  const previousDev = devGlobal.__DEV__;
  const previousEnv = process.env[DEV_LOGIN_ENV_KEY];
  devGlobal.__DEV__ = isDevBuild;
  if (envValue === undefined) {
    delete process.env[DEV_LOGIN_ENV_KEY];
  } else {
    process.env[DEV_LOGIN_ENV_KEY] = envValue;
  }

  try {
    let enabled: unknown;
    jest.isolateModules(() => {
      enabled = require('../featureFlags').DEV_LOGIN_ENABLED;
    });
    return enabled;
  } finally {
    devGlobal.__DEV__ = previousDev;
    if (previousEnv === undefined) {
      delete process.env[DEV_LOGIN_ENV_KEY];
    } else {
      process.env[DEV_LOGIN_ENV_KEY] = previousEnv;
    }
  }
};

describe('DEV_LOGIN_ENABLED', () => {
  it.each([
    { build: 'dev', isDevBuild: true, envValue: undefined, expected: false },
    { build: 'dev', isDevBuild: true, envValue: 'false', expected: false },
    { build: 'dev', isDevBuild: true, envValue: 'true', expected: true },
    { build: 'release', isDevBuild: false, envValue: 'true', expected: false },
  ])(
    'is $expected in a $build build when EXPO_PUBLIC_DEV_LOGIN_ENABLED is $envValue',
    ({ isDevBuild, envValue, expected }) => {
      expect(loadDevLoginEnabled(isDevBuild, envValue)).toBe(expected);
    },
  );
});
