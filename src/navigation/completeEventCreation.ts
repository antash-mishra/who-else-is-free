import {
  TabActions,
  NavigationAction,
  NavigationState,
  StackActions,
} from '@react-navigation/native';

/** Select the destination behind the form before starting its downward dismissal. */
export async function completeEventCreation(
  navigation: {
    getState(): NavigationState | undefined;
    dispatch(action: NavigationAction): void;
  },
  rootState?: NavigationState,
) {
  // The stack's getState() can omit live child state; getRootState() hydrates it.
  const state = rootState ?? navigation.getState();
  const originKey = state?.routes[state.index]?.key;
  const main = state?.routes.find((route) => route.name === 'Main');
  if (main?.state?.key) {
    // NAVIGATE also focuses Main in the parent stack, dismissing the form early.
    // JUMP_TO updates the child tab without changing the parent stack focus.
    navigation.dispatch({
      ...TabActions.jumpTo('MyEvents', { showEventCreatedBadge: true }),
      target: main.state.key,
    });
    // Give the child selection a render opportunity before starting the native
    // card animation; batching both actions can reveal the previous tab.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const latest = navigation.getState();
    if (latest?.routes[latest.index]?.key !== originKey) return;
  }
  navigation.dispatch(
    StackActions.popTo('Main', {
      screen: 'MyEvents',
      params: { showEventCreatedBadge: true },
    }),
  );
}
