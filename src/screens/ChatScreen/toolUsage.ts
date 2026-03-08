const SIMPLE_CALC_CHARS = new Set([' ', '+', '-', '*', '/', '^', '%', '.', '(', ')']);

function looksLikeSimpleMathExpression(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !/^[(-]?\d/.test(trimmed)) return false;

  for (const char of trimmed) {
    if ((char >= '0' && char <= '9') || SIMPLE_CALC_CHARS.has(char)) continue;
    return false;
  }

  return true;
}

const TOOL_TRIGGER_PATTERNS = {
  web_search: [
    /\b(latest|current|today|news|weather|stock|price|score|results?|headlines?)\b/i,
    /\b(search|look up|find online|google)\b/i,
  ],
  calculator: [
    looksLikeSimpleMathExpression,
    /\b(calculate|compute|solve|evaluate)\b/i,
    /\b\d+\s*(plus|minus|times|multiplied by|divided by)\s*\d+\b/i,
  ],
  get_current_datetime: [/\b(time|date|day|month|year|timezone)\b/i, /\bwhat('?s| is) the time\b/i],
  get_device_info: [/\b(device|phone|hardware|battery|storage|memory|ram|disk)\b/i],
  read_url: [/\bhttps?:\/\/\S+/i, /\b(read|open|summarize|fetch)\s+(this\s+)?(url|link|page|website)\b/i],
} as const;

export function shouldUseToolsForMessage(messageText: string, enabledTools: string[]): boolean {
  const trimmed = messageText.trim();
  if (!trimmed || enabledTools.length === 0) return false;
  return enabledTools.some((toolId) => {
    const patterns = TOOL_TRIGGER_PATTERNS[toolId as keyof typeof TOOL_TRIGGER_PATTERNS];
    return patterns?.some((pattern) => typeof pattern === 'function' ? pattern(trimmed) : pattern.test(trimmed)) ?? false;
  });
}
