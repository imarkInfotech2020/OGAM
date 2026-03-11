/**
 * LAN LLM Server Discovery
 *
 * Scans the device's local subnet for running LLM servers
 * (Ollama, LM Studio, LocalAI) using their default ports.
 */

import { getIpAddress } from 'react-native-device-info';
import logger from '../utils/logger';

export interface DiscoveredServer {
  endpoint: string;
  type: 'ollama' | 'lmstudio' | 'localai';
  name: string;
}

const PROVIDERS = [
  { port: 11434, type: 'ollama' as const,   name: 'Ollama'    },
  { port: 1234,  type: 'lmstudio' as const, name: 'LM Studio' },
  { port: 8080,  type: 'localai' as const,  name: 'LocalAI'   },
];

const TIMEOUT_MS = 300;
const BATCH_SIZE = 50;

/** Probe a single host:port — resolves true if it responds with an HTTP status */
async function probe(ip: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); resolve(false); }, TIMEOUT_MS);

    fetch(`http://${ip}:${port}/v1/models`, { signal: controller.signal })
      .then(res => { clearTimeout(timer); resolve(res.status < 500); })
      .catch(() => { clearTimeout(timer); resolve(false); });
  });
}

/** Run up to BATCH_SIZE probes concurrently */
async function runBatch<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE).map(t => t());
    results.push(...await Promise.all(batch));
  }
  return results;
}

/** Parse subnet base from IP, e.g. "192.168.1.42" → "192.168.1" */
function subnetBase(ip: string): string | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return parts.slice(0, 3).join('.');
}

/**
 * Scan the local subnet for LLM servers.
 * Returns discovered servers sorted by IP.
 * Safe to call in the background — never throws.
 */
export async function discoverLANServers(): Promise<DiscoveredServer[]> {
  try {
    const ip = await getIpAddress();
    if (!ip) {
      logger.warn('[Discovery] Could not get device IP');
      return [];
    }

    const base = subnetBase(ip);
    if (!base) {
      logger.warn('[Discovery] Could not parse subnet from IP:', ip);
      return [];
    }

    logger.log('[Discovery] Scanning subnet:', `${base}.0/24`);

    const discovered: DiscoveredServer[] = [];

    for (const provider of PROVIDERS) {
      const tasks = Array.from({ length: 254 }, (_, i) => {
        const target = `${base}.${i + 1}`;
        return () => probe(target, provider.port).then(found => {
          if (found) {
            logger.log(`[Discovery] Found ${provider.name} at ${target}:${provider.port}`);
            discovered.push({
              endpoint: `http://${target}:${provider.port}`,
              type: provider.type,
              name: `${provider.name} (${target})`,
            });
          }
        });
      });

      await runBatch(tasks);
    }

    logger.log('[Discovery] Scan complete, found:', discovered.length, 'servers');
    return discovered;
  } catch (error) {
    logger.warn('[Discovery] Scan failed:', error);
    return [];
  }
}
