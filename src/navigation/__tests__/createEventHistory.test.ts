import { StackActions, StackRouter } from '@react-navigation/routers';

describe('Create Event success history', () => {
  it('pops the submitted form and reuses Main across repeated creations', () => {
    const router = StackRouter({ initialRouteName: 'Main' });
    const options = {
      routeNames: ['Main', 'CreateEvent'],
      routeParamList: {},
      routeGetIdList: {},
    };
    let state = router.getInitialState(options);
    const mainKey = state.routes[0].key;
    for (let i = 0; i < 5; i++) {
      state = router.getRehydratedState(
        router.getStateForAction(state, StackActions.push('CreateEvent'), options)!,
        options,
      );
      state = router.getRehydratedState(
        router.getStateForAction(
          state,
          StackActions.popTo('Main', {
            screen: 'MyEvents',
            params: { showEventCreatedBadge: true },
          }),
          options,
        )!,
        options,
      );
      expect(state.routes).toHaveLength(1);
      expect(state.routes[0].key).toBe(mainKey);
      expect(state.routes[0].params).toEqual({
        screen: 'MyEvents',
        params: { showEventCreatedBadge: true },
      });
    }
  });
});
