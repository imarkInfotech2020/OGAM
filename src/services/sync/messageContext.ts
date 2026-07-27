import type { Message } from '../../types';

interface SyncedMessageContext {
  reasoning?: unknown;
}

/** Match Desktop's persisted message-context contract without leaking UI state onto the wire. */
export function serializeMessageContext(
  message: Pick<Message, 'reasoningContent'>,
): string | null {
  const reasoning = message.reasoningContent;
  return typeof reasoning === 'string' && reasoning.trim()
    ? JSON.stringify({ reasoning })
    : null;
}

/** Peer-controlled context is optional JSON; malformed or empty reasoning is ignored. */
export function reasoningFromMessageContext(
  value: unknown,
): string | undefined {
  let context: SyncedMessageContext;
  try {
    context =
      typeof value === 'string'
        ? (JSON.parse(value) as SyncedMessageContext)
        : (value as SyncedMessageContext);
  } catch {
    return undefined;
  }
  if (!context || typeof context !== 'object') return undefined;
  const reasoning = context.reasoning;
  return typeof reasoning === 'string' && reasoning.trim()
    ? reasoning
    : undefined;
}
