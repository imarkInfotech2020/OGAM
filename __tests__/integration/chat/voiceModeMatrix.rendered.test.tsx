import {
  CHAT_VOICE_SCENARIOS,
  startChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_VOICE_SCENARIOS)(
  'Mobile voice chat journey on $label',
  scenario => {
    it('transcribes speech, sends it, and shows a playable spoken response', async () => {
      const h = await startChatScreen(scenario);

      await h.voiceSend('Tell me about Off Grid.', {
        text: 'Off Grid keeps your work private.',
      });

      await h.rtl.waitFor(
        () => {
          expect(h.assertions.isVoicePlaybackControlVisible()).toBe(true);
        },
        { timeout: 5000 },
      );
      expect(
        await h.assertions.isVoiceTranscriptClickable(
          'Off Grid keeps your work private.',
        ),
      ).toBe(true);
    });
  },
);
