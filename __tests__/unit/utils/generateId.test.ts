/**
 * Tests for generateId utility
 */

import { generateId, generateRandomSeed } from '../../../src/utils/generateId';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateId', () => {
  describe('with crypto available', () => {
    it('should generate a UUID identity', () => {
      const id = generateId();
      expect(id).toMatch(UUID_V4);
    });

    it('should generate different IDs on subsequent calls', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('without crypto API (fallback)', () => {
    let originalCrypto: Crypto | undefined;

    beforeEach(() => {
      originalCrypto = (global as any).crypto;
      // @ts-ignore - intentionally removing crypto
      delete (global as any).crypto;
    });

    afterEach(() => {
      if (originalCrypto) {
        (global as any).crypto = originalCrypto;
      }
    });

    it('should generate a UUID identity when crypto is not available', () => {
      const id = generateId();
      expect(id).toMatch(UUID_V4);
    });

    it('should generate different IDs using fallback', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).toMatch(UUID_V4);
      expect(id2).toMatch(UUID_V4);
      expect(id1).not.toBe(id2);
    });
  });
});

describe('generateRandomSeed', () => {
  describe('with crypto available', () => {
    it('should generate a number between 0 and max int', () => {
      const seed = generateRandomSeed();
      expect(typeof seed).toBe('number');
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2147483647);
    });

    it('should generate different seeds on subsequent calls', () => {
      const seeds = new Set();
      for (let i = 0; i < 10; i++) {
        seeds.add(generateRandomSeed());
      }
      // At least some seeds should be different
      expect(seeds.size).toBeGreaterThan(1);
    });
  });

  describe('without crypto API (fallback)', () => {
    let originalCrypto: Crypto | undefined;

    beforeEach(() => {
      originalCrypto = (global as any).crypto;
      // @ts-ignore - intentionally removing crypto
      delete (global as any).crypto;
    });

    afterEach(() => {
      if (originalCrypto) {
        (global as any).crypto = originalCrypto;
      }
    });

    it('should generate seed using fallback when crypto is not available', () => {
      const seed = generateRandomSeed();
      expect(typeof seed).toBe('number');
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2147483647);
    });

    it('should generate valid seeds using fallback', () => {
      // Call multiple times to ensure fallback produces valid results
      for (let i = 0; i < 5; i++) {
        const seed = generateRandomSeed();
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThan(2147483647);
        expect(Number.isInteger(seed)).toBe(true);
      }
    });
  });
});
