import type { Conversation } from '../types';

/**
 * Conversations newest-first, by last activity.
 *
 * Defined ONCE because every surface that lists chats has to agree: Home's recent list, the Chats
 * list, and anything added later. The Home list previously took the store's first four with no
 * ordering at all, so "Recent" could show older chats than the ones just used.
 *
 * `updatedAt` is the activity stamp the message actions maintain, so a synced message from another
 * device reorders the list the same way a local one does.
 */
export function byRecentActivity(
  conversations: readonly Conversation[],
): Conversation[] {
  return [...conversations].sort(
    (a, b) => activityTime(b) - activityTime(a),
  );
}

function activityTime(conversation: Conversation): number {
  const parsed = Date.parse(conversation.updatedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** The n most recently active conversations, for a "Recent" summary. */
export function mostRecentConversations(
  conversations: readonly Conversation[],
  limit: number,
): Conversation[] {
  return byRecentActivity(conversations).slice(0, limit);
}
