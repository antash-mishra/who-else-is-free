import { View } from 'react-native';

import Svg, { Circle, G, Path } from 'react-native-svg';

import { useChat } from '@context/ChatContext';
import { colors } from '@theme/colors';

type TabIconProps = {
  focused: boolean;
  color: string;
};

export const TAB_ICON_WIDTH = 29;
export const TAB_ICON_HEIGHT = 29;

export const EventsTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;

  return (
    <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox="-1.5 -1.5 26 26" fill="none">
      <Path
        d="M11.1736 1.45571C11.7187 1.0456 12.466 1.04931 13.0085 1.46281C15.489 3.35338 22.3821 8.38046 22.5533 9.38231C23.4589 11.7647 23.1687 18.6122 20.7074 20.4582C19.4767 21.3811 4.70892 21.3811 3.47827 20.4582C1.01352 18.6122 0.705862 9.99763 1.62885 9.38231C2.00454 8.50621 8.69315 3.35338 11.1736 1.45571Z"
        fill={focused ? strokeColor : 'none'}
        stroke={strokeColor}
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12.0918 16.3047C13.8759 16.3047 15.3222 14.8583 15.3222 13.0742C15.3222 11.2901 13.8759 9.84375 12.0918 9.84375C10.3076 9.84375 8.86133 11.2901 8.86133 13.0742C8.86133 14.8583 10.3076 16.3047 12.0918 16.3047Z"
        fill={focused ? colors.background : 'none'}
        stroke={focused ? 'none' : strokeColor}
        strokeWidth={2.15}
      />
    </Svg>
  );
};

export const MyEventsTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;

  return (
    <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox="-1.5 -1.5 26 26" fill="none">
      <Path
        d="M12.1043 7.62467C13.8922 7.62467 15.3415 6.17535 15.3415 4.38753C15.3415 2.59971 13.8922 1.15039 12.1043 1.15039C10.3165 1.15039 8.86719 2.59971 8.86719 4.38753C8.86719 6.17535 10.3165 7.62467 12.1043 7.62467Z"
        fill={focused ? strokeColor : 'none'}
        stroke={strokeColor}
        strokeWidth={2.15}
      />
      <Path
        d="M4.70292 5.31152C7.94006 14.5605 16.2641 14.5605 19.5013 5.31152L22.7384 7.16132C24.4341 8.08621 18.8847 19.4933 15.8017 20.5723C13.9519 21.3431 10.2523 21.3431 8.40251 20.5723C5.31951 19.4933 -0.229868 8.08621 1.46578 7.16132L4.70292 5.31152Z"
        fill={focused ? strokeColor : 'none'}
        stroke={strokeColor}
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const CreateTabIcon = ({ focused: _focused, color }: TabIconProps) => {
  const strokeColor = color;

  return (
    <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox="-1.5 -1.5 26 26" fill="none">
      <Circle
        cx={11.1504}
        cy={11.1504}
        r={10}
        stroke={strokeColor}
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M11.1504 6.70605V15.5949"
        stroke={strokeColor}
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.70312 11.1514H15.592"
        stroke={strokeColor}
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const MessagesTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const { hasUnseenMessages } = useChat();

  return (
    <View style={{ width: TAB_ICON_WIDTH, height: TAB_ICON_HEIGHT }}>
      <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox="-1.5 -1.5 26 26" fill="none">
        <G transform="translate(1.2, 1.2)">
          <Path
            d="M10.2988 18.9727C15.5449 18.9727 19.7988 14.904 19.7988 9.88578C19.7988 4.86758 15.5449 0.798828 10.2988 0.798828C5.05272 0.798828 0.798828 4.86758 0.798828 9.88578C0.798828 12.2032 1.70555 14.3169 3.19811 15.9217C3.65411 16.4141 3.97922 17.0672 3.81666 17.7292C3.63866 18.453 3.30554 19.1253 2.84238 19.6953C3.21304 19.7648 3.58891 19.7994 3.96549 19.7988C5.31872 19.7988 6.57272 19.356 7.60188 18.6015C8.45688 18.8439 9.36255 18.9727 10.2988 18.9727Z"
            fill={focused ? strokeColor : 'none'}
            stroke={strokeColor}
            strokeWidth={2.15}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </Svg>
      {hasUnseenMessages && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 2,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: colors.tabBarUnreadDot,
            borderWidth: 2,
            borderColor: colors.background,
          }}
        />
      )}
    </View>
  );
};

export const ProfileTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;

  if (!focused) {
    return (
      <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox="-1.5 -1.5 26 26" fill="none">
        <Circle cx={11.5} cy={11.5} r={10.5} stroke={strokeColor} strokeWidth={2.15} />
        <Path
          d="M15.18 14.39C15.18 14.39 14.13 16.49 11.5 16.49C8.87 16.49 7.82 14.39 7.82 14.39"
          stroke={strokeColor}
          strokeWidth={2.15}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={14.13} cy={8.09} r={1.84} fill={strokeColor} />
        <Circle cx={8.87} cy={8.09} r={1.84} fill={strokeColor} />
      </Svg>
    );
  }

  return (
    <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox="-1.5 -1.5 26 26" fill="none">
      <Circle
        cx={11.5}
        cy={11.5}
        r={10.5}
        fill={strokeColor}
        stroke={strokeColor}
        strokeWidth={2.15}
      />
      <Path
        d="M15.18 14.39C15.18 14.39 14.13 16.49 11.5 16.49C8.87 16.49 7.82 14.39 7.82 14.39"
        stroke={colors.background}
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={14.13} cy={8.09} r={1.84} fill={colors.background} />
      <Circle cx={8.87} cy={8.09} r={1.84} fill={colors.background} />
    </Svg>
  );
};
