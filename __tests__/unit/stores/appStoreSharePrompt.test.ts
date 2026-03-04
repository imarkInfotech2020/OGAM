/**
 * AppStore Share Prompt Unit Tests
 *
 * Tests for generation count tracking and persistence.
 * Priority: P1 (High) - Share prompt depends on accurate counts.
 */

import { useAppStore } from '../../../src/stores/appStore';
import { resetStores, getAppState } from '../../utils/testHelpers';

describe('appStore generation counts', () => {
  beforeEach(() => {
    resetStores();
  });

  describe('textGenerationCount', () => {
    it('starts at 0', () => {
      expect(getAppState().textGenerationCount).toBe(0);
    });

    it('increments and returns the new count', () => {
      const result = useAppStore.getState().incrementTextGenerationCount();
      expect(result).toBe(1);
      expect(getAppState().textGenerationCount).toBe(1);
    });

    it('increments sequentially', () => {
      const { incrementTextGenerationCount } = useAppStore.getState();
      incrementTextGenerationCount();
      incrementTextGenerationCount();
      const third = useAppStore.getState().incrementTextGenerationCount();
      expect(third).toBe(3);
      expect(getAppState().textGenerationCount).toBe(3);
    });
  });

  describe('imageGenerationCount', () => {
    it('starts at 0', () => {
      expect(getAppState().imageGenerationCount).toBe(0);
    });

    it('increments and returns the new count', () => {
      const result = useAppStore.getState().incrementImageGenerationCount();
      expect(result).toBe(1);
      expect(getAppState().imageGenerationCount).toBe(1);
    });

    it('increments sequentially', () => {
      const { incrementImageGenerationCount } = useAppStore.getState();
      incrementImageGenerationCount();
      incrementImageGenerationCount();
      const third = useAppStore.getState().incrementImageGenerationCount();
      expect(third).toBe(3);
      expect(getAppState().imageGenerationCount).toBe(3);
    });
  });

  describe('independence', () => {
    it('text and image counts are independent', () => {
      useAppStore.getState().incrementTextGenerationCount();
      useAppStore.getState().incrementTextGenerationCount();
      useAppStore.getState().incrementImageGenerationCount();

      expect(getAppState().textGenerationCount).toBe(2);
      expect(getAppState().imageGenerationCount).toBe(1);
    });
  });
});
