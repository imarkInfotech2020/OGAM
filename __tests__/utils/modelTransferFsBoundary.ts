import { createHash } from 'node:crypto';
import { Volume } from 'memfs';

const DocumentDirectoryPath = '/docs';
let volume = Volume.fromJSON({});

function normalize(path: string): string {
  return path.replace(/^file:\/\//, '').replace(/\/+$/, '') || '/';
}

function reset(): void {
  volume = Volume.fromJSON({});
  volume.mkdirSync(DocumentDirectoryPath, { recursive: true });
}

function stat(path: string) {
  const normalized = normalize(path);
  const value = volume.statSync(normalized);
  return {
    path: normalized,
    name: normalized.slice(normalized.lastIndexOf('/') + 1),
    size: Number(value.size),
    isFile: () => value.isFile(),
    isDirectory: () => value.isDirectory(),
    mtime: value.mtime,
  };
}

reset();

const module = {
  DocumentDirectoryPath,
  CachesDirectoryPath: '/caches',
  ExternalDirectoryPath: '/external',
  MainBundlePath: '/bundle',
  exists: jest.fn(async (path: string) => volume.existsSync(normalize(path))),
  mkdir: jest.fn(async (path: string) => {
    volume.mkdirSync(normalize(path), { recursive: true });
  }),
  stat: jest.fn(async (path: string) => stat(path)),
  readDir: jest.fn(async (path: string) => {
    const directory = normalize(path);
    return (volume.readdirSync(directory) as string[]).map(name =>
      stat(`${directory}/${name}`),
    );
  }),
  writeFile: jest.fn(async (path: string, contents: string, encoding?: string) => {
    const normalized = normalize(path);
    volume.mkdirSync(
      normalized.slice(0, normalized.lastIndexOf('/')) || '/',
      { recursive: true },
    );
    volume.writeFileSync(
      normalized,
      Buffer.from(contents, encoding === 'base64' ? 'base64' : 'utf8'),
    );
  }),
  write: jest.fn(
    async (
      path: string,
      contents: string,
      position = 0,
      encoding?: string,
    ) => {
      const normalized = normalize(path);
      const incoming = Buffer.from(
        contents,
        encoding === 'base64' ? 'base64' : 'utf8',
      );
      const current = volume.existsSync(normalized)
        ? (volume.readFileSync(normalized) as Buffer)
        : Buffer.alloc(0);
      const next = Buffer.alloc(
        Math.max(current.length, position + incoming.length),
      );
      current.copy(next);
      incoming.copy(next, position);
      volume.writeFileSync(normalized, next);
    },
  ),
  read: jest.fn(
    async (
      path: string,
      length?: number,
      position = 0,
      encoding?: string,
    ) => {
      const contents = volume.readFileSync(normalize(path)) as Buffer;
      const selected = contents.subarray(
        position,
        length == null ? undefined : position + length,
      );
      return selected.toString(
        encoding === 'base64'
          ? 'base64'
          : encoding === 'ascii'
            ? 'ascii'
            : 'utf8',
      );
    },
  ),
  readFile: jest.fn(async (path: string) =>
    volume.readFileSync(normalize(path), 'utf8'),
  ),
  unlink: jest.fn(async (path: string) => {
    volume.rmSync(normalize(path), { recursive: true, force: true });
  }),
  moveFile: jest.fn(async (from: string, to: string) => {
    volume.renameSync(normalize(from), normalize(to));
  }),
  copyFile: jest.fn(async (from: string, to: string) => {
    volume.copyFileSync(normalize(from), normalize(to));
  }),
  hash: jest.fn(async (path: string, algorithm: string) =>
    createHash(algorithm)
      .update(volume.readFileSync(normalize(path)))
      .digest('hex'),
  ),
  getFSInfo: jest.fn(async () => ({
    freeSpace: 100 * 1024 * 1024 * 1024,
    totalSpace: 128 * 1024 * 1024 * 1024,
  })),
  downloadFile: jest.fn(() => ({
    jobId: 1,
    promise: Promise.resolve({ statusCode: 200, bytesWritten: 0 }),
  })),
  stopDownload: jest.fn(),
};

export const modelTransferFsBoundary = {
  module,
  DocumentDirectoryPath,
  reset,
  readAscii: async (path: string, length: number, position = 0) =>
    module.read(path, length, position, 'ascii'),
  exists: (path: string) => module.exists(path),
};
