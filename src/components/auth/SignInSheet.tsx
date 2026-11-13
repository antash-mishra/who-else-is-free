import React from 'react';

import BottomSheetModal from '@components/BottomSheetModal';
import SignInButtons from '@components/SignInButtons';
import { useEmailSignInFlow } from '@hooks/useEmailSignInFlow';

type SignInSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSignInSuccess?: (profileComplete: boolean) => void;
};

/**
 * The sign-in sheet. It owns the email sign-in state and names each step as the
 * sheet's content, so moving from the provider buttons to "Continue with email" to
 * "Verify your email" uses the shared sheet morph (fade plus height glide) instead
 * of an instant swap. The state resets once the sheet has finished closing.
 */
const SignInSheet = ({ visible, onClose, onSignInSuccess }: SignInSheetProps) => {
  const flow = useEmailSignInFlow();

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      onClosed={flow.reset}
      contentKey={flow.view}
    >
      <SignInButtons flow={flow} onClose={onClose} onSignInSuccess={onSignInSuccess} />
    </BottomSheetModal>
  );
};

export default SignInSheet;
