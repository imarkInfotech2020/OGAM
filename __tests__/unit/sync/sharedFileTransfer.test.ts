import { Buffer } from 'buffer';
import {
  CHUNK_SIZE,
  createSharedFileTransferMetadata,
  type FileRequestMessage,
  type SharedFileDescriptor,
  type TransferFileSink,
} from '@offgrid/sync';
import { modelTransferFsBoundary } from '../../utils/modelTransferFsBoundary';
import {
  createSharedFileSink,
  createSharedFileSource,
  ensureSharedFileStage,
  readStagedSharedFileMetadata,
  removeStagedSharedFile,
  stagedSharedFilePath,
} from '../../../pro/sync/sharedFileTransfer';

jest.mock('react-native-fs', () => {
  const {
    modelTransferFsBoundary: boundary,
  } = require('../../utils/modelTransferFsBoundary');
  return { __esModule: true, default: boundary.module };
});

const fs = modelTransferFsBoundary.module;

/**
 * A file arriving on the phone, landing only once it is whole.
 *
 * The promise is the same one the Mac makes: what appears in the Files list is complete and is what the other
 * device sent. So bytes land in a `.part` file and are renamed into place only after the checksum agrees - a
 * partial file under its real name would be opened, indexed and forwarded as though it were real.
 *
 * The phone's version of this has one extra hazard the Mac does not: every chunk crosses the React Native
 * bridge as base64, so the encoding has to survive bytes that are not text. Run over a real in-memory
 * filesystem (see utils/modelTransferFsBoundary), so what is asserted is bytes landing and disappearing.
 */
