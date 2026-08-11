import { repairDevice } from '../../../pro/sync/repairDevice';
import { pairingSecretStore } from '../../../pro/sync/pairingSecretStore';

/**
 * Repairing a device the peer did not recognise, without demanding the code first.
 *
 * The user proved they had the code once. A peer that restarted, or whose pairing store had not finished
 * loading when we called, needs nothing more than another handshake - so asking for the code again is the
 * LAST resort, not the first move. Getting this backwards is the "why is repair asking for a pairing
 * code" complaint: the credential was sitting there the whole time.
 *
 * Three outcomes, and the difference between the last two is the point: no credential means the code is
 * genuinely required, while a credential the peer refuses means we tried and the code is required anyway.
 */
describe('repairing a device that was not recognised', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('reconnects with the credential it already holds', async () => {
    jest.spyOn(pairingSecretStore, 'get').mockReturnValue('a-shared-secret');
    const dialled: string[] = [];

    const outcome = await repairDevice('desktop-peer', async deviceId => {
      dialled.push(deviceId);
    });

    expect(outcome).toBe('reconnected');
    expect(dialled).toEqual(['desktop-peer']);
  });

  it('asks for the code when it holds no credential, without dialling', async () => {
    jest.spyOn(pairingSecretStore, 'get').mockReturnValue(undefined);
    const dialled: string[] = [];

    const outcome = await repairDevice('desktop-peer', async deviceId => {
      dialled.push(deviceId);
    });

    expect(outcome).toBe('needs_code');
    // Not dialled at all: a fresh install has nothing to prove possession with, so a handshake would only
    // fail slowly on its way to the same answer.
    expect(dialled).toEqual([]);
  });

  it('asks for the code after trying, when the peer refuses what it holds', async () => {
    jest.spyOn(pairingSecretStore, 'get').mockReturnValue('a-shared-secret');

    const outcome = await repairDevice('desktop-peer', async () => {
      throw new Error('the other device did not recognise this one');
    });

    // Same answer as having no credential, reached the other way round - and only after the cheap attempt
    // that would have spared the user typing anything.
    expect(outcome).toBe('needs_code');
  });

  it('treats a non-Error rejection as a refusal too', async () => {
    jest.spyOn(pairingSecretStore, 'get').mockReturnValue('a-shared-secret');

    const outcome = await repairDevice('desktop-peer', async () => {
      // A native module can reject with a string. Repair still has to reach a decision.
      return Promise.reject('socket closed');
    });

    expect(outcome).toBe('needs_code');
  });
});
