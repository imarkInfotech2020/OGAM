/**
 * A model load was blocked by the memory budget, but the user CAN choose to load
 * it anyway ("Load Anyway" → retry with { override: true }).
 *
 * This carries an explicit, typed signal rather than relying on message-regex
 * sniffing: the readiness/failure layer checks `isOverridableMemoryError(err)` to
 * decide whether to offer the override button. The message still matches the
 * insufficient-memory reason mapping so existing classification keeps working.
 */
export class OverridableMemoryError extends Error {
  /** Discriminant so the UI can offer "Load Anyway" without message sniffing. */
  readonly overridable = true as const;

  constructor(message: string) {
    super(message);
    this.name = 'OverridableMemoryError';
    // Restore the prototype chain (TS + transpiled ES5 subclassed Error).
    Object.setPrototypeOf(this, OverridableMemoryError.prototype);
  }
}

export function isOverridableMemoryError(err: unknown): err is OverridableMemoryError {
  return (
    err instanceof OverridableMemoryError ||
    (typeof err === 'object' && err !== null && (err as { overridable?: unknown }).overridable === true)
  );
}
