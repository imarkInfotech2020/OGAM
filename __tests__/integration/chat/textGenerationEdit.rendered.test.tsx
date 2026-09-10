import {
  CHAT_TEXT_SCENARIOS,
  startChatScreen,
} from '../../harness/chatHarness';

describe.each(CHAT_TEXT_SCENARIOS)(
  'Mobile text generation edit journey on $label',
  scenario => {
    it('keeps a start-of-message edit through a keyboard render and resends it', async () => {
      const h = await startChatScreen(scenario);
      const view = h.view!;

      await h.send('Give me a short greeting.', {
        text: 'Hello from the first reply.',
      });
      await h.rtl.waitFor(() => {
        expect(view.getByText('Hello from the first reply.')).toBeVisible();
      });

      await h.openActionMenu('user', 'dots');
      h.rtl.fireEvent.press(view.getByTestId('action-edit'));
      const editInput = await h.rtl.waitFor(() =>
        view.getByPlaceholderText('Enter message...'),
      );

      const { Keyboard } =
        require('react-native') as typeof import('react-native');
      await h.rtl.act(async () => {
        const emitter = (
          Keyboard as unknown as {
            _emitter: { emit: (event: string, value: unknown) => void };
          }
        )._emitter;
        const event = { endCoordinates: { height: 320 } };
        emitter.emit('keyboardWillShow', event);
        emitter.emit('keyboardDidShow', event);
      });

      h.rtl.fireEvent(editInput, 'touchStart');
      h.rtl.fireEvent(editInput, 'selectionChange', {
        nativeEvent: { selection: { start: 0, end: 0 } },
      });
      h.rtl.fireEvent.changeText(editInput, 'Please give me a short greeting.');

      expect(view.getByPlaceholderText('Enter message...')).toHaveProp(
        'value',
        'Please give me a short greeting.',
      );

      h.scriptTextTurn({
        text: 'Hello from the edited reply.',
      });
      h.rtl.fireEvent.press(view.getByText('SAVE & RESEND'));

      await h.rtl.waitFor(() => {
        expect(
          h.rtl
            .within(view.getAllByTestId('user-message')[0])
            .getByText('Please give me a short greeting.'),
        ).toBeVisible();
        expect(view.getByText('Hello from the edited reply.')).toBeVisible();
        expect(
          h.rtl
            .within(view.getAllByTestId('user-message')[0])
            .queryByText('Give me a short greeting.'),
        ).toBeNull();
        expect(view.queryByText('Hello from the first reply.')).toBeNull();
        expect(view.queryByPlaceholderText('Enter message...')).toBeNull();
        expect(view.getByTestId('chat-input')).toBeEnabled();
      });
      expect(view.queryByText('Generation Error')).toBeNull();
    });
  },
);
