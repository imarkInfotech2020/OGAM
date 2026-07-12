import { setupChatScreen } from '../../harness/chatHarness';

const GB = 1024 * 1024 * 1024;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

describe('STT reclaim on send (memory-tight) — rendered characterization', () => {
  it('frees the idle whisper sidecar when a text turn is sent on a tight device, and still renders the reply', async () => {
    const h = await setupChatScreen({
      engine: 'llama',
      platform: 'android',
      whisper: true,
      ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 9 * GB },
    });
    h.render();
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { modelResidencyManager } = require('../../../src/services/modelResidency');
    const { hardwareService } = require('../../../src/services/hardware');
    /* eslint-enable @typescript-eslint/no-var-requires */
    const types = () => (modelResidencyManager.getResidents() as Array<{ type: string }>).map(r => r.type).sort();

    await h.setupWhisperModel();
    expect(types()).toEqual(['text', 'whisper']);

    h.boundary.setRam({ platform: 'android', totalBytes: 6 * GB, availBytes: 5 * GB });
    await hardwareService.refreshMemoryInfo();

    await h.send('what is 2 plus 2', { text: 'It is 4.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/It is 4\./)).not.toBeNull(); }, { timeout: 6000 });
    expect(types()).toEqual(['text']);
  });
});
