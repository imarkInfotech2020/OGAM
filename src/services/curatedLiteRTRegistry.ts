export interface CuratedLiteRTEntry {
  fileName: string;
  hfRepoId: string;
  commitHash: string;
  sizeBytes: number;
  displayName: string;
  highlight: string;
  liteRTVision: boolean;
  confirmDownload?: { title: string; message: string };
}

export const CURATED_LITERT_ENTRIES: readonly CuratedLiteRTEntry[] = [
  {
    fileName: 'gemma-4-E2B-it.litertlm',
    hfRepoId: 'litert-community/gemma-4-E2B-it-litert-lm',
    commitHash: '6e5c4f1e395deb959c494953478fa5cec4b8008f',
    sizeBytes: 2588147712,
    displayName: 'Gemma 4 E2B',
    highlight: 'Up to 2x faster than CPU via GPU',
    liteRTVision: true,
  },
  {
    fileName: 'gemma-4-E4B-it.litertlm',
    hfRepoId: 'litert-community/gemma-4-E4B-it-litert-lm',
    commitHash: '28299f30ee4d43294517a4ac93abd6163412f07f',
    sizeBytes: 3659530240,
    displayName: 'Gemma 4 E4B',
    highlight: 'Higher quality, same hardware efficiency as E2B',
    liteRTVision: true,
    confirmDownload: {
      title: 'Warning',
      message:
        "The model you have selected may exceed your device's memory and might not run reliably. For the best experience, try a smaller model.",
    },
  },
];

const CURATED_LITERT_INDEX: Map<string, CuratedLiteRTEntry> = new Map(
  CURATED_LITERT_ENTRIES.map(e => [e.fileName, e]),
);

export function getCuratedLiteRTEntry(fileName: string | undefined): CuratedLiteRTEntry | undefined {
  if (!fileName) return undefined;
  return CURATED_LITERT_INDEX.get(fileName);
}

export function buildCuratedLiteRTUrl(entry: CuratedLiteRTEntry): string {
  return `https://huggingface.co/${entry.hfRepoId}/resolve/${entry.commitHash}/${entry.fileName}?download=true`;
}
