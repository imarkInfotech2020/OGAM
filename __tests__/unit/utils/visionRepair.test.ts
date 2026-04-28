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

    it('returns true when model name or file looks like vision', () => {
      expect(needsVisionRepair({ name: 'Llama-Vision-Model' })).toBe(true);
      expect(needsVisionRepair({ fileName: 'smolvlm-q4.gguf' })).toBe(true);
    });

    it('returns false when model name looks like vision but catalog file has no mmProjFile', () => {
      expect(needsVisionRepair({ name: 'Llama-Vision-Model' }, { name: 'file.gguf', size: 100, quantization: 'Q4', downloadUrl: '' })).toBe(false);
    });

    it('returns false when not a vision model', () => {
      expect(needsVisionRepair({ name: 'Normal-LLM', fileName: 'llm.gguf' })).toBe(false);
    });
  });
});
