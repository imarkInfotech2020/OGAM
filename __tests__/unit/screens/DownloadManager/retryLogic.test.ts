/**
 * Tests for the retry helper branching logic extracted from useDownloadManager.ts.
 * These functions are not exported so we test the logic directly by mirroring
 * the branch conditions, following the same pattern as recoveredModelFilter.test.ts.
 */

// --- parseEntryMetadata logic ---

function parseEntryMetadata(entry: { metadataJson?: string }): Record<string, any> | null {
  if (!entry.metadataJson) return null;
  try {
    return JSON.parse(entry.metadataJson);
  } catch {
    return null;
  }
}

// --- retryIosImageDownload guard logic ---

function shouldSkipIosImageRetry(meta: Record<string, any> | null): boolean {
  if (!meta) return true;
  const isZip = meta.imageDownloadType === 'zip';
  if (isZip && !meta.imageModelDownloadUrl) return true;
  return false;
}

// --- retryIosTextDownload mmProjFile logic ---

function buildMmProjFile(
  entry: { mmProjFileName?: string; mmProjFileSize?: number },
  meta: Record<string, any> | null,
): { name: string; size: number; downloadUrl: string } | undefined {
  if (entry.mmProjFileName && entry.mmProjFileSize && meta?.mmProjDownloadUrl) {
    return { name: entry.mmProjFileName, size: entry.mmProjFileSize, downloadUrl: meta.mmProjDownloadUrl };
  }
  return undefined;
}

describe('parseEntryMetadata', () => {
  it('returns null when metadataJson is absent', () => {
    expect(parseEntryMetadata({})).toBeNull();
  });

  it('returns null when metadataJson is invalid JSON', () => {
    expect(parseEntryMetadata({ metadataJson: '{bad json' })).toBeNull();
  });

  it('returns parsed object when metadataJson is valid', () => {
    expect(parseEntryMetadata({ metadataJson: '{"imageDownloadType":"zip"}' })).toEqual({ imageDownloadType: 'zip' });
  });
});

describe('retryIosImageDownload guard', () => {
  it('skips when meta is null (no metadataJson on entry)', () => {
    expect(shouldSkipIosImageRetry(null)).toBe(true);
  });

  it('skips when download is zip but imageModelDownloadUrl is missing', () => {
    expect(shouldSkipIosImageRetry({ imageDownloadType: 'zip' })).toBe(true);
  });

  it('skips when download is zip and imageModelDownloadUrl is empty string', () => {
    expect(shouldSkipIosImageRetry({ imageDownloadType: 'zip', imageModelDownloadUrl: '' })).toBe(true);
  });

  it('does not skip when download is zip and imageModelDownloadUrl is present', () => {
    expect(shouldSkipIosImageRetry({
      imageDownloadType: 'zip',
      imageModelDownloadUrl: 'https://example.com/model.zip',
    })).toBe(false);
  });

  it('does not skip for multifile download even without imageModelDownloadUrl', () => {
    expect(shouldSkipIosImageRetry({ imageDownloadType: 'multifile' })).toBe(false);
  });
});

describe('retryIosTextDownload mmProjFile construction', () => {
  it('returns undefined when mmProjFileName is absent', () => {
    expect(buildMmProjFile({}, { mmProjDownloadUrl: 'https://example.com/mmproj.gguf' })).toBeUndefined();
  });

  it('returns undefined when mmProjFileSize is absent', () => {
    expect(buildMmProjFile({ mmProjFileName: 'model-mmproj.gguf' }, { mmProjDownloadUrl: 'https://example.com/mmproj.gguf' })).toBeUndefined();
  });

  it('returns undefined when mmProjDownloadUrl is absent from meta', () => {
    expect(buildMmProjFile({ mmProjFileName: 'model-mmproj.gguf', mmProjFileSize: 1000 }, null)).toBeUndefined();
  });

  it('returns undefined when meta has no mmProjDownloadUrl', () => {
    expect(buildMmProjFile({ mmProjFileName: 'model-mmproj.gguf', mmProjFileSize: 1000 }, {})).toBeUndefined();
  });

  it('returns mmProjFile object when all fields are present', () => {
    const result = buildMmProjFile(
      { mmProjFileName: 'model-mmproj.gguf', mmProjFileSize: 2000 },
      { mmProjDownloadUrl: 'https://example.com/mmproj.gguf' },
    );
    expect(result).toEqual({
      name: 'model-mmproj.gguf',
      size: 2000,
      downloadUrl: 'https://example.com/mmproj.gguf',
    });
  });
});
