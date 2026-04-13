/**
 * Utility to detect if a document picker error indicates a stuck/hung picker.
 * Used across file attachment and document import flows.
 */
export function isPickerStuck(err: unknown): boolean {
  const msg = ((err as any)?.message || '').toLowerCase();
  const code = ((err as any)?.code || '');
  return (
    code === 'ASYNC_OP_IN_PROGRESS' ||
    msg.includes('async_op_in_progress') ||
    msg.includes('previous promise did not settle')
  );
}
