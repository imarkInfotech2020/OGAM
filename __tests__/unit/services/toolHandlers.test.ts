/**
 * Tool Handlers Unit Tests
 *
 * Tests for the read_url tool handler.
 */

import { executeToolCall } from '../../../src/services/tools/handlers';

// Mock fetch globally
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

describe('read_url handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches URL and strips HTML tags', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '<html><body><h1>Hello</h1><p>World</p></body></html>',
    });

    const result = await executeToolCall({
      id: 'call_1',
      name: 'read_url',
      arguments: { url: 'https://example.com' },
    });

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Hello');
    expect(result.content).toContain('World');
    expect(result.content).not.toContain('<');
  });

  it('rejects invalid URL without http/https', async () => {
    const result = await executeToolCall({
      id: 'call_2',
      name: 'read_url',
      arguments: { url: 'ftp://example.com' },
    });

    expect(result.error).toContain('Invalid URL');
  });

  it('returns error for missing url parameter', async () => {
    const result = await executeToolCall({
      id: 'call_3',
      name: 'read_url',
      arguments: {},
    });

    expect(result.error).toContain('Missing required parameter: url');
  });

  it('truncates content exceeding 4000 characters', async () => {
    const longContent = 'A'.repeat(5000);
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => longContent,
    });

    const result = await executeToolCall({
      id: 'call_4',
      name: 'read_url',
      arguments: { url: 'https://example.com/long' },
    });

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('[Content truncated]');
    expect(result.content!.length).toBeLessThan(5000);
  });

  it('handles HTTP error responses', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await executeToolCall({
      id: 'call_5',
      name: 'read_url',
      arguments: { url: 'https://example.com/missing' },
    });

    expect(result.error).toContain('404');
  });

  it('handles fetch timeout/abort', async () => {
    mockFetch.mockRejectedValue(new Error('The operation was aborted'));

    const result = await executeToolCall({
      id: 'call_6',
      name: 'read_url',
      arguments: { url: 'https://example.com/slow' },
    });

    expect(result.error).toContain('aborted');
  });

  it('returns message for empty page content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '<html><body>   </body></html>',
    });

    const result = await executeToolCall({
      id: 'call_7',
      name: 'read_url',
      arguments: { url: 'https://example.com/empty' },
    });

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('no readable content');
  });

  it('strips surrounding quotes and angle brackets from URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '<p>Content</p>',
    });

    const result = await executeToolCall({
      id: 'call_9',
      name: 'read_url',
      arguments: { url: '"https://example.com"' },
    });

    expect(result.error).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.any(Object),
    );
  });

  it('includes durationMs in result', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '<p>Test</p>',
    });

    const result = await executeToolCall({
      id: 'call_8',
      name: 'read_url',
      arguments: { url: 'https://example.com' },
    });

    expect(result.durationMs).toBeDefined();
    expect(typeof result.durationMs).toBe('number');
  });
});
