import { Buffer } from 'buffer';
import RNFS from 'react-native-fs';
import { CHUNK_SIZE, checksumFromSha512Hex, IncrementalChecksum } from '@offgrid/sync';
import logger from '../../utils/logger';

/**
 * The transfer checksum of a file on this device.
 *
 * The platform hashes it. Reading a file into JavaScript to hash it costs a bridge round trip per
 * chunk plus a base64 decode of every byte, which for a multi-gigabyte model takes minutes - and it
 * happens BEFORE the transfer is created, so nothing is on screen, nothing is in activity, and the
 * user sees an app that has hung. One native call replaces all of it.
 *
 * The chunked reader stays as the fallback for a device whose native hash is unavailable, so the
 * behaviour degrades in speed and never in correctness: both produce the same value, because the
 * format is defined once in the shared package.
 */
export async function fileTransferChecksum(
  path: string,
  size: number,
): Promise<string> {
  try {
    const hex = await RNFS.hash(path, 'sha512');
    return checksumFromSha512Hex(hex);
  } catch (error) {
    logger.warn(
      `[Checksum] native hash unavailable, reading ${Math.round(size / 1_000_000)}MB in chunks: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return chunkedChecksum(path, size);
  }
}

async function chunkedChecksum(path: string, size: number): Promise<string> {
  const checksum = new IncrementalChecksum();
  for (let offset = 0; offset < size; offset += CHUNK_SIZE) {
    const encoded = await RNFS.read(
      path,
      Math.min(CHUNK_SIZE, size - offset),
      offset,
      'base64',
    );
    checksum.update(new Uint8Array(Buffer.from(encoded, 'base64')));
  }
  return checksum.digest();
}
