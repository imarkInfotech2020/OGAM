/**
 * OuteTTS model definitions.
 *
 * Moved from constants/ttsModels.ts into the engine boundary.
 */
import type { ModelAsset } from '../../../types';

export const OUTETTS_BACKBONE: ModelAsset = {
  id: 'backbone',
  label: 'Voice Model',
  url: 'https://huggingface.co/OuteAI/OuteTTS-0.3-500M-GGUF/resolve/main/OuteTTS-0.3-500M-Q4_K_M.gguf',
  sizeBytes: 454 * 1024 * 1024,
  filename: 'OuteTTS-0.3-500M-Q4_K_M.gguf',
};

export const OUTETTS_VOCODER: ModelAsset = {
  id: 'vocoder',
  label: 'Audio Decoder',
  url: 'https://huggingface.co/ggml-org/WavTokenizer/resolve/main/WavTokenizer-Large-75-Q5_1.gguf',
  sizeBytes: 73 * 1024 * 1024,
  filename: 'WavTokenizer-Large-75-Q5_1.gguf',
};

export const OUTETTS_ASSETS: ModelAsset[] = [OUTETTS_BACKBONE, OUTETTS_VOCODER];

export const OUTETTS_SAMPLE_RATE = 24000;
