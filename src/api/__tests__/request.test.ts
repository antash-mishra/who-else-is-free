import { createRequestTimeout, isAbortError } from '@api/request';

describe('request api helpers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aborts the timeout signal after the requested delay', () => {
    const timeout = createRequestTimeout(1000);

    expect(timeout.signal.aborted).toBe(false);

    jest.advanceTimersByTime(999);
    expect(timeout.signal.aborted).toBe(false);

    jest.advanceTimersByTime(1);
    expect(timeout.signal.aborted).toBe(true);
  });

  it('clears the pending abort when requested', () => {
    const timeout = createRequestTimeout(1000);

    timeout.clear();
    jest.advanceTimersByTime(1000);

    expect(timeout.signal.aborted).toBe(false);
  });

  it('identifies abort errors without matching arbitrary errors', () => {
    const abortError = new Error('The request was aborted');
    abortError.name = 'AbortError';

    expect(isAbortError(abortError)).toBe(true);
    expect(isAbortError(new Error('Network error'))).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});
