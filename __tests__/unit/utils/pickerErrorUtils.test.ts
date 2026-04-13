/**
 * Tests for pickerErrorUtils
 *
 * Verifies detection of stuck/hung document picker states
 */

import { isPickerStuck } from '../../../src/utils/pickerErrorUtils';

describe('isPickerStuck', () => {
  describe('detects ASYNC_OP_IN_PROGRESS error code', () => {
    it('returns true when error.code === "ASYNC_OP_IN_PROGRESS"', () => {
      const error = { code: 'ASYNC_OP_IN_PROGRESS', message: 'Operation in progress' };
      expect(isPickerStuck(error)).toBe(true);
    });

    it('returns true when error.code is ASYNC_OP_IN_PROGRESS (exact match)', () => {
      const error = { code: 'ASYNC_OP_IN_PROGRESS' };
      expect(isPickerStuck(error)).toBe(true);
    });
  });

  describe('detects async_op_in_progress in message', () => {
    it('returns true when error message contains "async_op_in_progress"', () => {
      const error = { message: 'Previous operation async_op_in_progress' };
      expect(isPickerStuck(error)).toBe(true);
    });

    it('returns true when message contains "async_op_in_progress" (case-insensitive)', () => {
      const error = { message: 'Error: ASYNC_OP_IN_PROGRESS detected' };
      expect(isPickerStuck(error)).toBe(true);
    });

    it('returns true when message contains "async_op_in_progress" in lowercase', () => {
      const error = { message: 'async_op_in_progress' };
      expect(isPickerStuck(error)).toBe(true);
    });
  });

  describe('detects "previous promise did not settle" message', () => {
    it('returns true when message contains "previous promise did not settle"', () => {
      const error = { message: 'Error: previous promise did not settle' };
      expect(isPickerStuck(error)).toBe(true);
    });

    it('returns true when message contains phrase (case-insensitive)', () => {
      const error = { message: 'PREVIOUS PROMISE DID NOT SETTLE' };
      expect(isPickerStuck(error)).toBe(true);
    });
  });

  describe('returns false for non-stuck errors', () => {
    it('returns false for OPERATION_CANCELED error', () => {
      const error = { code: 'OPERATION_CANCELED', message: 'User cancelled' };
      expect(isPickerStuck(error)).toBe(false);
    });

    it('returns false for generic unknown errors', () => {
      const error = { code: 'UNKNOWN_ERROR', message: 'Something went wrong' };
      expect(isPickerStuck(error)).toBe(false);
    });

    it('returns false for permission denied errors', () => {
      const error = { code: 'PERMISSION_DENIED', message: 'Permission denied' };
      expect(isPickerStuck(error)).toBe(false);
    });
  });

  describe('handles edge cases', () => {
    it('returns false for null', () => {
      expect(isPickerStuck(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isPickerStuck(undefined)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isPickerStuck({})).toBe(false);
    });

    it('returns false for object with only code property (non-stuck)', () => {
      const error = { code: 'SOME_OTHER_CODE' };
      expect(isPickerStuck(error)).toBe(false);
    });

    it('returns false for object with only message property (non-stuck)', () => {
      const error = { message: 'Generic error message' };
      expect(isPickerStuck(error)).toBe(false);
    });

    it('returns false for string error', () => {
      expect(isPickerStuck('error string')).toBe(false);
    });
  });

  describe('multiple conditions', () => {
    it('returns true when both code and message contain stuck indicators', () => {
      const error = {
        code: 'ASYNC_OP_IN_PROGRESS',
        message: 'previous promise did not settle',
      };
      expect(isPickerStuck(error)).toBe(true);
    });

    it('returns true when code matches (ignores non-stuck message)', () => {
      const error = {
        code: 'ASYNC_OP_IN_PROGRESS',
        message: 'some other message',
      };
      expect(isPickerStuck(error)).toBe(true);
    });

    it('returns true when message matches (ignores non-stuck code)', () => {
      const error = {
        code: 'SOME_OTHER_CODE',
        message: 'async_op_in_progress in operation',
      };
      expect(isPickerStuck(error)).toBe(true);
    });
  });
});
