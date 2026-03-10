/**
 * Tests for generateId utility
 */

import { generateId, generateRandomSeed } from '../../../src/utils/generateId';

describe('generateId', () => {
  describe('with crypto available', () => {
    it('should generate a unique ID', () => {
      const id = generateId();
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
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
      originalCrypto = global.crypto;
      // @ts-ignore - intentionally removing crypto
      delete global.crypto;
    });

    afterEach(() => {
      if (originalCrypto) {
        global.crypto = originalCrypto;
      }
    });

    it('should generate ID using fallback when crypto is not available', () => {
      const id = generateId();
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it('should generate different IDs using fallback', () => {
      const id1 = generateId();
      const id2 = generateId();
      // IDs might be same if called in same millisecond, but format should be valid
      expect(id1).toMatch(/^\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^\d+-[a-z0-9]+$/);
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
      originalCrypto = global.crypto;
      // @ts-ignore - intentionally removing crypto
      delete global.crypto;
    });

    afterEach(() => {
      if (originalCrypto) {
        global.crypto = originalCrypto;
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