/**
 * Unit tests for the PURE backend resolver. No IO, no store — just the
 * capability -> backend mapping, all branches.
 */
import {
  resolveDefaultBackend,
  resolveDefaultLiteRTBackend,
} from '../../../src/services/backendResolver';
import { INFERENCE_BACKENDS } from '../../../src/types';

describe('resolveDefaultBackend', () => {
  it('iOS always defaults to Metal (OpenCL flag irrelevant)', () => {
    expect(resolveDefaultBackend({ platform: 'ios', openCLSupported: true })).toBe(
      INFERENCE_BACKENDS.METAL,
    );
    expect(resolveDefaultBackend({ platform: 'ios', openCLSupported: false })).toBe(
      INFERENCE_BACKENDS.METAL,
    );
  });

  it('Android with OpenCL support defaults to OpenCL (GPU)', () => {
    expect(
      resolveDefaultBackend({ platform: 'android', openCLSupported: true }),
    ).toBe(INFERENCE_BACKENDS.OPENCL);
  });

  it('Android without OpenCL support defaults to CPU', () => {
    expect(
      resolveDefaultBackend({ platform: 'android', openCLSupported: false }),
    ).toBe(INFERENCE_BACKENDS.CPU);
  });
});

describe('resolveDefaultLiteRTBackend', () => {
  it('returns gpu when OpenCL is supported', () => {
    expect(
      resolveDefaultLiteRTBackend({ platform: 'android', openCLSupported: true }),
    ).toBe('gpu');
  });

  it('returns cpu when OpenCL is not supported', () => {
    expect(
      resolveDefaultLiteRTBackend({ platform: 'android', openCLSupported: false }),
    ).toBe('cpu');
  });

  it('iOS reports gpu when supported (Metal-class GPU)', () => {
    expect(
      resolveDefaultLiteRTBackend({ platform: 'ios', openCLSupported: true }),
    ).toBe('gpu');
  });
});
