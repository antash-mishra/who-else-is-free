import {
  TabActions,
  NavigationAction,
  StackActions,
  StackRouter,
  TabRouter,
} from '@react-navigation/native';

import { completeEventCreation } from '../completeEventCreation';

it('selects My Plans underneath the form before popping, without duplicating Main', async () => {
  const stack = StackRouter({ initialRouteName: 'Main' });
  const tabs = TabRouter({ initialRouteName: 'Events' });
  const stackOptions = {
    routeNames: ['Main', 'CreateEvent'],
    routeParamList: {},
    routeGetIdList: {},
  };
  const tabOptions = {
    routeNames: ['Events', 'MyEvents'],
    routeParamList: {},
    routeGetIdList: {},
  };
  let tabState = tabs.getInitialState(tabOptions);
  let state = stack.getInitialState(stackOptions);
  const mainKey = state.routes[0].key;
  for (let i = 0; i < 5; i++) {
    state = stack.getRehydratedState(
      stack.getStateForAction(state, StackActions.push('CreateEvent'), stackOptions)!,
      stackOptions,
    );
    state = {
      ...state,
      routes: state.routes.map((route) =>
        route.name === 'Main' ? { ...route, state: tabState } : route,
      ),
    };
    const actions: string[] = [];
    const completion = completeEventCreation({
      getState: () => state,
      dispatch: (action: NavigationAction) => {
        actions.push(action.type);
        if (action.target === tabState.key) {
          expect(state.routes[state.index].name).toBe('CreateEvent');
          expect(tabs.shouldActionChangeFocus(action)).toBe(false);
          tabState = tabs.getRehydratedState(
            tabs.getStateForAction(
              tabState,
              action as ReturnType<typeof TabActions.jumpTo>,
              tabOptions,
            )!,
            tabOptions,
          );
        } else {
          expect(tabState.routes[tabState.index].name).toBe('MyEvents');
          state = stack.getRehydratedState(
            stack.getStateForAction(
              state,
              action as ReturnType<typeof StackActions.popTo>,
              stackOptions,
            )!,
            stackOptions,
          );
        }
      },
    });
    expect(actions).toEqual(['JUMP_TO']);
    jest.runAllTimers();
    await completion;
    expect(actions).toEqual(['JUMP_TO', 'POP_TO']);
    expect(tabState.routes[tabState.index].params).toEqual({ showEventCreatedBadge: true });
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0].key).toBe(mainKey);
  }
});

it('retains the nested destination when Main has not mounted its tabs yet', () => {
  const dispatch = jest.fn();
  completeEventCreation({ getState: () => undefined, dispatch });
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(dispatch).toHaveBeenCalledWith(
    StackActions.popTo('Main', {
      screen: 'MyEvents',
      params: { showEventCreatedBadge: true },
    }),
  );
});

it('uses hydrated root state when the stack snapshot omits child state', async () => {
  const tabs = TabRouter({ initialRouteName: 'Events' });
  const tabState = tabs.getInitialState({
    routeNames: ['Events', 'MyEvents'],
    routeParamList: {},
    routeGetIdList: {},
  });
  const stack = StackRouter({ initialRouteName: 'Main' });
  const state = stack.getInitialState({
    routeNames: ['Main', 'CreateEvent'],
    routeParamList: {},
    routeGetIdList: {},
  });
  const dispatch = jest.fn();
  const completion = completeEventCreation(
    { getState: () => state, dispatch },
    { ...state, routes: [{ ...state.routes[0], state: tabState }] },
  );
  expect(dispatch.mock.calls[0][0]).toEqual({
    ...TabActions.jumpTo('MyEvents', { showEventCreatedBadge: true }),
    target: tabState.key,
  });
  jest.runAllTimers();
  await completion;
});

it('does not pop another screen if the user leaves while the destination renders', async () => {
  const tabs = TabRouter({ initialRouteName: 'Events' });
  const tabState = tabs.getInitialState({
    routeNames: ['Events', 'MyEvents'],
    routeParamList: {},
    routeGetIdList: {},
  });
  const stack = StackRouter({ initialRouteName: 'Main' });
  const options = { routeNames: ['Main', 'CreateEvent'], routeParamList: {}, routeGetIdList: {} };
  let state = stack.getInitialState(options);
  const rootState = { ...state, routes: [{ ...state.routes[0], state: tabState }] };
  const dispatch = jest.fn();
  const completion = completeEventCreation({ getState: () => state, dispatch }, rootState);
  state = stack.getRehydratedState(
    stack.getStateForAction(state, StackActions.push('CreateEvent'), options)!,
    options,
  );
  jest.runAllTimers();
  await completion;
  expect(dispatch).toHaveBeenCalledTimes(1);
});
