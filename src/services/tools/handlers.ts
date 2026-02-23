import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { ToolCall, ToolResult } from './types';
import logger from '../../utils/logger';

export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  const start = Date.now();
  try {
    let content: string;
    switch (call.name) {
      case 'web_search':
        content = await handleWebSearch(call.arguments.query);
        break;
      case 'calculator':
        content = handleCalculator(call.arguments.expression);
        break;
      case 'get_current_datetime':
        content = handleGetDatetime(call.arguments.timezone);
        break;
      case 'get_device_info':
        content = await handleGetDeviceInfo(call.arguments.info_type);
        break;
      default:
        return {
          toolCallId: call.id,
          name: call.name,
          content: '',
          error: `Unknown tool: ${call.name}`,
          durationMs: Date.now() - start,
        };
    }
    return {
      toolCallId: call.id,
      name: call.name,
      content,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    logger.error(`[Tools] Error executing ${call.name}:`, error);
    return {
      toolCallId: call.id,
      name: call.name,
      content: '',
      error: error.message || 'Tool execution failed',
      durationMs: Date.now() - start,
    };
  }
}

async function handleWebSearch(query: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    // Use DuckDuckGo HTML endpoint (more reliable than Lite)
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    });
    const html = await response.text();
    const results = parseDuckDuckGoResults(html);

    if (results.length === 0) {
      return `No results found for "${query}".`;
    }

    return results
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.title}${r.url ? `\n   ${r.url}` : ''}\n   ${r.snippet}`)
      .join('\n\n');
  } finally {
    clearTimeout(timeout);
  }
}

function parseDuckDuckGoResults(html: string): Array<{ title: string; snippet: string; url?: string }> {
  const results: Array<{ title: string; snippet: string; url?: string }> = [];

  // DuckDuckGo HTML uses class="result" for each result block
  // Each result has: <a class="result__a"> for title, <a class="result__snippet"> for snippet
  const resultBlocks = html.split(/class="result\s/).slice(1); // split on result blocks

  for (const block of resultBlocks) {
    if (results.length >= 5) break;

    // Title: <a class="result__a" href="...">Title Text</a>
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
    const title = titleMatch ? decodeHTMLEntities(titleMatch[1].trim()) : '';

    // URL: extract from result__url or result__a href
    const urlMatch = block.match(/class="result__url"[^>]*>([^<]+)/) ||
                     block.match(/class="result__a"\s+href="([^"]+)"/);
    const url = urlMatch ? decodeHTMLEntities(urlMatch[1].trim()) : '';

    // Snippet: <a class="result__snippet">...</a> or <td class="result-snippet">
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/) ||
                         block.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/);
    let snippet = '';
    if (snippetMatch) {
      // Strip any remaining HTML tags from snippet
      snippet = decodeHTMLEntities(snippetMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    if (title || snippet) {
      results.push({ title: title || '(no title)', snippet: snippet || '(no snippet)', url });
    }
  }

  // Fallback: try matching any anchor with substantial text
  if (results.length === 0) {
    const linkPattern = /<a[^>]*href="(https?:\/\/(?!duckduckgo)[^"]*)"[^>]*>([^<]{10,})<\/a>/g;
    let match;
    while ((match = linkPattern.exec(html)) !== null && results.length < 5) {
      const linkUrl = match[1];
      const title = decodeHTMLEntities(match[2].trim());
      if (!title.includes('DuckDuckGo')) {
        results.push({ title, snippet: '', url: linkUrl });
      }
    }
  }

  return results;
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function handleCalculator(expression: string): string {
  // Validate: only allow numbers, operators, parentheses, whitespace, decimal points
  const sanitized = expression.replace(/\s/g, '');
  if (!/^[0-9+\-*/().,%^]+$/.test(sanitized)) {
    throw new Error('Invalid expression: only numbers and basic operators (+, -, *, /, ^, %, parentheses) are allowed');
  }

  // Replace ^ with ** for exponentiation
  const jsExpression = sanitized.replace(/\^/g, '**');

  // eslint-disable-next-line no-new-func
  const result = new Function(`"use strict"; return (${jsExpression})`)();

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Expression did not evaluate to a finite number');
  }

  return `${expression} = ${result}`;
}

function handleGetDatetime(timezone?: string): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'long',
  };

  if (timezone) {
    options.timeZone = timezone;
  }

  try {
    const formatted = new Intl.DateTimeFormat('en-US', options).format(now);
    const isoString = now.toISOString();
    return `Current date and time: ${formatted}\nISO 8601: ${isoString}\nUnix timestamp: ${Math.floor(now.getTime() / 1000)}`;
  } catch {
    // Invalid timezone fallback
    const formatted = now.toString();
    return `Current date and time: ${formatted}\nNote: requested timezone "${timezone}" was invalid, showing device local time.`;
  }
}

async function handleGetDeviceInfo(infoType?: string): Promise<string> {
  const type = infoType || 'all';
  const parts: string[] = [];

  if (type === 'all' || type === 'memory') {
    try {
      const totalMemory = await DeviceInfo.getTotalMemory();
      const usedMemory = await DeviceInfo.getUsedMemory();
      const available = totalMemory - usedMemory;
      parts.push(
        `Memory:\n  Total: ${formatBytes(totalMemory)}\n  Used: ${formatBytes(usedMemory)}\n  Available: ${formatBytes(available)}`,
      );
    } catch {
      parts.push('Memory: unavailable');
    }
  }

  if (type === 'all' || type === 'storage') {
    try {
      const freeDisk = await DeviceInfo.getFreeDiskStorage();
      const totalDisk = await DeviceInfo.getTotalDiskCapacity();
      parts.push(
        `Storage:\n  Total: ${formatBytes(totalDisk)}\n  Free: ${formatBytes(freeDisk)}`,
      );
    } catch {
      parts.push('Storage: unavailable');
    }
  }

  if (type === 'all' || type === 'battery') {
    try {
      const level = await DeviceInfo.getBatteryLevel();
      const charging = await DeviceInfo.isBatteryCharging();
      parts.push(
        `Battery: ${Math.round(level * 100)}%${charging ? ' (charging)' : ''}`,
      );
    } catch {
      parts.push('Battery: unavailable');
    }
  }

  if (type === 'all') {
    parts.push(
      `Device: ${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`,
      `OS: ${Platform.OS} ${DeviceInfo.getSystemVersion()}`,
    );
  }

  return parts.join('\n\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
