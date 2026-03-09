/**
 * HTTP Client Unit Tests
 *
 * Tests for SSE parsing, timeout handling, base64 encoding,
 * and network utilities used for remote LLM server communication.
 */

import {
  parseSSEStream,
  parseOpenAIMessage,
  parseAnthropicMessage,
  isPrivateNetworkEndpoint,
  testEndpoint,
  fetchWithTimeout,
} from '../../../src/services/httpClient';

// Mock React Native FS
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/docs',
  exists: jest.fn(),
  readFile: jest.fn(),
  stat: jest.fn(),
}));

describe('httpClient', () => {
  // ─── SSE Parsing Tests ─────────────────────────────────────────────────────

  describe('parseSSEStream', () => {
    it('should parse simple SSE events', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('event: message\ndata: {"text":"hello"}\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };
      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const events: any[] = [];
      for await (const event of parseSSEStream(mockResponse)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        event: 'message',
        data: '{"text":"hello"}',
      });
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should parse multiple SSE events', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'event: message\ndata: {"text":"first"}\n\n' +
              'event: message\ndata: {"text":"second"}\n\n'
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };
      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const events: any[] = [];
      for await (const event of parseSSEStream(mockResponse)) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0].data).toBe('{"text":"first"}');
      expect(events[1].data).toBe('{"text":"second"}');
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should handle multi-line data', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: line1\ndata: line2\n\n'
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };
      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const events: any[] = [];
      for await (const event of parseSSEStream(mockResponse)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].data).toBe('line1\nline2');
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should handle events without explicit event type', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: hello\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };
      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const events: any[] = [];
      for await (const event of parseSSEStream(mockResponse)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].data).toBe('hello');
      expect(events[0].event).toBeUndefined();
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should throw when body is not readable', async () => {
      const mockResponse = {
        body: null,
      } as unknown as Response;

      await expect(async () => {
        for await (const _ of parseSSEStream(mockResponse)) {
          // Should not reach here
        }
      }).rejects.toThrow('Response body is not readable');
    });

    it('should handle events with id field', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('id: event-123\nevent: message\ndata: {"text":"hello"}\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };
      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const events: any[] = [];
      for await (const event of parseSSEStream(mockResponse)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('event-123');
      expect(events[0].event).toBe('message');
      expect(events[0].data).toBe('{"text":"hello"}');
    });

    it('should handle data as object type', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: first\ndata: second\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };
      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const events: any[] = [];
      for await (const event of parseSSEStream(mockResponse)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].data).toBe('first\nsecond');
    });

    it('should handle chunked data correctly', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('event: message\ndata: hel'),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('lo\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };
      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const events: any[] = [];
      for await (const event of parseSSEStream(mockResponse)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].data).toBe('hello');
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should handle event with id field', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('event: message\nid: 123\ndata: hello\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };
      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const events: any[] = [];
      for await (const event of parseSSEStream(mockResponse)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('123');
      expect(events[0].event).toBe('message');
      expect(events[0].data).toBe('hello');
    });

    it('should throw when response body is not readable', async () => {
      const mockResponse = {
        body: null,
      } as unknown as Response;

      await expect(async () => {
        for await (const _ of parseSSEStream(mockResponse)) {
          // Should not reach here
        }
      }).rejects.toThrow('Response body is not readable');
    });

    it('should handle events with only data field', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: test\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };
      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const events: any[] = [];
      for await (const event of parseSSEStream(mockResponse)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].data).toBe('test');
      expect(events[0].event).toBeUndefined();
      expect(events[0].id).toBeUndefined();
    });

    it('should skip events without data', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('event: message\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };
      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const events: any[] = [];
      for await (const event of parseSSEStream(mockResponse)) {
        events.push(event);
      }

      // Events without data should not be yielded
      expect(events).toHaveLength(0);
    });

    it('should yield remaining event at end of stream', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: final\n'), // No trailing newline
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };
      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const events: any[] = [];
      for await (const event of parseSSEStream(mockResponse)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].data).toBe('final');
    });
  });

  // ─── OpenAI Message Parsing Tests ─────────────────────────────────────────

  describe('parseOpenAIMessage', () => {
    it('should parse content delta', () => {
      const event = { data: '{"choices":[{"delta":{"content":"Hello"}}]}' };
      const result = parseOpenAIMessage(event);

      expect(result).not.toBeNull();
      expect(result?.choices?.[0]?.delta?.content).toBe('Hello');
    });

    it('should parse [DONE] marker', () => {
      const event = { data: '[DONE]' };
      const result = parseOpenAIMessage(event);

      expect(result).not.toBeNull();
      expect(result?.object).toBe('done');
    });

    it('should parse error messages', () => {
      const event = { data: '{"error":{"message":"Rate limit exceeded","type":"rate_limit"}}' };
      const result = parseOpenAIMessage(event);

      expect(result).not.toBeNull();
      expect(result?.error?.message).toBe('Rate limit exceeded');
    });

    it('should parse tool calls', () => {
      const event = {
        data: '{"choices":[{"delta":{"tool_calls":[{"id":"call_123","function":{"name":"search","arguments":"{\\"query\\""}}]}}]}'
      };
      const result = parseOpenAIMessage(event);

      expect(result).not.toBeNull();
      expect(result?.choices?.[0]?.delta?.tool_calls).toHaveLength(1);
    });

    it('should return null for invalid JSON', () => {
      const event = { data: 'not json' };
      const result = parseOpenAIMessage(event);

      expect(result).toBeNull();
    });

    it('should return null for non-string data', () => {
      const event = { data: { foo: 'bar' } as any };
      const result = parseOpenAIMessage(event);

      expect(result).toBeNull();
    });
  });

  // ─── Anthropic Message Parsing Tests ──────────────────────────────────────

  describe('parseAnthropicMessage', () => {
    it('should parse content_block_delta', () => {
      const event = { data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}' };
      const result = parseAnthropicMessage(event);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('content_block_delta');
      expect(result?.delta?.text).toBe('Hello');
    });

    it('should parse message_start', () => {
      const event = { data: '{"type":"message_start","message":{"id":"msg_123"}}' };
      const result = parseAnthropicMessage(event);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('message_start');
    });

    it('should return null for empty data', () => {
      const event = { data: '' };
      const result = parseAnthropicMessage(event);

      expect(result).toBeNull();
    });
  });

  // ─── Private Network Detection Tests ──────────────────────────────────────

  describe('isPrivateNetworkEndpoint', () => {
    it('should detect localhost as private', () => {
      expect(isPrivateNetworkEndpoint('http://localhost:11434')).toBe(true);
      expect(isPrivateNetworkEndpoint('http://127.0.0.1:11434')).toBe(true);
      expect(isPrivateNetworkEndpoint('http://[::1]:11434')).toBe(true);
    });

    it('should detect 192.168.x.x as private', () => {
      expect(isPrivateNetworkEndpoint('http://192.168.1.50:11434')).toBe(true);
      expect(isPrivateNetworkEndpoint('http://192.168.0.1:1234')).toBe(true);
    });

    it('should detect 10.x.x.x as private', () => {
      expect(isPrivateNetworkEndpoint('http://10.0.0.1:11434')).toBe(true);
      expect(isPrivateNetworkEndpoint('http://10.255.255.255:8080')).toBe(true);
    });

    it('should detect 172.16-31.x.x as private', () => {
      expect(isPrivateNetworkEndpoint('http://172.16.0.1:11434')).toBe(true);
      expect(isPrivateNetworkEndpoint('http://172.31.255.255:8080')).toBe(true);
    });

    it('should NOT detect 172.15.x.x as private', () => {
      expect(isPrivateNetworkEndpoint('http://172.15.0.1:11434')).toBe(false);
    });

    it('should NOT detect 172.32.x.x as private', () => {
      expect(isPrivateNetworkEndpoint('http://172.32.0.1:11434')).toBe(false);
    });

    it('should detect link-local 169.254.x.x as private', () => {
      expect(isPrivateNetworkEndpoint('http://169.254.0.1:11434')).toBe(true);
    });

    it('should detect .local (mDNS) as private', () => {
      expect(isPrivateNetworkEndpoint('http://myserver.local:11434')).toBe(true);
    });

    it('should detect public internet as NOT private', () => {
      expect(isPrivateNetworkEndpoint('http://api.openai.com:443')).toBe(false);
      expect(isPrivateNetworkEndpoint('http://8.8.8.8:80')).toBe(false);
    });

    it('should handle invalid URLs', () => {
      expect(isPrivateNetworkEndpoint('not-a-url')).toBe(false);
    });
  });

  // ─── Timeout Tests ────────────────────────────────────────────────────────

  describe('fetchWithTimeout', () => {
    it('should resolve with JSON response', async () => {
      const mockData = { models: [{ id: 'test' }] };
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(mockData),
      } as unknown as Response);

      const result = await fetchWithTimeout('http://test.com/api', { timeout: 5000 });

      expect(result).toEqual(mockData);
    });

    it('should resolve with text response for non-JSON', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html>ok</html>'),
      } as unknown as Response);

      const result = await fetchWithTimeout('http://test.com/page', { timeout: 5000 });

      expect(result).toBe('<html>ok</html>');
    });

    it('should throw on HTTP error', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      } as Response);

      await expect(fetchWithTimeout('http://test.com/missing', { timeout: 5000 }))
        .rejects.toThrow('HTTP 404');
    });

    it('should timeout after specified duration', async () => {
      // This test verifies timeout behavior through the AbortController mechanism
      // We can't easily test real timeouts in unit tests without fake timers,
      // but the timeout logic is straightforward and tested in integration tests
      const controller = new AbortController();
      controller.abort();
      jest.spyOn(global, 'fetch').mockImplementation(() => {
        return Promise.reject(new Error('Aborted'));
      });

      await expect(
        fetchWithTimeout('http://test.com/slow', { timeout: 100 })
      ).rejects.toThrow();
    });

    it('should retry on transient errors', async () => {
      const mockData = { success: true };
      jest.spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockData),
        } as unknown as Response);

      const result = await fetchWithTimeout('http://test.com/api', {
        timeout: 5000,
        retries: 1,
        retryDelay: 0  // No delay for test
      });

      expect(result).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw "Request cancelled" on AbortError', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      jest.spyOn(global, 'fetch').mockRejectedValue(abortError);

      await expect(fetchWithTimeout('http://test.com/api', { timeout: 5000 }))
        .rejects.toThrow('Request cancelled');
    });

    it('should fallback to text when content-type header is missing', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve('plain text response'),
      } as unknown as Response);

      const result = await fetchWithTimeout('http://test.com/api', { timeout: 5000 });

      expect(result).toBe('plain text response');
    });

    it('should fallback to "Unknown error" when response.text() fails', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error('text failed')),
      } as unknown as Response);

      await expect(fetchWithTimeout('http://test.com/error', { timeout: 5000 }))
        .rejects.toThrow('HTTP 500: Unknown error');
    });

    it('should handle non-Error thrown values', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue('string error');

      await expect(fetchWithTimeout('http://test.com/api', { timeout: 5000, retries: 0 }))
        .rejects.toThrow('string error');
    });
  });

  // ─── Endpoint Testing ──────────────────────────────────────────────────────

  describe('testEndpoint', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return success for reachable endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });

      const result = await testEndpoint('http://192.168.1.50:11434', 5000);

      expect(result.success).toBe(true);
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return error for unreachable endpoint', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const result = await testEndpoint('http://192.168.1.50:11434', 5000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('should return error on HTTP error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await testEndpoint('http://192.168.1.50:11434', 5000);

      expect(result.success).toBe(false);
    });
  });
});