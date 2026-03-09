const CONTROL_TOKEN_PATTERNS: RegExp[] = [
  /<\|im_start\|>\s*(?:system|assistant|user|tool)?\s*\n?/gi,
  /<\|im_end\|>\s*\n?/gi,
  /<\|end\|>/gi,
  /<\|eot_id\|>/gi,
  /<\/s>/gi,
  /<tool_call>[\s\S]*?<\/tool_call>\s*/g,
];

// Patterns for channel-based thinking format (used by some models like Qwen)
const CHANNEL_ANALYSIS_START = /<\|channel\|>analysis<\|message\|>/gi;
const CHANNEL_FINAL_START = /<\|channel\|>final<\|message\|>/gi;

export function stripControlTokens(content: string): string {
  let result = CONTROL_TOKEN_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, ''), content);
  // Remove channel markers but preserve the content after them
  result = result.replace(CHANNEL_ANALYSIS_START, '');
  result = result.replace(CHANNEL_FINAL_START, '');
  return result;
}