/**
 * Discovery wiring: the REAL DiscoveryOrchestrator + REAL RnDiscovery adapter, fed a fake
 * react-native-zeroconf. Proves that an mDNS-resolved peer is routed correctly — a NEW device is
 * surfaced to the pairing UI, a KNOWN device (we hold a secret for) triggers auto-reconnect, and a
 * removed device fires onLost. Only the injected native (zeroconf) + the engine collaborator are
 * faked; the discovery/orchestrator behavior under test is the package's real code.
 */
import { buildDiscovery } from '../../../src/services/sync/discovery';
import { createTxtRecord } from '@offgrid/sync';
import type { RnZeroconf } from '@offgrid/sync/rn-discovery';

type Handler = (arg: any) => void;

function makeFakeZeroconf() {
  const on: Record<string, Handler> = {};
  const z: RnZeroconf & { emitResolved: (svc: any) => void; emitRemove: (n: string) => void; published?: any } = {
    on(ev: string, cb: Handler) { on[ev] = cb; },
    scan() {/* browsing started */},
    stop() {/* stopped */},
    removeDeviceListeners() {/* noop */},
    publishService(type, protocol, domain, name, port, txt) { z.published = { type, name, port, txt }; },
    unpublishService() { z.published = undefined; },
    emitResolved: (svc) => on['resolved']?.(svc),
    emitRemove: (n) => on['remove']?.(n),
  };
  return z;
}

const local = { id: 'local-phone', name: 'Phone', platform: 'android' as const, version: '1', host: '', port: 0 };
const remote = { id: 'remote-laptop', name: 'Laptop', platform: 'macos' as const, version: '1', host: '192.168.1.5', port: 7777 };
const resolvedSvc = () => ({ txt: createTxtRecord(remote), addresses: ['192.168.1.5'], host: 'laptop.local', port: 7777, name: `OffGrid-${remote.id}` });
const flush = () => new Promise(r => setImmediate(r));

describe('mobile Sync discovery wiring (real orchestrator + RnDiscovery, fake zeroconf)', () => {
  it('surfaces a NEW (unpaired) device for the pairing UI', async () => {
    const z = makeFakeZeroconf();
    let surfaced: any;
    const orch = buildDiscovery({
      zeroconf: z, localDevice: local,
      engine: { isPaired: () => false, reconnect: async () => {} },
      getSharedSecret: () => undefined,           // not paired yet
      onDiscovered: (d) => { surfaced = d; },
    });
    await orch.start();
    z.emitResolved(resolvedSvc());
    await flush();
    expect(surfaced?.id).toBe('remote-laptop');
    expect(surfaced?.host).toBe('192.168.1.5');
  });

  it('auto-reconnects a KNOWN device (has a stored secret) instead of surfacing it', async () => {
    const z = makeFakeZeroconf();
    let surfaced = false; const reconnected: any = {};
    const orch = buildDiscovery({
      zeroconf: z, localDevice: local,
      engine: { isPaired: () => false, reconnect: async (d, s) => { reconnected.d = d; reconnected.s = s; } },
      getSharedSecret: (id) => (id === 'remote-laptop' ? 'stored-secret' : undefined),
      onDiscovered: () => { surfaced = true; },
    });
    await orch.start();
    z.emitResolved(resolvedSvc());
    await flush();
    expect(reconnected.d?.id).toBe('remote-laptop');
    expect(reconnected.s).toBe('stored-secret');
    expect(surfaced).toBe(false);                 // NOT surfaced — it reconnected
  });

  it('advertises this device on start and fires onLost on removal', async () => {
    const z = makeFakeZeroconf();
    let lost: string | undefined;
    const orch = buildDiscovery({
      zeroconf: z, localDevice: { ...local, port: 5555 },
      engine: { isPaired: () => false, reconnect: async () => {} },
      getSharedSecret: () => undefined,
      onLost: (id) => { lost = id; },
    });
    await orch.start();
    expect(z.published?.port).toBe(5555);          // advertised over mDNS
    z.emitRemove(`OffGrid-${remote.id}._offgrid._tcp.local.`);
    await flush();
    expect(lost).toBe('remote-laptop');
  });
});
