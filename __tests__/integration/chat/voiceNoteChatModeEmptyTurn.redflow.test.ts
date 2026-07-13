/**
 * Q20: a direct-audio model in CHAT (text-interface) mode records a standalone voice note. SPEC: the note
 * must carry the TRANSCRIBED text (never a content==='' turn to the model) — the same "always send a
 * transcript, never raw audio" rule the audio-mode path obeys.
 *
 * The REAL useVoiceInput hook + REAL audioRecorderService + REAL activeModelService + REAL whisperService +
 * REAL stores run; only the device leaves are faked (react-native-audio-api recorder, whisper.rn, the
 * in-memory fs, the litert native module). supportsDirectAudio() is true (audio-capable model + recorder)
 * and interfaceMode is 'text', so stopRecording takes Voice.ts's chat-mode else branch — which now
 * transcribes the recorded FILE (ensureWhisper → transcribeFile), gates via resolveTranscription, and
 * attaches { uri, format, durationSeconds, transcription }. The assertion is fix-shape-agnostic: it holds
 * as long as the transcript reaches EITHER dispatch path (onAutoSend text arg, or the attachment's
 * `transcription`). Regressing the else-branch to drop the transcript makes it RED.
 */
import { installNativeBoundary } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';

describe('Q20 — chat-mode direct-audio voice note dispatches an empty-content turn (red-flow)', () => {
  it('carries the transcribed text into the dispatched note instead of empty content', async () => {
    // fs + whisper boundaries installed: the chat-mode voice note transcribes the recorded FILE via the
    // REAL whisperService.loadModel → transcribeFile path, so whisper must be genuinely loadable. That means
    // the model file has to exist on the (in-memory) disk — the one legitimate device leaf we place. Setting
    // downloadedModelId alone (with no file) makes whisperService.loadModel throw "not found" → whisper never
    // becomes resident → nothing to transcribe: a fabricated precondition that never exercises the real path.
    const boundary = installNativeBoundary({ fs: true, whisper: true, ram: { platform: 'ios', totalBytes: 12 * 1024 ** 3, availBytes: 8 * 1024 ** 3 } });
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { renderHook, act } = require('../../harness/nativeBoundary').requireRTL();
    const RNFS = require('react-native-fs');
    const { liteRTService } = require('../../../src/services/litert');
    const { useVoiceInput } = require('../../../src/components/ChatInput/Voice');
    const { useAppStore } = require('../../../src/stores');
    const { useUiModeStore } = require('../../../src/stores/uiModeStore');
    const { useWhisperStore } = require('../../../src/stores');
    /* eslint-enable @typescript-eslint/no-var-requires */

    // A direct-audio-capable LiteRT model is active and loaded WITH audio support.
    await liteRTService.loadModel('/models/gemma.litertlm', 'gpu', { supportsAudio: true, maxNumTokens: 4096 });
    useAppStore.setState({ downloadedModels: [createDownloadedModel({ id: 'lrt', engine: 'litert' })], activeModelId: 'lrt' });
    // Whisper IS available: the model file is on disk (real leaf) + selected, so ensureWhisper() can load it
    // and transcribeFile can run. The recorded note transcribes to this text.
    boundary.fs!.seedFile(`${RNFS.DocumentDirectoryPath}/whisper-models/ggml-base.en.bin`, 75 * 1024 * 1024);
    await useWhisperStore.getState().refreshPresentModels();
    useWhisperStore.setState({ downloadedModelId: 'base.en' });
    boundary.whisper!.setFileTranscript('draw a dog');
    useUiModeStore.setState({ interfaceMode: 'text' as never }); // CHAT mode, not the audio interface

    const autoSendArgs: unknown[][] = [];
    const attachmentArgs: Array<Record<string, unknown>> = [];
    const { result } = renderHook(() => useVoiceInput({
      conversationId: 'c1',
      onTranscript: () => {},
      onAutoSend: (...a: unknown[]) => { autoSendArgs.push(a); },
      onAudioAttachment: (p: Record<string, unknown>) => { attachmentArgs.push(p); },
    }));

    await act(async () => { await result.current.startRecording(); });
    // Precondition: the direct-audio recording actually started (else the branch below never runs).
    expect(result.current.isRecording).toBe(true);
    await act(async () => { await result.current.stopRecording(); });

    void boundary;
    // Proof the else branch (Voice.ts:149) fired: the note WAS dispatched as an audio attachment.
    expect(attachmentArgs.length).toBeGreaterThan(0);
    // The transcript must reach the model as content, via EITHER dispatch path. The attachment field is
    // `transcription` — the exact key useVoiceInput emits (Voice.ts) AND the consumer reads
    // (voiceNoteSend.ts onAudioAttachment → buildVoiceAttachment / addAudioAttachment). Asserting `transcript`
    // here was a typo that never matched the real field.
    const gotText =
      autoSendArgs.some(a => typeof a[0] === 'string' && (a[0] as string).trim().length > 0) ||
      attachmentArgs.some(p => typeof p.transcription === 'string' && (p.transcription as string).trim().length > 0);

    // Fixed (was Q20's bug): chat mode transcribes the recorded file and attaches it as
    // { uri, format, durationSeconds, transcription } → the note carries the text → GREEN. Regressing the
    // else-branch (dropping transcription) makes onAudioAttachment carry no text → RED.
    expect(gotText).toBe(true);
  });
});
