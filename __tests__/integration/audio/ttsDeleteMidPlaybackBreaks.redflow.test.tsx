/**
 * RED-FLOW (UI, BEHAVIORAL) — T083 / DEVICE_TEST_LOG V5-gap: deleting the TTS model in the Download
 * Manager WHILE it is playing must be GRACEFUL — the currently-playing audio must NOT be broken.
 *
 * Product-correct outcome (the OGAM user's view): in voice mode a completed turn speaks the reply; while
 * that audio is playing the center control on the audio bar is the STOP button (`tts-stop-button`). If the
 * user opens the Download Manager and deletes the voice model right then, in-flight playback should keep
 * going (the audio layer's canEvict veto — `playbackStatus === 'idle'` — should hold): the STOP button
 * stays and the bar does NOT snap back to the idle mic.
 *
 * WHY THIS IS RED ON HEAD (grounded in the code + V5): the canEvict veto exists ONLY on the residency
 * eviction path (pro/audio/ttsStore.ts:276, pro/audio/index.ts:221 — `canEvict: () => playbackStatus ===
 * 'idle'`). The Download Manager delete gesture does NOT go through residency eviction; it runs
 * useVoiceDownloadItems.deleteItem → the `downloads.deleteVoiceModel` hook → ttsStore.deleteModels →
 * engine.deleteAssets() → engine.release() → KokoroTTSBridge.stop(true), which UNCONDITIONALLY tears down
 * the active synthesis (KokoroEngine.ts:317→182). `playbackStatus`/`canEvict` are never consulted on this
 * path, so active playback is killed. Matches DEVICE_TEST_LOG V5 line: "delete a TTS model MID-playback
 * (no canEvict veto)".
 *
 * ── SHOWN RED (in the terminal, this file) ──
 *   HEAD (real delete):         after Delete → `tts-stop-button` GONE, mic back, playbackStatus 'idle'  → RED
 *   Fix simulated (veto delete
 *   while playing):             after Delete → `tts-stop-button` STILL present, status 'playing'         → GREEN
 * So the red flips green ONLY when the delete path honors the veto — a genuine behavioral red, not a
 * shape-test. The observe-transient guard (T056 lesson) is enforced: the STOP button is asserted PRESENT
 * (real 'playing' state observed on screen) BEFORE the delete, so the "it cleared" is a real transition.
 *
 * DEVICE BOUNDARY FAKE (the only fake — everything above it is the real stack): the executorch synthesis
 * runtime (react-native-executorch `useTextToSpeech`) is genuinely-external native. Here it emits ONE
 * audio chunk (so the bridge's real audio pump starts ticking → the playback machine promotes
 * preparing → playing) and then holds synthesis in-flight (the stream promise never resolves), which is
 * exactly what a real device does WHILE audio is still draining. That is what lets us observe a STABLE
 * 'playing' state on the rendered ChatScreen — the real audio pump, playback machine, residency, DM
 * screen, delete hook, and TTS engine all run for real.
 *
 * The engine `release()`/`stop()` fix belongs in a service (honor canEvict / defer the delete-while-
 * playing) — this test is the executable spec that fix must satisfy (FIX mode later).
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('T083 (rendered) — deleting the TTS model mid-playback must not break playback', () => {
  it('keeps the voice-mode STOP control after the DM delete gesture fires during active playback', async () => {
    const h = await setupChatScreen({ engine: 'litert', platform: 'android', whisper: true, pro: true });
    await h.setupWhisperModel();

    // DEVICE BOUNDARY: the executorch synthesis runtime. Emit one audio chunk (so the real bridge pump
    // ticks → playback machine goes preparing → playing) then hold synthesis open (never resolve), the
    // device's real state while audio is still draining. This is the ONLY fake; it must be installed
    // before render() because the bridge captures the hook value at mount.
    /* eslint-disable @typescript-eslint/no-var-requires */
    const rne = require('react-native-executorch');
    /* eslint-enable @typescript-eslint/no-var-requires */
    rne.useTextToSpeech.mockReturnValue({
      isReady: true,
      downloadProgress: 1,
      error: null,
      stream: jest.fn(({ onNext }: { onNext: (c: Float32Array) => Promise<void> | void }) => {
        onNext(new Float32Array(2400)); // one scheduled buffer → the pump starts ticking → 'playing'
        return new Promise<void>(() => {}); // synthesis held in-flight (audio still "draining")
      }),
      streamStop: jest.fn(),
    });

    h.render();

    /* eslint-disable @typescript-eslint/no-var-requires */
    const React = require('react');
    const { useTTSStore } = require('@offgrid/pro/audio/ttsStore');
    const { DownloadManagerScreen } = require('../../../src/screens/DownloadManagerScreen');
    /* eslint-enable @typescript-eslint/no-var-requires */

    // Arrive in voice mode via the real gesture, then reconcile the engine's genuine-completion flag from
    // the persisted download flag exactly as the app does on boot / when the DM opens (checkDownloadStatus
    // = a real store action). Without it the executorch engine reports not-fully-downloaded, so the DM
    // would not list the completed Kokoro row to delete.
    await h.enterVoiceMode();
    await useTTSStore.getState().checkDownloadStatus();

    // PRECONDITION (observe-transient, per the T056 lesson): before playback, the audio bar shows the mic,
    // NOT the stop button. So the stop button we assert below is a real observed transition.
    expect(h.view!.queryByTestId('tts-stop-button')).toBeNull();
    expect(h.view!.queryByTestId('voice-record-button-audio')).not.toBeNull();

    // Real voice turn: record → transcribe → send → the reply is spoken. The held executorch stream keeps
    // the turn PLAYING, so the audio bar's center control becomes the STOP button — observed on screen.
    await h.voiceSend('what is 2 plus 2', { content: 'It is 4.' });
    await h.rtl.waitFor(
      () => { expect(h.view!.queryByTestId('tts-stop-button')).not.toBeNull(); },
      { timeout: 4000 },
    );
    // 'playing' is observed on the UI itself: the STOP control is the audio bar's center button ONLY while
    // playing (and the idle mic is gone) — no store assertion needed.
    expect(h.view!.queryByTestId('voice-record-button-audio')).toBeNull();

    // GESTURE: open the real Download Manager, find the completed Voice (Kokoro TTS) row, tap its delete
    // button, and confirm the destructive alert — the real delete-a-TTS-model-in-DM flow, mid-playback.
    const dm = h.rtl.render(
      React.createElement(DownloadManagerScreen, {
        navigation: { navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} },
      }),
    );
    const voiceRowText = await h.rtl.waitFor(() => dm.getByText('Voice'), { timeout: 4000 });
    // Scope the delete button to the TTS row (author "Voice") — the completed list also holds the text
    // model's delete button, so we walk up from the "Voice" author label to that row's delete control.
    type Node = { parent?: Node | null } | null;
    let node: Node = voiceRowText as unknown as Node;
    let deleteBtn: ReturnType<typeof dm.queryByTestId> | null = null;
    for (let i = 0; i < 10 && node; i++) {
      node = node.parent ?? null;
      if (node) deleteBtn = h.rtl.within(node as never).queryByTestId('delete-model-button');
      if (deleteBtn) break;
    }
    expect(deleteBtn).not.toBeNull();
    await h.rtl.act(async () => { h.rtl.fireEvent.press(deleteBtn!); });
    const confirm = await h.rtl.waitFor(() => dm.getByText('Delete'), { timeout: 2000 });
    await h.rtl.act(async () => {
      h.rtl.fireEvent.press(confirm);
      await new Promise((r) => setTimeout(r, 500));
    });

    // ASSERTION (the terminal artifact the user perceives): playback must be intact — the STOP control is
    // still on the audio bar, and the bar has NOT snapped back to the idle mic.
    //   RED on HEAD: deleteModels → deleteAssets → release → bridge.stop(true) killed the synth, so
    //   playbackStatus fell to 'idle', the STOP button disappeared and the mic returned = broken playback.
    expect(h.view!.queryByTestId('tts-stop-button')).not.toBeNull();
    expect(h.view!.queryByTestId('voice-record-button-audio')).toBeNull();
  });
});
