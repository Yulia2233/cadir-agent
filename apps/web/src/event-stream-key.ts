import type { ConversationSummary } from './types';

// SSE lifetime is keyed only by resource identity. Status/title updates must not
// tear down a healthy stream and create a reconnect storm.
export function eventStreamKey(conversation: ConversationSummary | undefined): string | null {
  return conversation?.id ?? null;
}
