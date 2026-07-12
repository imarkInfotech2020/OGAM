/**
 * T023b / DEV-B1 (generalised) — Eject All must free EVERY resident model, not just text + image.
 *
 * Root cause (activeModelService/index.ts:436-437): ejectAll → unloadAllModels(), and the count is
 * `(textUnloaded?1:0) + (imageUnloaded?1:0)` — sidecars (whisper / tts / embedding) are never unloaded, so
 * they stay resident and keep charging the memory budget after the user hit "Eject All". T023 proves this
 * for whisper; this proves the general invariant across ALL sidecar types at once.
 *
 * The residency accounting is the invariant surface (§4 gesture-less carve-out). Pre-place the residents
 * (what a real load/download leaves — the manager's map) across every type, run the REAL ejectAll, and assert
 * the accounting is EMPTY.
 *
 * RED on HEAD: whisper + tts + embedding remain resident after ejectAll. GREEN only when ejectAll frees them.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

describe('T023b (rendered) — Eject All frees every resident type, not just text/image (DEV-B1)', () => {
  it('leaves NO model resident after ejectAll (sidecars included)', async () => {
    installNativeBoundary({ llama: true, fs: true });
    requireRTL();
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { activeModelService } = require('../../../src/services/activeModelService');
    const { modelResidencyManager } = require('../../../src/services/modelResidency');
    /* eslint-enable @typescript-eslint/no-var-requires */

    // Every heavy + sidecar type resident (the state a real set of loads/downloads leaves).
    const noop = async () => {};
    modelResidencyManager.register({ key: 'text', type: 'text', modelId: 'llm', sizeMB: 500 }, noop);
    modelResidencyManager.register({ key: 'image', type: 'image', modelId: 'sd', sizeMB: 900, dirtyMemory: true }, noop);
    modelResidencyManager.register({ key: 'whisper', type: 'whisper', modelId: 'tiny.en', sizeMB: 75 }, noop);
    modelResidencyManager.register({ key: 'tts', type: 'tts', modelId: 'kokoro', sizeMB: 80 }, noop);
    modelResidencyManager.register({ key: 'embedding', type: 'embedding', modelId: 'minilm', sizeMB: 90 }, noop);

    // Precondition: everything is resident (so the post-eject check is meaningful, not vacuous).
    const before = (modelResidencyManager.getResidents() as Array<{ type: string }>).map(r => r.type).sort();
    expect(before).toEqual(['embedding', 'image', 'text', 'tts', 'whisper']);

    // The REAL Eject All (the exact function the Home "Eject All" button calls).
    await activeModelService.ejectAll();

    // SPEC: Eject All frees ALL resident models. RED (B1): the sidecars remain (ejectAll only unloads
    // text + image), so the memory budget stays inflated after the user ejected everything.
    const after = (modelResidencyManager.getResidents() as Array<{ type: string }>).map(r => r.type).sort();
    expect(after).toEqual([]);
  });
});
