import { Platform, StyleSheet, type ImageStyle } from 'react-native';

const loadCoverStyle = (os: 'android' | 'ios') => {
  jest.doMock('react-native', () => ({
    StyleSheet,
    Platform: {
      ...Platform,
      OS: os,
      select: (styles: Record<string, unknown>) => styles[os] ?? styles.default,
    },
  }));
  let imageCard: ImageStyle = {};
  jest.isolateModules(() => {
    imageCard = require('../EventDetailsScreen.styles').default.imageCard;
  });
  jest.dontMock('react-native');
  return StyleSheet.flatten(imageCard);
};

describe('Plan Details cover shadow', () => {
  it('has no elevation or shadow on Android', () => {
    const style = loadCoverStyle('android');
    expect(style).not.toHaveProperty('elevation');
    expect(style).not.toHaveProperty('shadowColor');
    expect(style).not.toHaveProperty('shadowOpacity');
    expect(style).not.toHaveProperty('shadowOffset');
    expect(style).not.toHaveProperty('shadowRadius');
    expect(style).not.toHaveProperty('boxShadow');
  });

  it('preserves the existing iOS shadow', () => {
    expect(loadCoverStyle('ios')).toMatchObject({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
    });
  });
});
