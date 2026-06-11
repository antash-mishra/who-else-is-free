import { logger } from '../logger';

describe('logger', () => {
  const originalDev = (globalThis as { __DEV__?: boolean }).__DEV__;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const setDev = (value: boolean) => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = value;
  };

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = originalDev;
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('forwards message and meta to console when __DEV__ is true', () => {
    setDev(true);
    const err = new Error('boom');

    logger.log('log message', 1);
    logger.warn('warn message', { detail: true });
    logger.error('error message', err);

    expect(logSpy).toHaveBeenCalledWith('log message', 1);
    expect(warnSpy).toHaveBeenCalledWith('warn message', { detail: true });
    expect(errorSpy).toHaveBeenCalledWith('error message', err);
  });

  it('does not forward to console when __DEV__ is false', () => {
    setDev(false);

    logger.log('log message');
    logger.warn('warn message');
    logger.error('error message');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
