export interface MultimodalSupport {
  vision: boolean;
  audio: boolean;
}

export interface LLMPerformanceSettings {
  nThreads: number;
  nBatch: number;
  contextLength: number;
}

export interface LLMPerformanceStats {
  lastTokensPerSecond: number;
  lastDecodeTokensPerSecond: number;
  lastTimeToFirstToken: number;
  lastGenerationTime: number;
  lastTokenCount: number;
  /** Native prompt size for the most recent completion, including offered tool schemas. */
  lastPromptTokenCount?: number;
  /** True when the completion hit the n_predict cap without an EOS token (cut off mid-output, B15). */
  lastTruncated?: boolean;
}
