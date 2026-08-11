/**
 * The byte codec injected into @offgrid/sync's RN TCP adapter. Encrypted wire frames must survive
 * both directions and every inbound shape react-native-tcp-socket can deliver (Buffer, Uint8Array,
 * base64 string on Android). A single dropped/rewritten byte corrupts the NaCl frame → handshake
 * fails. Real Buffer/base64 round-trips (no mocks).
 */
import { Buffer } from 'buffer';
import { rnByteCodec } from '../../../../src/services/sync/byteCodec';

const bytes = Uint8Array.from([0, 1, 2, 253, 254, 255, 128, 64]); // spans full byte range

describe('rnByteCodec', () => {
  it('fromBytes → a Buffer with identical bytes (outbound)', () => {
    const buf = rnByteCodec.fromBytes(bytes);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect([...buf]).toEqual([...bytes]);
  });

  it('round-trips through a base64 string (the Android inbound path)', () => {
    const b64 = rnByteCodec.fromBytes(bytes).toString('base64');
    expect([...rnByteCodec.toBytes(b64)]).toEqual([...bytes]);
  });

  it('normalizes a Buffer inbound to identical bytes', () => {
    expect([...rnByteCodec.toBytes(Buffer.from(bytes))]).toEqual([...bytes]);
  });

  it('normalizes a Uint8Array inbound to identical bytes', () => {
    expect([...rnByteCodec.toBytes(bytes)]).toEqual([...bytes]);
  });

  it('normalizes an ArrayBuffer inbound', () => {
    const ab = bytes.slice().buffer;
    expect([...rnByteCodec.toBytes(ab)]).toEqual([...bytes]);
  });

  it('preserves a byte-view offset on fromBytes (no leading-byte corruption)', () => {
    const backing = Uint8Array.from([9, 9, 1, 2, 3]);
    const view = backing.subarray(2); // offset=2 → [1,2,3]
    expect([...rnByteCodec.fromBytes(view)]).toEqual([1, 2, 3]);
  });

  it('never throws on an unknown shape (returns empty rather than killing the socket)', () => {
    expect([...rnByteCodec.toBytes(null)]).toEqual([]);
    expect([...rnByteCodec.toBytes(undefined)]).toEqual([]);
    expect([...rnByteCodec.toBytes({})]).toEqual([]);
  });
});
