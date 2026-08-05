/**
 * What the user can DO while an image is being generated - the window a mocked generator has no way to open.
 *
 * Diffusion takes many seconds on a device. That whole time the user is sitting in front of a progress card with a
 * STOP control, and three things have to hold:
 *
 *  - STOP actually reaches the native generator and the card goes away. A stop that only flips a JS flag leaves the
 *    NPU burning battery on an image nobody will ever see, and on a phone that is heat and a dead battery.
 *  - the progress the native side reports is the progress shown. A card frozen at 0/8 for twenty seconds is
 *    indistinguishable from a hang, and the user force-quits an app that was working.
 *  - a second send while it runs does not start a second diffusion. Two loaded diffusion pipelines is the
 *    OOM-kill case on any phone this app targets.
 *
 * Everything below is the real ChatScreen, the real imageGenerationService and the real localDreamGenerator, with
 * only the native diffusion module faked. The generation is HELD OPEN at the native call (the harness's
 * holdNextGeneration), which is what makes the in-flight window addressable at all.
 *
 * REPLACES three cases from imageGenerationFlow.test.ts, which stood in for localDreamGenerator itself - the very
 * thing whose in-flight behaviour was under test. With the generator mocked, "cancel" asserted that our service
 * called a jest.fn, and native could not have kept running afterwards even if the real code never told it to stop.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

/** Force image mode on with a real image model placed, then hold the next generation open at the native call. */
async function startHeldGeneration(h: Awaited<ReturnType<typeof setupChatScreen>>, prompt: string) {
  h.render();
  await h.placeImageModel({ backend: 'coreml' }); // iOS Core ML - no integrity-file gate
  await h.cycleImageMode(); // auto -> ON(force)
  await h.rtl.waitFor(() => {
    expect(h.view!.queryByTestId('image-mode-force-badge')).not.toBeNull();
  });

  h.boundary.diffusion.holdNextGeneration();
  await h.tapSend(prompt);
  // Native has been entered and is parked inside generateImage - the device state we care about.
  await h.rtl.waitFor(() => {
    expect(h.boundary.diffusion.calls.generateImage.length).toBe(1);
  });
  await h.rtl.waitFor(() => { expect(h.boundary.diffusion.generationHeld()).toBe(true); });
}

/**
 * Press the stop control on the image progress card.
 *
 * It has NO testID (ChatScreenComponents.tsx: the card's stop is a bare TouchableOpacity around an "x" icon), so
 * it is reached structurally - the pressable ancestor of the card's "x". The count is asserted first, so if a
 * second "x" control ever appears while an image generates this fails loudly instead of quietly pressing the
 * wrong thing. A testID on that control is the proper fix and would delete this helper.
 */
function pressImageCardStop(h: Awaited<ReturnType<typeof setupChatScreen>>) {
  type Node = { type?: unknown; props?: Record<string, unknown>; parent?: Node | null };
  const xIcons = h.view!.root.findAll(
    (n: Node) => n.type === 'Icon' && (n.props as { name?: string })?.name === 'x',
  );
  expect(xIcons).toHaveLength(1);
  let node: Node | null = xIcons[0] as unknown as Node;
  for (let depth = 0; node && depth < 12; depth++) {
    const onPress = node.props?.onPress;
    if (typeof onPress === 'function') { (onPress as () => void)(); return; }
    node = node.parent ?? null;
  }
  throw new Error('the image progress card has an "x" with no pressable ancestor - the stop control is dead');
}

describe('while an image is generating', () => {
  it('STOP reaches the native generator and clears the card', async () => {
    const h = await setupChatScreen({ engine: 'litert', platform: 'ios' });
    await startHeldGeneration(h, 'a fox in the snow');

    expect(h.boundary.diffusion.cancelCount()).toBe(0);

    // The real STOP control the user is looking at, on the progress card.
    await h.rtl.act(async () => { pressImageCardStop(h); });

    // Native was told. This is the assertion that matters: our own service reporting "cancelled" while the NPU
    // keeps rendering is exactly the bug a mocked generator cannot expose.
    await h.rtl.waitFor(() => { expect(h.boundary.diffusion.cancelCount()).toBe(1); });

    // And no image is added to the conversation from a generation the user abandoned.
    await h.settle(300);
    expect(h.view!.queryByTestId('generated-image')).toBeNull();
  });

  it('shows the progress the native side reports, not a frozen card', async () => {
    const h = await setupChatScreen({ engine: 'litert', platform: 'ios' });
    await startHeldGeneration(h, 'a fox in the snow');

    // The native progress event, on the channel localDreamGenerator really listens to.
    await h.rtl.act(async () => {
      h.boundary.litertEvents.emit('LocalDreamProgress', { step: 3, totalSteps: 20, progress: 0.15 });
    });

    // The step the user reads on the card. A card stuck at the first step reads as a hang, and the user
    // force-quits an app that was working. The step count in the copy comes from the REQUEST, not the event,
    // so this matches the step and leaves the total open.
    await h.rtl.waitFor(() => {
      expect(h.view!.queryByText(/Generating image \(3\/\d+\)/)).not.toBeNull();
    });

    await h.rtl.act(async () => {
      h.boundary.litertEvents.emit('LocalDreamProgress', { step: 7, totalSteps: 20, progress: 0.35 });
    });
    // It MOVED - the card is wired to the event stream, not painted once from the request.
    await h.rtl.waitFor(() => {
      expect(h.view!.queryByText(/Generating image \(7\/\d+\)/)).not.toBeNull();
    });
    expect(h.view!.queryByText(/Generating image \(3\/\d+\)/)).toBeNull();

    h.boundary.diffusion.releaseGeneration();
  });

  it('does not start a second diffusion when the user sends again mid-generation', async () => {
    const h = await setupChatScreen({ engine: 'litert', platform: 'ios' });
    await startHeldGeneration(h, 'a fox in the snow');

    await h.tapSend('and a badger');
    await h.settle(300);

    // Still one. Two diffusion pipelines resident at once is the OOM kill.
    expect(h.boundary.diffusion.calls.generateImage.length).toBe(1);

    // The held one still finishes and lands in the chat - refusing the second must not strand the first.
    h.boundary.diffusion.releaseGeneration();
    await h.rtl.waitFor(() => { expect(h.view!.queryByTestId('generated-image')).not.toBeNull(); });
  });
});
