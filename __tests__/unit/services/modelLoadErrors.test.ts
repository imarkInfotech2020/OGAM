import { OverridableMemoryError, isOverridableMemoryError } from '../../../src/services/modelLoadErrors';

describe('OverridableMemoryError', () => {
  it('is a real Error subclass carrying the overridable discriminant', () => {
    const err = new OverridableMemoryError('no room');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(OverridableMemoryError);
    expect(err.message).toBe('no room');
    expect(err.name).toBe('OverridableMemoryError');
    expect(err.overridable).toBe(true);
  });

  it('isOverridableMemoryError recognises the class', () => {
    expect(isOverridableMemoryError(new OverridableMemoryError('x'))).toBe(true);
  });

  it('isOverridableMemoryError recognises a duck-typed object (survives async/serialisation boundaries)', () => {
    expect(isOverridableMemoryError({ overridable: true, message: 'x' })).toBe(true);
  });

  it('rejects plain errors and non-errors', () => {
    expect(isOverridableMemoryError(new Error('generic'))).toBe(false);
    expect(isOverridableMemoryError('memory')).toBe(false);
    expect(isOverridableMemoryError(null)).toBe(false);
    expect(isOverridableMemoryError(undefined)).toBe(false);
    expect(isOverridableMemoryError({ overridable: false })).toBe(false);
  });
});
