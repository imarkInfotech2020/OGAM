/**
 * T086 (checklist Area 12) — DEV-B27: in voice mode a reply that THINKS renders its thinking block
 * FULL-WIDTH / edge-to-edge, not matching the (narrower) voice-note bubble and not left-aligned.
 *
 * Device finding (docs/DEVICE_TEST_FINDINGS.md B27, screenshots IMG_0138/0139): the "Thought process"
 * bubble stretches nearly full screen width while the voice-note (waveform) bubbles are narrower/contained.
 * Two specific wrongs the user called out:
 *   1. the thinking block should be the SAME WIDTH as the voice-note bubble (not full-width);
 *   2. it should be LEFT-ALIGNED like a normal assistant message, not edge-to-edge (stretched).
 *
 * Product-correct outcome (the OGAM user's view): the thinking block sits at the same width and left
 * alignment as the voice-note bubble beneath it, so the conversation reads as one coherent left-aligned
 * column — not a wider, edge-to-edge shape.
 *
 * How this is asserted on the RENDERED artifact: width + alignment are not text, but they ARE measurable
 * layout properties the user perceives. We flatten the resolved RN style of the two rendered nodes and
 * compare:
 *   - the voice-note bubble is `audio-bubble-${id}`  → width '88%', alignSelf 'flex-start'.
 *   - the thinking block is `thinking-block` (wrapped by AudioModeThinkingBlock) → its own width plus its
 *     wrapper's alignSelf.
 * The user's spec: the thinking block's effective width must EQUAL the bubble's, and its alignment must be
 * left ('flex-start'), never 'stretch'/full-width.
 *
 * RED on HEAD: the thinking block resolves to width '100%' (ThinkingBlock.thinkingBlock) inside a wrapper
 * with alignSelf 'stretch' (chatStyles.thinkingBlockWrapper) → full-width, edge-to-edge — the exact B27
 * shape. The voice-note bubble is '88%' / 'flex-start'. They do NOT match → red. The fix (constrain the
 * voice-mode thinking block to the bubble width + left-align, not stretch) greens it.
 *
 * Falsify both ways: the pre-condition asserts BOTH nodes are actually on screen first (so a false green
 * can't hide behind a missing node); the assertion fails for the real wrong values ('100%'/'stretch' vs
 * '88%'/'flex-start').
 */
import { StyleSheet } from 'react-native';
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

/** Flatten a rendered node's resolved style into a single object. */
function flatStyle(node: { props?: { style?: unknown } }): Record<string, unknown> {
  return (StyleSheet.flatten(node.props?.style as never) ?? {}) as Record<string, unknown>;
}

describe('T086 (rendered) — voice-mode thinking block matches voice-note bubble width + left-aligns (B27)', () => {
  it('renders the thinking block at the voice-note bubble width and left-aligned, not full-width/edge-to-edge', async () => {
    const h = await setupChatScreen({ engine: 'litert', platform: 'android', whisper: true, pro: true });
    await h.setupWhisperModel();
    h.render();
    await h.enterVoiceMode();

    // Voice-send a request whose reply THINKS: the litert turn emits reasoning + the answer, so the
    // completed assistant message carries reasoningContent → AudioModeThinkingBlock renders.
    await h.voiceSend('explain briefly why the sky is blue', {
      reasoning: 'The user is asking about Rayleigh scattering. Shorter wavelengths scatter more.',
      content: 'Sunlight scatters off air molecules, and blue scatters most, so the sky looks blue.',
    });

    // Pre-condition: BOTH the thinking block AND the voice-note bubble must actually be on screen (so a
    // false green can't hide behind an absent node). Wait for the reply's audio bubble, then the block.
    const audioBubble = await h.rtl.waitFor(() => {
      const msgs = h.useChatStore.getState().getActiveConversation?.()?.messages ?? [];
      const reply = [...msgs].reverse().find((m: { role: string }) => m.role === 'assistant');
      const node = reply ? h.view!.queryByTestId(`audio-bubble-${(reply as { id: string }).id}`) : null;
      expect(node).not.toBeNull();
      return node!;
    }, { timeout: 8000 });
    const thinkingBlock = await h.rtl.waitFor(() => {
      const node = h.view!.queryByTestId('thinking-block');
      expect(node).not.toBeNull();
      return node!;
    }, { timeout: 8000 });

    // The voice-note bubble's rendered width + alignment (the shape the thinking block must match).
    const bubbleStyle = flatStyle(audioBubble as never);
    const bubbleWidth = bubbleStyle.width;
    const bubbleAlign = bubbleStyle.alignSelf;
    // Sanity on the reference shape (grounds the comparison in the real rendered bubble, per B27).
    expect(bubbleWidth).toBe('88%');
    expect(bubbleAlign).toBe('flex-start');

    // The thinking block's own resolved width, and its wrapper's alignSelf (the AudioModeThinkingBlock
    // wrapper View is the block's parent). Full-width == '100%' + wrapper 'stretch' is the B27 bug.
    const blockStyle = flatStyle(thinkingBlock as never);
    const wrapperNode = (thinkingBlock as unknown as { parent?: { props?: { style?: unknown } } }).parent;
    const wrapperStyle = wrapperNode ? flatStyle(wrapperNode as never) : {};

    // B27 #1 — SAME WIDTH as the voice-note bubble, not full-width edge-to-edge.
    expect(blockStyle.width).toBe(bubbleWidth); // fails on HEAD: '100%' !== '88%'
    // B27 #2 — LEFT-ALIGNED like a normal assistant message, not stretched edge-to-edge.
    expect(wrapperStyle.alignSelf).not.toBe('stretch'); // fails on HEAD: wrapper is 'stretch'
    expect(wrapperStyle.alignSelf ?? bubbleAlign).toBe('flex-start');
  });
});
