import { needsVisionRepair } from '../../../src/utils/visionRepair';

describe('visionRepair', () => {
  describe('needsVisionRepair', () => {
    it('returns false when model is null', () => {
      expect(needsVisionRepair(null)).toBe(false);
    });

    it('returns false when mmProjPath exists', () => {
      expect(needsVisionRepair({ mmProjPath: '/path/to/proj' })).toBe(false);
    });

    it('returns true when vision metadata exists but no path', () => {
      expect(needsVisionRepair({ mmProjFileName: 'proj.gguf' })).toBe(true);
    });

    it('returns true when catalog file advertises an mmproj', () => {
      expect(needsVisionRepair(
        { name: 'Anything' },
        {
          name: 'file.gguf',
          size: 100,
          quantization: 'Q4',
          downloadUrl: '',
          mmProjFile: { name: 'proj.gguf', size: 50, downloadUrl: '' },
        },
      )).toBe(true);
    });

    it('returns true when persisted vision flag exists without path', () => {
      expect(needsVisionRepair({ isVisionModel: true })).toBe(true);
    });

    it('falls back to name-based vision detection when metadata is missing', () => {
      expect(needsVisionRepair({ name: 'Llama-Vision-Model', fileName: 'llm.gguf' })).toBe(true);
    });
  });
});
