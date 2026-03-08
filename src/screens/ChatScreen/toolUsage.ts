const TOOL_TRIGGER_PATTERNS = {
  web_search: [
    /\b(latest|current|today|news|weather|stock|price|score|results?|headlines?)\b/i,
    /\b(search|look up|find online|google)\b/i,
  ],
  calculator: [
    /^\s*[-(]?\d[\d\s+\-*/^%.()]*\s*$/,
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
    return patterns?.some((pattern) => pattern.test(trimmed)) ?? false;
  });
}
