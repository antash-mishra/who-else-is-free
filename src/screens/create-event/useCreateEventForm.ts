import { useCallback, useMemo, useReducer } from 'react';

import { CoverKey } from '@constants/covers';
import { GenderOption, GroupOption } from '@constants/eventOptions';
import type { UserEvent } from '@context/EventsContext';

import {
  CreateEventFormState,
  createEmptyFormState,
  createFormStateFromEvent,
  getFormLocationDisplayName,
} from './createEventForm';

export type CreateEventLocationSelection = {
  location: string;
  locationDisplayName: string;
  placeId: string;
  latitude: number | undefined;
  longitude: number | undefined;
};

type CreateEventFormReducerState = {
  form: CreateEventFormState;
  locationDisplayName: string;
  tempAgeRange: [number, number];
  tempGender: GenderOption;
  tempGroupType: GroupOption;
};

type CreateEventFormAction =
  | { type: 'setEventName'; value: string }
  | { type: 'setDescription'; value: string }
  | { type: 'setGroupType'; value: GroupOption }
  | { type: 'setGender'; value: GenderOption }
  | { type: 'setAgeRange'; value: [number, number] }
  | { type: 'setSelectedDateTime'; value: Date }
  | { type: 'setCoverKey'; value: CoverKey }
  | { type: 'selectLocation'; value: CreateEventLocationSelection }
  | { type: 'setTempAgeRange'; value: [number, number] }
  | { type: 'setTempGender'; value: GenderOption }
  | { type: 'setTempGroupType'; value: GroupOption }
  | { type: 'applyForm'; form: CreateEventFormState; locationDisplayName: string };

const normalizeFormState = (form: CreateEventFormState): CreateEventFormState => ({
  ...form,
  placeId: form.placeId ?? '',
});

const initReducerState = ({
  form,
  locationDisplayName,
}: {
  form: CreateEventFormState;
  locationDisplayName: string;
}): CreateEventFormReducerState => {
  const normalized = normalizeFormState(form);

  return {
    form: normalized,
    locationDisplayName,
    tempAgeRange: normalized.ageRange,
    tempGender: normalized.gender,
    tempGroupType: normalized.groupType,
  };
};

const reducer = (
  state: CreateEventFormReducerState,
  action: CreateEventFormAction,
): CreateEventFormReducerState => {
  switch (action.type) {
    case 'setEventName':
      return { ...state, form: { ...state.form, eventName: action.value } };
    case 'setDescription':
      return { ...state, form: { ...state.form, description: action.value } };
    case 'setGroupType':
      return { ...state, form: { ...state.form, groupType: action.value } };
    case 'setGender':
      return { ...state, form: { ...state.form, gender: action.value } };
    case 'setAgeRange':
      return { ...state, form: { ...state.form, ageRange: action.value } };
    case 'setSelectedDateTime':
      return { ...state, form: { ...state.form, selectedDateTime: action.value } };
    case 'setCoverKey':
      return { ...state, form: { ...state.form, coverKey: action.value } };
    case 'selectLocation':
      return {
        ...state,
        form: {
          ...state.form,
          location: action.value.location,
          placeId: action.value.placeId,
          latitude: action.value.latitude,
          longitude: action.value.longitude,
        },
        locationDisplayName: action.value.locationDisplayName,
      };
    case 'setTempAgeRange':
      return { ...state, tempAgeRange: action.value };
    case 'setTempGender':
      return { ...state, tempGender: action.value };
    case 'setTempGroupType':
      return { ...state, tempGroupType: action.value };
    case 'applyForm':
      return {
        ...state,
        form: normalizeFormState(action.form),
        locationDisplayName: action.locationDisplayName,
      };
    default:
      return state;
  }
};

/**
 * Reducer-backed Create/Edit Event form state built around `CreateEventFormState`.
 * Owns the form fields, the location display name, and the temporary picker
 * selections used while a sheet is open but not yet confirmed.
 */
export const useCreateEventForm = (
  initialFormState: CreateEventFormState,
  initialLocationDisplayName: string,
) => {
  const [state, dispatch] = useReducer(
    reducer,
    { form: initialFormState, locationDisplayName: initialLocationDisplayName },
    initReducerState,
  );

  const setEventName = useCallback(
    (value: string) => dispatch({ type: 'setEventName', value }),
    [],
  );
  const setDescription = useCallback(
    (value: string) => dispatch({ type: 'setDescription', value }),
    [],
  );
  const setGroupType = useCallback(
    (value: GroupOption) => dispatch({ type: 'setGroupType', value }),
    [],
  );
  const setGender = useCallback(
    (value: GenderOption) => dispatch({ type: 'setGender', value }),
    [],
  );
  const setAgeRange = useCallback(
    (value: [number, number]) => dispatch({ type: 'setAgeRange', value }),
    [],
  );
  const setSelectedDateTime = useCallback(
    (value: Date) => dispatch({ type: 'setSelectedDateTime', value }),
    [],
  );
  const setCoverKey = useCallback(
    (value: CoverKey) => dispatch({ type: 'setCoverKey', value }),
    [],
  );
  const selectLocation = useCallback(
    (value: CreateEventLocationSelection) => dispatch({ type: 'selectLocation', value }),
    [],
  );
  const setTempAgeRange = useCallback(
    (value: [number, number]) => dispatch({ type: 'setTempAgeRange', value }),
    [],
  );
  const setTempGender = useCallback(
    (value: GenderOption) => dispatch({ type: 'setTempGender', value }),
    [],
  );
  const setTempGroupType = useCallback(
    (value: GroupOption) => dispatch({ type: 'setTempGroupType', value }),
    [],
  );

  const applyFormState = useCallback((form: CreateEventFormState, displayLocationName = '') => {
    dispatch({ type: 'applyForm', form, locationDisplayName: displayLocationName });
  }, []);

  const resetForm = useCallback((coverKey?: CoverKey) => {
    applyFormState(createEmptyFormState(coverKey));
  }, [applyFormState]);

  const applyEventToForm = useCallback(
    (event: UserEvent) => {
      applyFormState(createFormStateFromEvent(event), getFormLocationDisplayName(event));
    },
    [applyFormState],
  );

  const getCurrentFormState = useCallback((): CreateEventFormState => state.form, [state.form]);

  return useMemo(
    () => ({
      form: state.form,
      locationDisplayName: state.locationDisplayName,
      tempAgeRange: state.tempAgeRange,
      tempGender: state.tempGender,
      tempGroupType: state.tempGroupType,
      setEventName,
      setDescription,
      setGroupType,
      setGender,
      setAgeRange,
      setSelectedDateTime,
      setCoverKey,
      selectLocation,
      setTempAgeRange,
      setTempGender,
      setTempGroupType,
      applyFormState,
      resetForm,
      applyEventToForm,
      getCurrentFormState,
    }),
    [
      applyEventToForm,
      applyFormState,
      getCurrentFormState,
      resetForm,
      selectLocation,
      setAgeRange,
      setCoverKey,
      setDescription,
      setEventName,
      setGender,
      setGroupType,
      setSelectedDateTime,
      setTempAgeRange,
      setTempGender,
      setTempGroupType,
      state.form,
      state.locationDisplayName,
      state.tempAgeRange,
      state.tempGender,
      state.tempGroupType,
    ],
  );
};

export default useCreateEventForm;
