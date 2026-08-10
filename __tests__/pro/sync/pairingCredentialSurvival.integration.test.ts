import { pairingSecretStore } from '../../../pro/sync/pairingSecretStore';
import type { DeviceInfo } from '@offgrid/sync';

/**
 * The device's keychain, faked at the boundary and OUTLIVING a module reset - which is the whole
 * point: a restart is a fresh app over storage that is still there.
 */
const vault = globalThis as { __pairingVault?: string | null };

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { AFTER_FIRST_UNLOCK: 'AfterFirstUnlock' },
  setGenericPassword: jest.fn(async (_user: string, password: string) => {
    (globalThis as { __pairingVault?: string | null }).__pairingVault = password;
    return true;
  }),
  getGenericPassword: jest.fn(async () => {
    const stored = (globalThis as { __pairingVault?: string | null })
      .__pairingVault;
    return stored ? { username: 'sync-pairings', password: stored } : false;
  }),
  resetGenericPassword: jest.fn(async () => true),
}));

/**
 * A credential outlives the state the pairing happens to be in.
 *
 * The store used to write the secret only for pairings marked 'trusted', so a device flagged
 * needs_repair had its credential dropped by the very next save. The app came back from a restart
 * with the pairing records intact and no secrets at all - and repair then asked for the pairing code
 * forever, on a phone that had never been uninstalled.
 *
 * Keychain is the device boundary and is faked; everything above it is the real store.
 */
describe('pairing credentials survive a restart', () => {
  const iphone: DeviceInfo = {
    id: 'iphone-1',
    name: 'iPhone',
    platform: 'ios',
    version: '1.0.0',
    host: '192.168.1.20',
    port: 51000,
  };

  beforeEach(() => {
    vault.__pairingVault = null;
    jest.resetModules();
  });

  /**
   * A restart is a fresh module over the same Keychain, which is exactly what the app does on
   * launch - no reset hook in production code just to make a test convenient.
   */
  const restart = async (): Promise<typeof pairingSecretStore> => {
    jest.resetModules();
     
    const reloaded = require('../../../pro/sync/pairingSecretStore')
      .pairingSecretStore as typeof pairingSecretStore;
    await reloaded.load();
    return reloaded;
  };

  const pair = async (): Promise<void> => {
    await pairingSecretStore.load();
    await pairingSecretStore.beginPairing({
      ...iphone,
      sharedSecret: 'shared-secret-42',
      pairedAt: 1,
    });
    await pairingSecretStore.commitPairing({
      ...iphone,
      sharedSecret: 'shared-secret-42',
      pairedAt: 1,
    });
  };

  it('keeps the secret of a pairing that needs repair, across a restart', async () => {
    await pair();
    expect(pairingSecretStore.get(iphone.id)).toBe('shared-secret-42');

    // The peer did not recognise us once - which is not a reason to destroy what the user proved.
    await pairingSecretStore.markNeedsRepair(iphone);
    const reloaded = await restart();

    expect(reloaded.known(iphone.id)?.state).toBe('needs_repair');
    expect(reloaded.get(iphone.id)).toBe('shared-secret-42');
  });

  it('still has the credential after an ordinary restart', async () => {
    await pair();
    const reloaded = await restart();
    expect(reloaded.get(iphone.id)).toBe('shared-secret-42');
  });
});
