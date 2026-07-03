/**
 * Integration: Kokoro download-state consistency across the Download Manager and
 * the Voice Models tab.
 *
 * Both surfaces read TTS download state from the SAME seam — the real
 * `ttsProvider.list()` (via modelDownloadService), which queries the singleton
 * KokoroEngine. This test drives the REAL KokoroEngine through the REAL ttsProvider
 * and mocks only the native filesystem boundary (BareResourceFetcher + RNFS), so a
 * green result means the actual chain behaves — not that a mock returned what it
 * was told.
 *
 * Reported bug: mid-download the Download Manager showed Kokoro "downloaded" (82MB)
 * while the Voice tab honestly showed real progress. Root cause: completeness came
 * from pure basename PRESENCE, and executorch creates each destination file before
 * its bytes finish, so the full set is present mid-fetch. The fix gates "downloaded"
 * on a completion SENTINEL written only after a verified full fetch. This test pins
 * that a files-present-but-no-sentinel state can NEVER surface as 'completed' from
 * the provider both views consume — so the two views cannot disagree.
 */
import { BareResourceFetcher } from 'react-native-executorch-bare-resource-fetcher';
import RNFS from 'react-native-fs';
import { KokoroEngine } from '../../../pro/audio/engine/tts/engines/kokoro/KokoroEngine';

const listDownloadedFiles = BareResourceFetcher.listDownloadedFiles as jest.Mock;
const rnfsExists = RNFS.exists as jest.Mock;

// jest.mock factory may only reference vars prefixed with `mock`.
let mockKokoro: KokoroEngine;
jest.mock('../../../pro/audio/engine', () => ({
  ttsRegistry: {
    getRegisteredIds: () => ['kokoro'],
    getEngine: () => mockKokoro,
  },
}));
jest.mock('../../../pro/audio/ttsStore', () => ({
  useTTSStore: {
    getState: () => ({ settings: { engineId: 'kokoro' }, setEngine: jest.fn(), deleteModels: jest.fn(), downloadModels: jest.fn() }),
    subscribe: () => () => {},
  },
}));

import { ttsProvider } from '../../../pro/audio/ttsDownloadProvider';

// The full required set the engine checks: two shared core .pte + the active
// voice's embedding/tagger/lexicon (active voice = af_heart from jest.setup).
const CORE = ['duration_predictor.pte', 'synthesizer.pte'];
const VOICE = ['af_heart.bin', 'tagger.pt', 'lexicon.json'];
const allOnDisk = () => [...CORE, ...VOICE].map((f) => `/cache/react-native-executorch/${f}`);

// Model the sentinel through RNFS.exists: present only when we say so. The engine
// looks up `.kokoro-<voice>-complete`; match by suffix so any active voice works.
let sentinelPresent = false;
const setSentinel = (present: boolean) => { sentinelPresent = present; };

beforeEach(() => {
  jest.clearAllMocks();
  sentinelPresent = false;
  mockKokoro = new KokoroEngine();
  rnfsExists.mockImplementation(async (p: string) =>
    p.includes('-complete') ? sentinelPresent : false,
  );
});

describe('Kokoro download-state consistency (DM vs Voice tab share one source)', () => {
  it('mid-download: ALL required files on disk but NO completion sentinel must NOT read as completed', async () => {
    // The exact bug state: executorch has created every destination file before
    // their bytes finished, so basename presence is complete — but the download is
    // not. Pre-fix this surfaced as status 'completed' (82MB) in the Download
    // Manager. With the sentinel gate it must not.
    listDownloadedFiles.mockResolvedValue(allOnDisk());
    setSentinel(false);

    const items = await ttsProvider.list();
    const kokoro = items.find((d) => d.id === 'tts:kokoro');

    // Either absent (nothing to show yet) or shown as in-progress — but NEVER
    // 'completed'. That single guarantee is what makes the DM and the Voice tab
    // agree, since both render from this same list.
    expect(kokoro?.status).not.toBe('completed');
  });

  it('genuinely complete: all files present AND the sentinel present reads as completed', async () => {
    listDownloadedFiles.mockResolvedValue(allOnDisk());
    setSentinel(true);

    const kokoro = (await ttsProvider.list()).find((d) => d.id === 'tts:kokoro');
    expect(kokoro?.status).toBe('completed');
  });

  it('partial (core .pte present, voice assets missing) with sentinel absent is not completed', async () => {
    // A prior interrupted fetch left the shared .pte behind; the active voice's
    // assets are missing. Presence is incomplete AND there is no sentinel.
    listDownloadedFiles.mockResolvedValue(CORE.map((f) => `/cache/react-native-executorch/${f}`));
    setSentinel(false);

    const kokoro = (await ttsProvider.list()).find((d) => d.id === 'tts:kokoro');
    expect(kokoro?.status).not.toBe('completed');
  });
});
