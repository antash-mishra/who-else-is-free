import { API_BASE_URL } from '@api/config';
import {
  ApiCoverOption,
  GENERIC_COVER_CATEGORY,
  mapApiCoverCategory,
  mapApiCoverOption,
} from '@constants/covers';

describe('mapApiCoverOption', () => {
  it('maps a fully populated API option with category and tags', () => {
    const option: ApiCoverOption = {
      key: 'outdoor-nature-hiking-1',
      label: 'Hiking',
      file_name: 'outdoor-nature-hiking-1.png',
      url: 'https://cdn.example.com/covers/outdoor-nature-hiking-1.png',
      category: 'outdoor-nature',
      tags: ['Hiking', 'Walk', 'Mountains'],
    };

    expect(mapApiCoverOption(option)).toEqual({
      key: 'outdoor-nature-hiking-1',
      label: 'Hiking',
      fileName: 'outdoor-nature-hiking-1.png',
      url: 'https://cdn.example.com/covers/outdoor-nature-hiking-1.png',
      source: { uri: 'https://cdn.example.com/covers/outdoor-nature-hiking-1.png' },
      category: 'outdoor-nature',
      tags: ['Hiking', 'Walk', 'Mountains'],
    });
  });

  it('defaults a missing category to the generic category', () => {
    const mapped = mapApiCoverOption({ key: 'mystery-1', label: 'Mystery' });
    expect(mapped.category).toBe(GENERIC_COVER_CATEGORY);
  });

  it('defaults missing or malformed tags to an empty array', () => {
    expect(mapApiCoverOption({ key: 'a', label: 'A' }).tags).toEqual([]);
    expect(
      mapApiCoverOption({ key: 'a', label: 'A', tags: 'Party' as unknown as string[] }).tags,
    ).toEqual([]);
  });

  it('derives the file name from the key when file_name is missing', () => {
    const mapped = mapApiCoverOption({ key: 'generic-3', label: 'Generic' });
    expect(mapped.fileName).toBe('generic-3.png');
    expect(mapped.url).toBe(`${API_BASE_URL}/assets/covers/generic-3.png`);
    expect(mapped.source).toEqual({ uri: mapped.url });
  });

  it('prefixes relative URLs with the API base URL', () => {
    const mapped = mapApiCoverOption({
      key: 'sports-tennis-1',
      label: 'Tennis',
      url: '/assets/covers/sports-tennis-1.png',
      category: 'sports',
      tags: ['Tennis'],
    });
    expect(mapped.url).toBe(`${API_BASE_URL}/assets/covers/sports-tennis-1.png`);
  });
});

describe('mapApiCoverCategory', () => {
  it('maps and trims key and label', () => {
    expect(mapApiCoverCategory({ key: ' sports ', label: ' Sports ' })).toEqual({
      key: 'sports',
      label: 'Sports',
    });
  });

  it('returns null when the key is missing or blank', () => {
    expect(mapApiCoverCategory({ label: 'Sports' })).toBeNull();
    expect(mapApiCoverCategory({ key: '   ', label: 'Sports' })).toBeNull();
  });

  it('falls back to the key when the label is missing or blank', () => {
    expect(mapApiCoverCategory({ key: 'generic' })).toEqual({ key: 'generic', label: 'generic' });
    expect(mapApiCoverCategory({ key: 'generic', label: '  ' })).toEqual({
      key: 'generic',
      label: 'generic',
    });
  });
});
