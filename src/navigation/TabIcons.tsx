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
    <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox="-0.67 -1.67 26 26" fill="none">
      <Path
        d="M12.3344 1.15039C11.4537 1.15039 10.9176 1.45673 10.3432 1.83966C8.84974 2.87357 4.29288 6.39652 2.41653 8.15799C1.57409 8.96214 1.15287 10.0343 1.15287 11.1065C1.11457 13.2509 1.45921 15.9315 2.18677 18.4588C2.72288 20.2203 3.48873 21.0627 5.36509 21.2925C6.04249 21.3771 9.10745 21.4851 12.3344 21.5004C15.5613 21.4851 18.6263 21.3771 19.3037 21.2925C21.1801 21.0627 21.9459 20.2203 22.482 18.4588C23.2096 15.9315 23.5542 13.2509 23.5159 11.1065C23.5159 10.0343 23.0947 8.96214 22.2523 8.15799C20.3759 6.39652 15.8191 2.87357 14.3256 1.83966C13.7512 1.45673 13.2151 1.15039 12.3344 1.15039Z"
        fill={focused ? strokeColor : 'none'}
        stroke={strokeColor}
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12.3344 16.5434C14.1532 16.5434 15.6276 15.069 15.6276 13.2502C15.6276 11.4314 14.1532 9.95703 12.3344 9.95703C10.5156 9.95703 9.0412 11.4314 9.0412 13.2502C9.0412 15.069 10.5156 16.5434 12.3344 16.5434Z"
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
