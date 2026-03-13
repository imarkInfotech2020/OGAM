/**
 * HTTP Client Utilities - image conversion, network validation, endpoint testing
 */

/**
 * Convert image URI to base64 data URL
 */
export async function imageToBase64DataUrl(uri: string): Promise<string> {
  // Handle already-encoded data URLs
  if (uri.startsWith('data:')) {
    return uri;
  }

  // Handle file:// URIs (React Native)
  const RNFS = require('react-native-fs');
  if (uri.startsWith('file://') || uri.startsWith(RNFS.DocumentDirectoryPath)) {
    const filePath = uri.replace('file://', '');
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      throw new Error(`Image file not found: ${filePath}`);
    }
    const base64 = await RNFS.readFile(filePath, 'base64');
    // Detect MIME type from extension
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  }

  // Handle http:// or https:// URIs — download and convert
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read image as base64'));
      reader.readAsDataURL(blob);
    });
  }

  // For other URIs (content://, ph://, etc.), try fetch
  try {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read image as base64'));
      reader.readAsDataURL(blob);
    });
  } catch {
    throw new Error(`Unsupported image URI: ${uri}`);
  }
}

/**
 * Validate that an endpoint is on a private network
 * Returns true for private IPs, false for public internet addresses
 */
export function isPrivateNetworkEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname;

    // localhost (including IPv6 localhost with brackets)
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      return true;
    }

    // Private IP ranges
    // 10.0.0.0 - 10.255.255.255
    if (hostname.startsWith('10.') || hostname.match(/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      return true;
    }

    // 172.16.0.0 - 172.31.255.255
    const match = hostname.match(/^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/);
    if (match) {
      const second = parseInt(match[1], 10);
      if (second >= 16 && second <= 31) {
        return true;
      }
    }

    // 192.168.0.0 - 192.168.255.255
    if (hostname.startsWith('192.168.')) {
      return true;
    }

    // 169.254.0.0 - 169.254.255.255 (link-local)
    if (hostname.startsWith('169.254.')) {
      return true;
    }

    // .local (mDNS/Bonjour)
    if (hostname.endsWith('.local')) {
      return true;
    }

    return false;
  } catch {
    // Invalid URL - be conservative
    return false;
  }
}

/**
 * Check if endpoint URL is valid and reachable
 */
export async function testEndpoint(
  endpoint: string,
  timeout: number = 5000
): Promise<{ success: boolean; error?: string; latency?: number }> {
  const startTime = Date.now();

  try {
    // Normalize endpoint (remove trailing slashes)
    let url = endpoint;
    while (url.endsWith('/')) url = url.slice(0, -1);

    // Try to reach the base URL first
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${url}/v1/models`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (!response.ok) {
      // Try alternate health endpoints
      const altUrls = ['/api/tags', '/health', '/'];
      for (const alt of altUrls) {
        try {
          const altResponse = await fetch(`${url}${alt}`, {
            method: 'GET',
            signal: controller.signal,
          });
          if (altResponse.ok) {
            return { success: true, latency };
          }
        } catch {
          // Continue to next
        }
      }

      return {
        success: false,
        error: `Server returned ${response.status}`,
        latency,
      };
    }

    return { success: true, latency };
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      latency,
    };
  }
}

/**
 * Detect server type from endpoint
 */
export async function detectServerType(
  endpoint: string,
  timeout: number = 5000
): Promise<{ type: string; version?: string } | null> {
  try {
    let url = endpoint;
    while (url.endsWith('/')) url = url.slice(0, -1);

    // Try OpenAI-style version endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${url}/v1/models`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        // Check for Ollama-specific headers
        const server = response.headers.get('server') || '';
        if (server.toLowerCase().includes('ollama')) {
          return { type: 'ollama' };
        }

        // Try to get version from response
        try {
          const data = await response.json();
          if (data?.object === 'list' || Array.isArray(data?.data)) {
            // OpenAI-compatible, assume generic
            return { type: 'openai-compatible' };
          }
        } catch {
          // Can't parse, assume generic
        }
      }
    } catch {
      clearTimeout(timeoutId);
    }

    // Try Ollama-specific endpoint
    try {
      const ollamaController = new AbortController();
      const ollamaTimeoutId = setTimeout(() => ollamaController.abort(), timeout);
      const ollamaResponse = await fetch(`${url}/api/tags`, {
        signal: ollamaController.signal,
      });
      clearTimeout(ollamaTimeoutId);
      if (ollamaResponse.ok) {
        return { type: 'ollama' };
      }
    } catch {
      // Not Ollama
    }

    // Try LM Studio endpoint
    try {
      const lmstudioController = new AbortController();
      const lmstudioTimeoutId = setTimeout(() => lmstudioController.abort(), timeout);
      const lmstudioResponse = await fetch(`${url}/v1/models`, {
        signal: lmstudioController.signal,
      });
      clearTimeout(lmstudioTimeoutId);
      if (lmstudioResponse.ok) {
        const data = await lmstudioResponse.json();
        // LM Studio typically returns model list with specific structure
        if (data?.data?.some?.((m: { id: string }) => m.id?.includes('gguf'))) {
          return { type: 'lmstudio' };
        }
      }
    } catch {
      // Not LM Studio
    }

    return null;
  } catch {
    return null;
  }
}
