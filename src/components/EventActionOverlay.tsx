import React, { useRef } from 'react';

import { TextInput } from 'react-native';

import BottomSheetModal from './BottomSheetModal';
import {
  ActionMenu,
  ActionMenuItem,
  ConfirmActionSheet,
  ConfirmActionSheetProps,
  IntroMessagePrompt,
  InvitePrompt,
  InvitePromptProps,
  ReportPrompt,
  ReportPromptProps,
  ResultPrompt,
  ResultPromptProps,
} from './EventActionOverlay.prompts';

type InviteOverlayProps = {
  type: 'invite';
} & InvitePromptProps;

type ConfirmOverlayProps = {
  type: 'confirm';
} & ConfirmActionSheetProps;

type ResultOverlayProps = {
  type: 'result';
} & ResultPromptProps;

type ReportOverlayProps = {
  type: 'report';
} & ReportPromptProps;

type MenuOverlayProps = {
  type: 'menu';
  items: ActionMenuItem[];
};

type ViewIntroOverlayProps = {
  type: 'viewIntro';
  introMessage: string;
  onDismiss: () => void;
};

type OverlayVariantProps =
  | InviteOverlayProps
  | ConfirmOverlayProps
  | ResultOverlayProps
  | ReportOverlayProps
  | MenuOverlayProps
  | ViewIntroOverlayProps;

type EventActionOverlayProps = {
  isVisible: boolean;
  onBackdropPress?: () => void;
  /** Fired once the sheet has finished closing and left the screen. */
  onClosed?: () => void;
} & OverlayVariantProps;

const renderOverlayContent = (
  props: OverlayVariantProps,
  inviteInputRef: React.RefObject<TextInput | null>,
) => {
  switch (props.type) {
    case 'invite':
      return <InvitePrompt {...props} inputRef={inviteInputRef} />;
    case 'confirm':
      return <ConfirmActionSheet {...props} />;
    case 'result':
      return <ResultPrompt {...props} />;
    case 'report':
      return <ReportPrompt {...props} />;
    case 'menu':
      return <ActionMenu items={props.items} />;
    case 'viewIntro':
      return <IntroMessagePrompt {...props} />;
    default:
      return null;
  }
};

const EventActionOverlay: React.FC<EventActionOverlayProps> = (props) => {
  const { isVisible, onBackdropPress, onClosed } = props;
  const shouldAvoidKeyboard = props.type === 'invite' || props.type === 'report';
  const inviteInputRef = useRef<TextInput>(null);
  // Request to join opens straight into the keyboard once the sheet settles, like the
  // Create Event Details editor, so the sheet rides the keyboard up in one motion (#190).
  const handleOpened = props.type === 'invite' ? () => inviteInputRef.current?.focus() : undefined;

  return (
    <BottomSheetModal
      visible={isVisible}
      onClose={onBackdropPress ?? (() => {})}
      avoidKeyboard={shouldAvoidKeyboard}
      onOpened={handleOpened}
      onClosed={onClosed}
    >
      {renderOverlayContent(props, inviteInputRef)}
    </BottomSheetModal>
  );
};

export default EventActionOverlay;
