import type { Conversation, Message } from '../types';

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

/**
 * A conversation's messages in the order they were WRITTEN, not the order they arrived.
 *
 * Sync makes out-of-order arrival normal: a message written on the Mac at 10:55 can reach a phone at
 * 16:25, after one the phone itself wrote at 14:00. Appending it left the two devices showing the same
 * conversation in different orders - the reply above the question on one of them.
 *
 * Ties keep their current relative position, so a message that is mid-generation does not jump around
 * as its own timestamp settles, and two messages written in the same millisecond stay as they are.
 */
export function byWrittenOrder(messages: readonly Message[]): Message[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => a.message.timestamp - b.message.timestamp || a.index - b.index)
    .map(({ message }) => message);
}
