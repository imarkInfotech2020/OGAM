import {
  CHAT_DOCUMENT_ATTACHMENT_SCENARIOS,
  CHAT_PHOTO_ATTACHMENT_SCENARIOS,
  startChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_PHOTO_ATTACHMENT_SCENARIOS)(
  'Mobile photo attachment journey on $label',
  scenario => {
    it('shows the selected photo in the real Chat composer', async () => {
      const h = await startChatScreen(scenario);

      expect(h.view!.getByTestId('attachments-container')).toBeVisible();
      expect(h.view!.getByTestId(/^attachment-image-/)).toBeVisible();
    });
  },
);

describe.each(CHAT_DOCUMENT_ATTACHMENT_SCENARIOS)(
  'Mobile document attachment journey on $label',
  scenario => {
    it('shows the selected document in the real Chat composer', async () => {
      const h = await startChatScreen(scenario);

      expect(h.view!.getByTestId('attachments-container')).toBeVisible();
      expect(h.view!.getByTestId(/^document-preview-/)).toBeVisible();
      expect(h.view!.getByText('document.txt')).toBeVisible();
    });
  },
);
