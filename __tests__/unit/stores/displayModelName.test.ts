/**
 * displayModelName — the picker label for a remote model. Some gateways report
 * the model id as a full file path; the picker must show a clean basename without
 * the extension, while the raw id is still used for loading.
 */
import { displayModelName } from '../../../src/stores/remoteServerHelpers';

describe('displayModelName', () => {
  it('strips a full file path down to the basename without extension', () => {
    expect(displayModelName('/Users/admin/.offgrid/models/Qwen3.5-9B-Q4_K_M.gguf'))
      .toBe('Qwen3.5-9B-Q4_K_M');
  });

  it('handles Windows-style backslash paths', () => {
    expect(displayModelName('C:\\models\\Qwythos-9B-Claude-Mythos-5-1M-Q4_K_M.gguf'))
      .toBe('Qwythos-9B-Claude-Mythos-5-1M-Q4_K_M');
  });

  it('strips the extension for various model formats', () => {
    expect(displayModelName('/m/model.safetensors')).toBe('model');
    expect(displayModelName('/m/model.task')).toBe('model');
    expect(displayModelName('/m/model.litertlm')).toBe('model');
  });

  it('leaves a plain id (no path, no extension) unchanged', () => {
    expect(displayModelName('llama3.1:8b')).toBe('llama3.1:8b');
    expect(displayModelName('gpt-4o-mini')).toBe('gpt-4o-mini');
  });

  it('keeps a dotted name that is not a known model extension', () => {
    expect(displayModelName('Qwen3.5-9B')).toBe('Qwen3.5-9B');
  });
});
