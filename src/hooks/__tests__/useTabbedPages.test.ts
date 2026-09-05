import { act, renderHook } from '@testing-library/react-native';

import { useTabbedPages } from '../useTabbedPages';

type Option = { label: string; value: string; count?: number };

const sortOptions: Option[] = [
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Nearest', value: 'nearest' },
  { label: 'Newest', value: 'newest' },
];

const withoutNearest: Option[] = [
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Newest', value: 'newest' },
];

describe('useTabbedPages', () => {
  it('starts on the initial value', () => {
    const { result } = renderHook(() => useTabbedPages(sortOptions, 'upcoming'));

    expect(result.current.value).toBe('upcoming');
    expect(result.current.index).toBe(0);
  });

  it('derives the index from the selected value', () => {
    const { result } = renderHook(() => useTabbedPages(sortOptions, 'newest'));

    expect(result.current.index).toBe(2);
  });

  it('follows the pager to a new page', () => {
    const { result } = renderHook(() => useTabbedPages(sortOptions, 'upcoming'));

    act(() => result.current.pagerProps.onPageChange(1));

    expect(result.current.value).toBe('nearest');
    expect(result.current.index).toBe(1);
  });

  it('follows a tab press to a new value', () => {
    const { result } = renderHook(() => useTabbedPages(sortOptions, 'upcoming'));

    act(() => result.current.tabsProps.onChange('newest'));

    expect(result.current.value).toBe('newest');
    expect(result.current.index).toBe(2);
  });

  it('hands the same page offset to both the pager and the tabs', () => {
    const { result } = renderHook(() => useTabbedPages(sortOptions, 'upcoming'));

    // Wiring one without the other is the bug this hook exists to prevent.
    expect(result.current.tabsProps.pageOffsetSV).toBe(result.current.pagerProps.pageOffsetSV);
    expect(result.current.tabsProps.pageOffsetSV).toBeDefined();
  });

  it('exposes the options to the tabs so they cannot disagree', () => {
    const { result } = renderHook(() => useTabbedPages(sortOptions, 'upcoming'));

    expect(result.current.tabsProps.options).toBe(sortOptions);
    expect(result.current.tabsProps.value).toBe('upcoming');
    expect(result.current.pagerProps.selectedIndex).toBe(0);
  });

  it('falls back to the first option when the selected one disappears', () => {
    // Discover drops "Nearest" when location permission goes away.
    const { result, rerender } = renderHook<
      ReturnType<typeof useTabbedPages<Option>>,
      { options: Option[] }
    >(({ options }) => useTabbedPages(options, 'upcoming'), {
      initialProps: { options: sortOptions },
    });

    act(() => result.current.tabsProps.onChange('nearest'));
    expect(result.current.value).toBe('nearest');

    rerender({ options: withoutNearest });

    expect(result.current.value).toBe('upcoming');
    expect(result.current.index).toBe(0);
  });

  it('keeps the selection when the options change but still contain it', () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof useTabbedPages<Option>>,
      { options: Option[] }
    >(({ options }) => useTabbedPages(options, 'upcoming'), {
      initialProps: { options: sortOptions },
    });

    act(() => result.current.tabsProps.onChange('newest'));
    rerender({ options: [...sortOptions] });

    expect(result.current.value).toBe('newest');
  });

  it('ignores a page index outside the options', () => {
    const { result } = renderHook(() => useTabbedPages(sortOptions, 'upcoming'));

    act(() => result.current.pagerProps.onPageChange(99));

    expect(result.current.value).toBe('upcoming');
  });
});
