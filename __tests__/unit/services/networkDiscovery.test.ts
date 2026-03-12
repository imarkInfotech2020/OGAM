/**
 * Network Discovery Unit Tests
 *
 * Tests for LAN LLM server discovery (Ollama, LM Studio, LocalAI).
 */

// Mock react-native-device-info
jest.mock('react-native-device-info', () => ({
  getIpAddress: jest.fn(),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { getIpAddress } from 'react-native-device-info';
import { discoverLANServers } from '../../../src/services/networkDiscovery';

const mockGetIpAddress = getIpAddress as jest.Mock;

describe('discoverLANServers', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    (global as any).fetch = mockFetch;
    // Default: no servers respond
    mockFetch.mockResolvedValue(new Response(null, { status: 503 }));
  });

  // ==========================================================================
  // Happy path
  // ==========================================================================
  it('returns empty array when getIpAddress returns empty string', async () => {
    mockGetIpAddress.mockResolvedValue('');
    const result = await discoverLANServers();
    expect(result).toEqual([]);
  });

  it('returns empty array when getIpAddress returns null', async () => {
    mockGetIpAddress.mockResolvedValue(null);
    const result = await discoverLANServers();
    expect(result).toEqual([]);
  });

  it('returns empty array when IP has wrong format', async () => {
    mockGetIpAddress.mockResolvedValue('not-an-ip');
    const result = await discoverLANServers();
    expect(result).toEqual([]);
  });

  it('returns empty array when no servers are discovered', async () => {
    mockGetIpAddress.mockResolvedValue('192.168.1.42'); // NOSONAR
    // All probes return error/503
    mockFetch.mockResolvedValue({ status: 503 });
    const result = await discoverLANServers();
    expect(result).toEqual([]);
  });

  it('discovers an Ollama server on port 11434', async () => {
    mockGetIpAddress.mockResolvedValue('192.168.1.42'); // NOSONAR

    mockFetch.mockImplementation((url: string) => {
      if (url === 'http://192.168.1.10:11434/v1/models') { // NOSONAR
        return Promise.resolve({ status: 200 });
      }
      return Promise.resolve({ status: 503 });
    });

    const result = await discoverLANServers();
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ollama');
    expect(result[0].endpoint).toBe('http://192.168.1.10:11434'); // NOSONAR
    expect(result[0].name).toBe('Ollama (192.168.1.10)');
  });

  it('discovers an LM Studio server on port 1234', async () => {
    mockGetIpAddress.mockResolvedValue('192.168.1.42'); // NOSONAR

    mockFetch.mockImplementation((url: string) => {
      if (url === 'http://192.168.1.20:1234/v1/models') { // NOSONAR
        return Promise.resolve({ status: 200 });
      }
      return Promise.resolve({ status: 503 });
    });

    const result = await discoverLANServers();
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('lmstudio');
    expect(result[0].endpoint).toBe('http://192.168.1.20:1234'); // NOSONAR
    expect(result[0].name).toBe('LM Studio (192.168.1.20)');
  });

  it('discovers a LocalAI server on port 8080', async () => {
    mockGetIpAddress.mockResolvedValue('192.168.1.42'); // NOSONAR

    mockFetch.mockImplementation((url: string) => {
      if (url === 'http://192.168.1.30:8080/v1/models') { // NOSONAR
        return Promise.resolve({ status: 200 });
      }
      return Promise.resolve({ status: 503 });
    });

    const result = await discoverLANServers();
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('localai');
    expect(result[0].endpoint).toBe('http://192.168.1.30:8080'); // NOSONAR
    expect(result[0].name).toBe('LocalAI (192.168.1.30)');
  });

  it('discovers multiple servers across different providers', async () => {
    mockGetIpAddress.mockResolvedValue('192.168.1.42'); // NOSONAR

    mockFetch.mockImplementation((url: string) => {
      if (
        url === 'http://192.168.1.10:11434/v1/models' || // NOSONAR
        url === 'http://192.168.1.20:1234/v1/models' // NOSONAR
      ) {
        return Promise.resolve({ status: 200 });
      }
      return Promise.resolve({ status: 503 });
    });

    const result = await discoverLANServers();
    expect(result).toHaveLength(2);
    const types = result.map(s => s.type).sort();
    expect(types).toEqual(['lmstudio', 'ollama']);
  });

  it('accepts any HTTP status < 500 as a valid server response', async () => {
    mockGetIpAddress.mockResolvedValue('192.168.1.1'); // NOSONAR

    mockFetch.mockImplementation((url: string) => {
      if (url === 'http://192.168.1.5:11434/v1/models') { // NOSONAR
        return Promise.resolve({ status: 401 }); // Unauthorized but server is there
      }
      return Promise.resolve({ status: 503 });
    });

    const result = await discoverLANServers();
    expect(result).toHaveLength(1);
    expect(result[0].endpoint).toBe('http://192.168.1.5:11434'); // NOSONAR
  });

  it('does not include servers with status >= 500', async () => {
    mockGetIpAddress.mockResolvedValue('192.168.1.1'); // NOSONAR

    mockFetch.mockResolvedValue({ status: 500 });

    const result = await discoverLANServers();
    expect(result).toHaveLength(0);
  });

  it('handles fetch rejection (timeout/abort) gracefully', async () => {
    mockGetIpAddress.mockResolvedValue('192.168.1.1'); // NOSONAR
    mockFetch.mockRejectedValue(new Error('AbortError'));

    const result = await discoverLANServers();
    expect(result).toEqual([]);
  });

  it('handles getIpAddress throwing an error', async () => {
    mockGetIpAddress.mockRejectedValue(new Error('Network unavailable'));

    const result = await discoverLANServers();
    expect(result).toEqual([]);
  });

  it('uses the correct subnet base from device IP', async () => {
    mockGetIpAddress.mockResolvedValue('10.0.0.15'); // NOSONAR

    const probed: string[] = [];
    mockFetch.mockImplementation((url: string) => {
      probed.push(url);
      return Promise.resolve({ status: 503 });
    });

    await discoverLANServers();

    // Should probe 10.0.0.x addresses, not 192.168.x.x
    expect(probed.some(u => u.startsWith('http://10.0.0.'))).toBe(true); // NOSONAR
    expect(probed.some(u => u.startsWith('http://192.168.'))).toBe(false); // NOSONAR
  });

  it('probes all 254 addresses for each provider', async () => {
    mockGetIpAddress.mockResolvedValue('192.168.1.42'); // NOSONAR

    const ollamaProbes: string[] = [];
    mockFetch.mockImplementation((url: string) => {
      if (url.includes(':11434')) ollamaProbes.push(url);
      return Promise.resolve({ status: 503 });
    });

    await discoverLANServers();

    // Should probe .1 through .254 (254 addresses)
    expect(ollamaProbes).toHaveLength(254);
    expect(ollamaProbes.some(u => u.includes('192.168.1.1:'))).toBe(true);
    expect(ollamaProbes.some(u => u.includes('192.168.1.254:'))).toBe(true);
    expect(ollamaProbes.some(u => u.includes('192.168.1.0:'))).toBe(false);
    expect(ollamaProbes.some(u => u.includes('192.168.1.255:'))).toBe(false);
  });
});
