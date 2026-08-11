// react-native-zeroconf ships no types. We only use it through @offgrid/sync's RnZeroconf
// structural interface (nativeSync.ts casts to it), so a minimal ambient declaration is enough.
declare module 'react-native-zeroconf' {
  export default class Zeroconf {
    on(event: string, cb: (...args: unknown[]) => void): void;
    scan(type?: string, protocol?: string, domain?: string): void;
    stop(): void;
    removeDeviceListeners(): void;
    publishService(type: string, protocol: string, domain: string, name: string, port: number, txt?: Record<string, string>): void;
    unpublishService(name: string): void;
  }
}