describe('a file arriving on the phone', () => {
  const SYNC_ID = '1a2b3c4d-5e6f-4708-8192-a3b4c5d6e7f8';

  const descriptor = (
    overrides: Partial<SharedFileDescriptor> = {},
  ): SharedFileDescriptor =>
    ({
      syncId: SYNC_ID,
      kind: 'file',
      name: 'contract.pdf',
      mimeType: 'application/pdf',
      fileSize: 11,
      createdAt: '2026-08-04T09:00:00.000Z',
      ...overrides,
    } as SharedFileDescriptor);

  const checksumOf = async (bytes: Buffer): Promise<string> => {
    await fs.writeFile(
      '/docs/checksum-source',
      bytes.toString('base64'),
      'base64',
    );
    const {
      fileTransferChecksum,
    } = require('../../../src/services/sync/fileChecksum');
    return fileTransferChecksum('/docs/checksum-source', bytes.length);
  };

  /**
   * The sink with its request bound in, the way the transfer manager feeds it.
   *
   * The manager passes the request to prepare, finalize and blobDestination, so the test supplies it once
   * rather than at every call site.
   */
  const sink = async (
    bytes: Buffer,
    file = descriptor(),
  ): Promise<{
    inner: TransferFileSink;
    prepare(): Promise<number>;
    write(offset: number, data: Uint8Array): Promise<void>;
    finalize(): Promise<boolean>;
    abort(reason: string, preservePartial: boolean): Promise<void>;
    blobDestination(): Promise<string | undefined>;
    staged: Array<{ path: string }>;
    releases: number;
  }> => {
    const staged: Array<{ path: string }> = [];
    let releases = 0;
    const metadata = createSharedFileTransferMetadata({
      ...file,
      fileSize: bytes.length,
    });
    const request = {
      payload: {
        fileName: file.name,
        fileSize: bytes.length,
        mimeType: 'application/vnd.offgrid.shared-file',
        checksum: await checksumOf(bytes),
        metadata,
      },
    } as FileRequestMessage;
    const inner = createSharedFileSink({
      request,
      metadata,
      onStaged: async (_metadata, path) => {
        staged.push({ path });
      },
      releaseReservation: () => {
        releases += 1;
      },
    });
    return {
      inner,
      prepare: () => inner.prepare(request),
      write: (offset, data) => inner.write(offset, data),
      finalize: () => inner.finalize(request),
      abort: (reason, preservePartial) => inner.abort(reason, preservePartial),
      blobDestination: () =>
        inner.blobDestination?.(request) ?? Promise.resolve(undefined),
      get staged() {
        return staged;
      },
      get releases() {
        return releases;
      },
    };
  };

  const stagedPath = (bytes: Buffer, file = descriptor()): string =>
    stagedSharedFilePath(
      createSharedFileTransferMetadata({ ...file, fileSize: bytes.length }),
    );

  beforeEach(() => {
    modelTransferFsBoundary.reset();
  });

  describe('sending one', () => {
    it('reads the window it was asked for', async () => {
      await fs.writeFile(
        '/docs/contract.pdf',
        Buffer.from('hello world').toString('base64'),
        'base64',
      );
      const source = createSharedFileSource(descriptor(), '/docs/contract.pdf');

      const chunk = await source.read(6, 5);

      // A chunked transfer asks for windows; the wrong offset corrupts anything larger than a chunk.
      expect(Buffer.from(chunk).toString('utf8')).toBe('world');
    });

    it('carries bytes that are not text', async () => {
      const bytes = Buffer.from([0, 255, 13, 10, 128]);
      await fs.writeFile(
        '/docs/binary.bin',
        bytes.toString('base64'),
        'base64',
      );
      const source = createSharedFileSource(
        descriptor({ name: 'binary.bin', fileSize: bytes.length }),
        '/docs/binary.bin',
      );

      const chunk = await source.read(0, bytes.length);

      // Every chunk crosses the bridge as base64. A high byte or a newline mangled in that round trip would
      // corrupt every transfer, and the checksum would only catch it at the very end.
      expect([...chunk]).toEqual([0, 255, 13, 10, 128]);
    });

    it('describes itself with what the other device needs', async () => {
      const source = createSharedFileSource(descriptor(), '/docs/contract.pdf');

      expect(source.fileName).toBe('contract.pdf');
      expect(source.fileSize).toBe(11);
      expect(source.metadata).toMatchObject({ syncId: SYNC_ID, kind: 'file' });
    });

    it('checksums the file the way the receiver will', async () => {
      const bytes = Buffer.from('hello world');
      await fs.writeFile(
        '/docs/contract.pdf',
        bytes.toString('base64'),
        'base64',
      );
      const source = createSharedFileSource(descriptor(), '/docs/contract.pdf');

      await expect(source.checksum()).resolves.toBe(await checksumOf(bytes));
    });
  });

  describe('receiving one', () => {
    it('lands under its real name only once it is whole', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);

      expect(await receiving.prepare()).toBe(0);
      await receiving.write(0, Uint8Array.from(bytes.subarray(0, 6)));
      // Mid-transfer: nothing under the real name, so nothing can open it.
      expect(await fs.exists(stagedPath(bytes))).toBe(false);
      expect(await fs.exists(`${stagedPath(bytes)}.part`)).toBe(true);

      await receiving.write(6, Uint8Array.from(bytes.subarray(6)));

      await expect(receiving.finalize()).resolves.toBe(true);
      expect(await fs.readFile(stagedPath(bytes))).toBe('hello world');
      expect(await fs.exists(`${stagedPath(bytes)}.part`)).toBe(false);
    });

    it('tells the app about the file it can now show', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);
      await receiving.prepare();
      await receiving.write(0, Uint8Array.from(bytes));

      await receiving.finalize();

      // The Files list is drawn from this: landing bytes without announcing them is a transfer that completed
      // and never appeared.
      expect(receiving.staged).toEqual([{ path: stagedPath(bytes) }]);
      expect(receiving.releases).toBe(1);
    });

    it('writes down what the file is, so a relaunch can resume it', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);

      await receiving.prepare();

      // The sidecar is the only thing identifying a half-received file after the app restarts.
      await expect(
        readStagedSharedFileMetadata(SYNC_ID),
      ).resolves.toMatchObject({
        syncId: SYNC_ID,
        name: 'contract.pdf',
        fileSize: bytes.length,
      });
    });

    it('has nothing to remember for a transfer that never started', async () => {
      await expect(readStagedSharedFileMetadata(SYNC_ID)).resolves.toBeNull();
    });

    it('refuses a sidecar it cannot read', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);
      await receiving.prepare();
      const directory = stagedPath(bytes).slice(
        0,
        stagedPath(bytes).lastIndexOf('/'),
      );
      await fs.writeFile(
        `${directory}/metadata.json`,
        Buffer.from('{ truncated').toString('base64'),
        'base64',
      );

      // Null rather than a throw: one unreadable sidecar means that file cannot be resumed, not that the app
      // cannot start.
      await expect(readStagedSharedFileMetadata(SYNC_ID)).resolves.toBeNull();
    });

    it('does not accept a file whose bytes are not what was promised', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);
      await receiving.prepare();

      await receiving.write(0, Uint8Array.from(Buffer.from('hello WORLD')));

      // Same length, different bytes. A corrupt file under a name the user trusts would be forwarded from here.
      await expect(receiving.finalize()).resolves.toBe(false);
      expect(await fs.exists(stagedPath(bytes))).toBe(false);
      expect(receiving.staged).toEqual([]);
    });

    it('does not accept a file that stopped short', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);
      await receiving.prepare();
      await receiving.write(0, Uint8Array.from(bytes.subarray(0, 6)));

      await expect(receiving.finalize()).resolves.toBe(false);
    });

    it('accepts a file that is already whole under its real name', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);
      await fs.mkdir(
        stagedPath(bytes).slice(0, stagedPath(bytes).lastIndexOf('/')),
      );
      await fs.writeFile(stagedPath(bytes), bytes.toString('base64'), 'base64');

      // Nothing to rename - the bytes are where they belong and verified.
      await expect(receiving.finalize()).resolves.toBe(true);
      expect(receiving.staged).toHaveLength(1);
    });

    it('offers somewhere to stream to on the fast path', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);

      await expect(receiving.blobDestination()).resolves.toBe(
        `${stagedPath(bytes)}.part`,
      );
    });

    it('keeps each file in its own directory, so two of the same name do not collide', () => {
      const bytes = Buffer.from('hello world');
      const first = stagedPath(bytes, descriptor());
      const second = stagedPath(
        bytes,
        descriptor({ syncId: '8f7e6d5c-4b3a-4291-8073-6f5e4d3c2b1a' }),
      );

      // Two devices can send a file called the same thing; one landing on the other would show the user the
      // wrong document under the right name.
      expect(first).not.toBe(second);
      expect(first.slice(first.lastIndexOf('/'))).toBe(
        second.slice(second.lastIndexOf('/')),
      );
    });
  });

  describe('resuming one', () => {
    const bigBytes = (): Buffer => {
      const bytes = Buffer.alloc(CHUNK_SIZE * 2 + 9);
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = (index * 17 + 3) % 251;
      }
      return bytes;
    };

    it('carries on from a whole number of chunks, and finishes correctly', async () => {
      const bytes = bigBytes();
      const first = await sink(bytes);
      await first.prepare();
      await first.write(0, Uint8Array.from(bytes.subarray(0, CHUNK_SIZE)));
      await first.abort('the connection dropped', true);

      const second = await sink(bytes);
      const offset = await second.prepare();
      expect(offset).toBe(CHUNK_SIZE);
      await second.write(offset, Uint8Array.from(bytes.subarray(offset)));

      await expect(second.finalize()).resolves.toBe(true);
      // Byte-identical across the seam between two sinks: a resume that corrupts it is worse than a restart.
      expect(await fs.read(stagedPath(bytes), bytes.length, 0, 'base64')).toBe(
        bytes.toString('base64'),
      );
    });

    it('starts again when the partial is not a whole number of chunks', async () => {
      const bytes = bigBytes();
      const first = await sink(bytes);
      await first.prepare();
      await first.write(0, Uint8Array.from(bytes.subarray(0, CHUNK_SIZE + 5)));
      await first.abort('the connection dropped', true);

      // The sender only resumes on chunk boundaries, so continuing here would leave a hole the checksum catches
      // only at the very end of a multi-gigabyte transfer.
      const second = await sink(bytes);
      await expect(second.prepare()).resolves.toBe(0);
    });

    it('starts again when the partial is longer than the file being sent', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);
      const directory = stagedPath(bytes).slice(
        0,
        stagedPath(bytes).lastIndexOf('/'),
      );
      await fs.mkdir(directory);
      await fs.writeFile(
        `${stagedPath(bytes)}.part`,
        Buffer.from('a much longer leftover from something else').toString(
          'base64',
        ),
        'base64',
      );

      // Leftovers from a different transfer that used the same id. Continuing would append to a file already
      // too long.
      await expect(receiving.prepare()).resolves.toBe(0);
    });

    it('accepts a size the native layer reports as text', async () => {
      const bytes = Buffer.alloc(CHUNK_SIZE, 7);
      const first = await sink(bytes);
      await first.prepare();
      await first.write(0, Uint8Array.from(bytes));
      await first.abort('the connection dropped', true);
      // iOS's stat reports size as a string. A resume that compared it as a number would restart every
      // interrupted transfer from zero on that platform alone.
      const realStat = fs.stat.getMockImplementation() as (
        path: string,
      ) => Promise<{ size: number }>;
      fs.stat.mockImplementationOnce((async (path: string) => {
        const value = await realStat(path);
        // Size as a string, which is what iOS's stat actually returns.
        return { ...value, size: String(value.size) };
      }) as unknown as typeof fs.stat extends jest.Mock<infer R, infer A> ? (...args: A) => R : never);

      const second = await sink(bytes);
      await expect(second.prepare()).resolves.toBe(CHUNK_SIZE);
    });

    it('starts again when something that is not a file is in the way', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);
      const directory = stagedPath(bytes).slice(
        0,
        stagedPath(bytes).lastIndexOf('/'),
      );
      await fs.mkdir(`${directory}/contract.pdf.part`);

      // A directory where the partial belongs, left by something outside the app. Treated as no partial at all
      // rather than as a resumable length.
      await expect(receiving.prepare()).resolves.toBe(0);
    });

    it('starts again even when the unusable partial cannot be deleted', async () => {
      const bytes = bigBytes();
      const first = await sink(bytes);
      await first.prepare();
      await first.write(0, Uint8Array.from(bytes.subarray(0, CHUNK_SIZE + 5)));
      await first.abort('the connection dropped', true);
      fs.unlink.mockImplementationOnce(async () => {
        throw new Error('EPERM');
      });

      // On iOS a staged file can be briefly locked. The transfer restarts from zero anyway rather than failing:
      // the write that follows overwrites what could not be removed.
      const second = await sink(bytes);
      await expect(second.prepare()).resolves.toBe(0);
    });

    it('does not ask for a file it already has', async () => {
      const bytes = Buffer.from('hello world');
      const first = await sink(bytes);
      await first.prepare();
      await first.write(0, Uint8Array.from(bytes));
      await first.finalize();

      const second = await sink(bytes);

      // The offset IS the size, so the sender sends nothing: re-transferring a file the phone already holds is
      // the difference between instant and minutes on a hotspot.
      await expect(second.prepare()).resolves.toBe(bytes.length);
    });
  });

  describe('giving up on one', () => {
    it('keeps what it has when the transfer may be resumed', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);
      await receiving.prepare();
      await receiving.write(0, Uint8Array.from(bytes.subarray(0, 6)));

      await receiving.abort('the connection dropped', true);

      // The partial AND the sidecar survive, or a dropped connection costs everything transferred so far.
      expect(await fs.exists(`${stagedPath(bytes)}.part`)).toBe(true);
      await expect(
        readStagedSharedFileMetadata(SYNC_ID),
      ).resolves.toMatchObject({
        syncId: SYNC_ID,
      });
      expect(receiving.releases).toBe(1);
    });

    it('clears everything when the transfer is really over', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);
      await receiving.prepare();
      await receiving.write(0, Uint8Array.from(bytes.subarray(0, 6)));

      await receiving.abort('the user cancelled it', false);

      // Nothing left behind: a cancelled transfer that kept its bytes is storage the user cannot see.
      expect(await fs.exists(`${stagedPath(bytes)}.part`)).toBe(false);
      await expect(readStagedSharedFileMetadata(SYNC_ID)).resolves.toBeNull();
    });

    it('gives up the reservation exactly once', async () => {
      const bytes = Buffer.from('hello world');
      const receiving = await sink(bytes);
      await receiving.prepare();
      await receiving.write(0, Uint8Array.from(bytes));
      await receiving.finalize();

      await receiving.abort('too late', false);

      // The reservation holds disk space for this transfer; releasing twice would let a second transfer believe
      // there is room that has already been given away.
      expect(receiving.releases).toBe(1);
    });

    it('is safe to abort a transfer that never started', async () => {
      const receiving = await sink(Buffer.from('hello world'));

      await expect(
        receiving.abort('never started', false),
      ).resolves.toBeUndefined();
    });
  });

  it('makes the staging directory before anything arrives', async () => {
    await ensureSharedFileStage();

    // On a fresh install nothing has staged yet, and a transfer that arrived before the directory existed would
    // fail on something the app was supposed to have prepared.
    expect(
      await fs.exists(
        `${modelTransferFsBoundary.module.CachesDirectoryPath}/sync-shared-files`,
      ),
    ).toBe(true);
  });

  it('is happy deleting a staged file that is not there', async () => {
    await expect(removeStagedSharedFile(SYNC_ID)).resolves.toBeUndefined();
  });

  it('is happy when the filesystem refuses to delete a staged file', async () => {
    fs.unlink.mockImplementationOnce(async () => {
      throw new Error('EPERM');
    });

    // Deleting runs on the cancel and cleanup paths. A throw here would replace the real reason a transfer
    // ended with a tidying failure the user can do nothing about.
    await expect(removeStagedSharedFile(SYNC_ID)).resolves.toBeUndefined();
  });
});
