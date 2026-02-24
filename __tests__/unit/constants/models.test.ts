import { RECOMMENDED_MODELS } from '../../../src/constants/models';

describe('RECOMMENDED_MODELS', () => {
  it('all entries have required fields', () => {
    for (const model of RECOMMENDED_MODELS) {
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('name');
      expect(model).toHaveProperty('params');
      expect(model).toHaveProperty('type');
      expect(model).toHaveProperty('minRam');
      expect(typeof model.id).toBe('string');
      expect(typeof model.name).toBe('string');
      expect(typeof model.params).toBe('number');
      expect(['text', 'vision', 'code']).toContain(model.type);
      expect(typeof model.minRam).toBe('number');
    }
  });

  it('contains SmolVLM 2B with correct fields', () => {
    const smolVLM2B = RECOMMENDED_MODELS.find(m => m.id === 'ggml-org/SmolVLM-Instruct-GGUF');
    expect(smolVLM2B).toBeDefined();
    expect(smolVLM2B!.name).toBe('SmolVLM 2B');
    expect(smolVLM2B!.params).toBe(2);
    expect(smolVLM2B!.type).toBe('vision');
    expect(smolVLM2B!.minRam).toBe(4);
    expect(smolVLM2B!.org).toBe('HuggingFaceTB');
  });

  it('contains SmolVLM 500M with correct fields', () => {
    const smolVLM500M = RECOMMENDED_MODELS.find(m => m.id === 'ggml-org/SmolVLM-500M-Instruct-GGUF');
    expect(smolVLM500M).toBeDefined();
    expect(smolVLM500M!.name).toBe('SmolVLM 500M');
    expect(smolVLM500M!.params).toBe(0.5);
    expect(smolVLM500M!.type).toBe('vision');
    expect(smolVLM500M!.minRam).toBe(3);
    expect(smolVLM500M!.org).toBe('HuggingFaceTB');
  });
});
