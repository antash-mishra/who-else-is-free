import React from 'react';

import BottomSheetModal from './BottomSheetModal';
import {
  ActionMenu,
  ActionMenuItem,
  ConfirmActionSheet,
  ConfirmActionSheetProps,
  IntroMessagePrompt,
  InvitePrompt,
  InvitePromptProps,
  ManageEventMenu,
  ManageEventMenuProps,
  PendingRequestMenu,
  PendingRequestMenuProps,
  ReportPrompt,
  ReportPromptProps,
  ResultPrompt,
  ResultPromptProps,
} from './EventActionOverlay.prompts';

type InviteOverlayProps = {
  type: 'invite';
} & InvitePromptProps;

type ManageOverlayProps = {
  type: 'manage';
} & ManageEventMenuProps;

type ConfirmOverlayProps = {
  type: 'confirm';
} & ConfirmActionSheetProps;

type ResultOverlayProps = {
  type: 'result';
} & ResultPromptProps;

type PendingRequestOverlayProps = {
  type: 'pendingRequest';
} & PendingRequestMenuProps;

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
  | ManageOverlayProps
  | ConfirmOverlayProps
  | ResultOverlayProps
  | PendingRequestOverlayProps
  | ReportOverlayProps
  | MenuOverlayProps
  | ViewIntroOverlayProps;

type EventActionOverlayProps = {
  isVisible: boolean;
  onBackdropPress?: () => void;
} & OverlayVariantProps;

const renderOverlayContent = (props: OverlayVariantProps) => {
  switch (props.type) {
    case 'invite':
      return <InvitePrompt {...props} />;
    case 'manage':
      return <ManageEventMenu {...props} />;
    case 'confirm':
      return <ConfirmActionSheet {...props} />;
    case 'result':
      return <ResultPrompt {...props} />;
    case 'pendingRequest':
      return <PendingRequestMenu {...props} />;
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
  const { isVisible, onBackdropPress } = props;
  const shouldAvoidKeyboard = props.type === 'invite' || props.type === 'report';

  return (
    <BottomSheetModal
      visible={isVisible}
      onClose={onBackdropPress ?? (() => {})}
      avoidKeyboard={shouldAvoidKeyboard}
    >
      {renderOverlayContent(props)}
    </BottomSheetModal>
  );
};

export default EventActionOverlay;
