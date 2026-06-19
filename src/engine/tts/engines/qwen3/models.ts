/**
 * Qwen3-TTS model asset definitions.
 *
 * Three-model pipeline: Talker (LLM) + Predictor + Codec decoder.
 * GGUF conversions via LunaVox project.
 *
 * TODO: Verify exact URLs and file sizes once we commit to a quant level.
 */
import type { ModelAsset } from '../../../types';

export const QWEN3_TTS_TALKER: ModelAsset = {
  id: 'talker',
  label: 'Talker Model (0.6B)',
  url: 'https://huggingface.co/wkwong/Lunavox-Qwen3-TTS-GGUF/resolve/main/base_small/qwen3_tts_talker.q5_k.gguf',
  sizeBytes: 450 * 1024 * 1024, // ~450MB Q5_K estimate
  filename: 'qwen3-tts-talker-q5k.gguf',
};

export const QWEN3_TTS_PREDICTOR: ModelAsset = {
  id: 'predictor',
  label: 'Predictor Model',
  url: 'https://huggingface.co/wkwong/Lunavox-Qwen3-TTS-GGUF/resolve/main/base_small/qwen3_tts_predictor.q8_0.gguf',
  sizeBytes: 150 * 1024 * 1024, // ~150MB Q8 estimate
  filename: 'qwen3-tts-predictor-q8.gguf',
};

export const QWEN3_TTS_CODEC: ModelAsset = {
  id: 'codec',
  label: 'Audio Codec',
  url: 'https://huggingface.co/wkwong/Lunavox-Qwen3-TTS-GGUF/resolve/main/base_small/qwen3_tts_decoder.fp16.onnx',
  sizeBytes: 50 * 1024 * 1024, // ~50MB estimate
  filename: 'qwen3-tts-decoder-fp16.onnx',
};

export const QWEN3_TTS_ASSETS: ModelAsset[] = [
  QWEN3_TTS_TALKER,
  QWEN3_TTS_PREDICTOR,
  QWEN3_TTS_CODEC,
];

export const QWEN3_TTS_SAMPLE_RATE = 24000;
