/* global performance -- Provided by the React Native JS and Reanimated UI runtimes. */
/** Opt-in local release diagnostics; never include event/user content. */
export const transitionMetricsEnabled = process.env.EXPO_PUBLIC_TRANSITION_METRICS === 'true';
export const markTransition = (name: string, data: Record<string, number | string> = {}) => {
  if (!transitionMetricsEnabled) return;

  console.info(
    '[transition-metric] ' +
      JSON.stringify({ name, js_ms: performance.now(), wall_ms: Date.now(), ...data }),
  );
};
