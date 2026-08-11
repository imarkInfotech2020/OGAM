// Byte codec injected into @offgrid/sync's RN TCP adapter (RnTcpTransport). The package stays
// platform-agnostic and never imports react-native / Buffer; the host provides this conversion.
//
// react-native-tcp-socket hands socket 'data' as a Buffer, but on some Android builds it arrives as
// a base64-encoded STRING. Outbound, socket.write() wants a Buffer. This codec normalizes both
// directions so the encrypted wire frames survive intact. Pure — no native imports — so it's fully
// unit-testable off-device.
import { Buffer } from 'buffer';

export interface ByteCodec {
  toBytes(data: unknown): Uint8Array;
  fromBytes(bytes: Uint8Array): Buffer;
}

export const rnByteCodec: ByteCodec = {
  /** Outbound: raw frame bytes → Buffer for socket.write(). */
  fromBytes(bytes: Uint8Array): Buffer {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  },

  /** Inbound: normalize whatever react-native-tcp-socket delivers → raw frame bytes.
   *  Handles Buffer / Uint8Array / ArrayBuffer / base64 string. */
  toBytes(data: unknown): Uint8Array {
    if (typeof data === 'string') {
      // Android may deliver base64. Buffer.from(str,'base64') copies into a fresh buffer.
      const b = Buffer.from(data, 'base64');
      return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    }
    if (data instanceof Uint8Array) return data; // Buffer is a Uint8Array subclass — covered here
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    // Fallback: coerce array-likes ({length, [i]}) to bytes; unknown shapes → empty (never throw
    // in the socket data path, which would kill the connection).
    if (data && typeof (data as { length?: number }).length === 'number') {
      return Uint8Array.from(data as ArrayLike<number>);
    }
    return new Uint8Array(0);
  },
};
