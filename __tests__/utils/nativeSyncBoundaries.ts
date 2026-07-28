import { Buffer } from 'buffer';
import { createTxtRecord, type DeviceInfo } from '@offgrid/sync';
import type { RnTcpModule } from '@offgrid/sync/rn';

type Handler = (...args: unknown[]) => void;

class NativeSocketBoundary {
  peer?: NativeSocketBoundary;
  remoteAddress = '127.0.0.1';
  private closed = false;
  private readonly handlers = new Map<string, Handler[]>();

  on(event: string, callback: Handler): this {
    const callbacks = this.handlers.get(event) ?? [];
    callbacks.push(callback);
    this.handlers.set(event, callbacks);
    return this;
  }

  write(data: unknown): boolean {
    const encoded = Buffer.from(data as Uint8Array).toString('base64');
    setImmediate(() => this.peer?.emit('data', encoded));
    return true;
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    const peer = this.peer;
    setImmediate(() => this.emit('close'));
    if (peer && !peer.closed) {
      peer.closed = true;
      setImmediate(() => peer.emit('close'));
    }
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

export function createNativeTcpBoundary(): RnTcpModule {
  const servers = new Map<number, (socket: NativeSocketBoundary) => void>();
  let nextPort = 43000;

  return {
    createServer(onConnection) {
      let port = 0;
      const server = {
        on: () => server,
        listen(options: { port: number }, callback?: () => void) {
          port = options.port || nextPort++;
          servers.set(port, onConnection);
          callback?.();
        },
        address: () => ({ port }),
        close: () => {
          servers.delete(port);
        },
      };
      return server;
    },
    createConnection(options, callback) {
      const onConnection = servers.get(options.port);
      if (!onConnection)
        throw new Error(`No native server on port ${options.port}`);

      const client = new NativeSocketBoundary();
      const server = new NativeSocketBoundary();
      client.peer = server;
      server.peer = client;
      setImmediate(() => {
        onConnection(server);
        callback?.();
      });
      return client;
    },
  };
}

export interface DiscoveryBoundary {
  publishedPort?: number;
  scanCount: number;
  stopCount: number;
  resolve(device: DeviceInfo): void;
}

let boundaries: DiscoveryBoundary[] = [];

export function createNativeDiscoveryBoundary(): new () => DiscoveryBoundary {
  return class NativeDiscoveryBoundary implements DiscoveryBoundary {
    publishedPort?: number;
    scanCount = 0;
    stopCount = 0;
    private readonly handlers = new Map<string, Handler>();
    private nativeListenersActive = true;

    constructor() {
      boundaries.push(this);
    }

    on(event: string, callback: Handler): void {
      this.handlers.set(event, callback);
    }

    scan(): void {
      this.scanCount += 1;
    }
    stop(): void {
      this.stopCount += 1;
    }
    removeDeviceListeners(): void {
      this.nativeListenersActive = false;
    }
    publishService(
      _type: string,
      _protocol: string,
      _domain: string,
      _name: string,
      port: number,
    ): void {
      this.publishedPort = port;
    }
    unpublishService(): void {}

    resolve(device: DeviceInfo): void {
      if (!this.nativeListenersActive) return;
      this.handlers.get('resolved')?.({
        txt: createTxtRecord(device),
        addresses: [device.host],
        host: device.host,
        port: device.port,
        name: `OffGrid-${device.id}`,
      });
    }
  };
}

export function getDiscoveryBoundaries(): DiscoveryBoundary[] {
  return boundaries;
}

export function resetDiscoveryBoundaries(): void {
  boundaries = [];
}
