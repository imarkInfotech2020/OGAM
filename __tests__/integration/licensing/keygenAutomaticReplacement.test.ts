import * as Keychain from 'react-native-keychain';
import {
  activateProByKey,
  readProFromKeychain,
} from '../../../src/services/proLicenseService';

interface FakeMachine {
  id: string;
  fingerprint: string;
  platform: string;
  lastSeen: string;
}

const storedSecrets = new Map<string, string>();
const originalFetch = global.fetch;

function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('Keygen automatic device replacement', () => {
  beforeEach(() => {
    storedSecrets.clear();
    storedSecrets.set('off-grid-device-fingerprint', 'fp-current');
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(
      async ({ service }: { service: string }) => {
        const value = storedSecrets.get(service);
        return value ? { username: 'stored', password: value } : false;
      },
    );
    (Keychain.setGenericPassword as jest.Mock).mockImplementation(
      async (_username: string, password: string, { service }: { service: string }) => {
        storedSecrets.set(service, password);
        return true;
      },
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('removes the least recently seen machine and activates the sixth device', async () => {
    const machines: FakeMachine[] = [
      {
        id: 'oldest',
        fingerprint: 'fp-oldest',
        platform: 'ios',
        lastSeen: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'recent-1',
        fingerprint: 'fp-recent-1',
        platform: 'android',
        lastSeen: '2026-07-20T00:00:00.000Z',
      },
      {
        id: 'recent-2',
        fingerprint: 'fp-recent-2',
        platform: 'ios',
        lastSeen: '2026-07-21T00:00:00.000Z',
      },
      {
        id: 'recent-3',
        fingerprint: 'fp-recent-3',
        platform: 'android',
        lastSeen: '2026-07-22T00:00:00.000Z',
      },
      {
        id: 'recent-4',
        fingerprint: 'fp-recent-4',
        platform: 'macos',
        lastSeen: '2026-07-23T00:00:00.000Z',
      },
    ];

    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/licenses/actions/validate-key')) {
        return response(200, {
          meta: { valid: false, code: 'TOO_MANY_MACHINES' },
          data: { id: 'lic-1', attributes: { expiry: null, metadata: {}, name: null } },
        });
      }
      if (url.endsWith('/licenses/lic-1/machines')) {
        return response(200, {
          data: machines.map((machine) => ({
            id: machine.id,
            attributes: {
              fingerprint: machine.fingerprint,
              platform: machine.platform,
              lastHeartbeat: machine.lastSeen,
            },
          })),
        });
      }
      if (url.endsWith('/machines') && init?.method === 'POST') {
        if (machines.length >= 5) {
          return response(422, {
            errors: [{ code: 'MACHINE_LIMIT_EXCEEDED', detail: 'machine limit exceeded' }],
          });
        }
        const body = JSON.parse(String(init.body));
        machines.push({
          id: 'current',
          fingerprint: body.data.attributes.fingerprint,
          platform: body.data.attributes.platform,
          lastSeen: '2026-07-26T00:00:00.000Z',
        });
        return response(201);
      }
      const machineId = /\/machines\/([^/]+)$/.exec(url)?.[1];
      if (machineId && init?.method === 'DELETE') {
        const index = machines.findIndex((machine) => machine.id === machineId);
        if (index >= 0) machines.splice(index, 1);
        return response(204);
      }
      return response(404);
    }) as typeof fetch;

    await expect(activateProByKey('key/abc')).resolves.toEqual({ ok: true });
    await expect(readProFromKeychain()).resolves.toBe(true);
    expect(machines.map((machine) => machine.id)).toEqual([
      'recent-1',
      'recent-2',
      'recent-3',
      'recent-4',
      'current',
    ]);
  });
});
