import logger from '../utils/logger';
import { contextCompactionService } from './contextCompaction';
import { useDebugLogsStore } from '../stores/debugLogsStore';

const TAG = '[LiteRTService]';

type Turn = { role: 'user' | 'assistant'; content: string };
type SamplerConfigOpts = { temperature?: number; topK?: number; topP?: number };
type ResetFn = (
  prompt: string,
  opts?: { samplerConfig?: SamplerConfigOpts; tools?: any[]; history?: Turn[] },
) => Promise<void>;
export type SendMessageFn = (
  text: string,
  callbacks: {
    onToken: (token: string) => void;
    onReasoning: (token: string) => void;
    onComplete: (content: string, reasoning: string, stats?: any) => void;
    onError: (err: Error) => void;
  },
) => void;

export async function summarizeSession(
  sendMessage: SendMessageFn,
  isReady: boolean,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    if (!isReady) { resolve(null); return; }
    let summary = '';
    const timeout = setTimeout(() => {
      logger.log(TAG, 'summarizeCurrentSession — timed out, falling back to slice');
      resolve(null);
    }, 20_000);
    sendMessage(
      'Briefly summarize our conversation so far — key topics, decisions, and context. 3 to 5 sentences maximum.',
      {
        onToken: (token) => { summary += token; },
        onReasoning: () => {},
        onComplete: () => {
          clearTimeout(timeout);
          logger.log(TAG, `summarizeCurrentSession — got summary (${summary.length} chars)`);
          resolve(summary.trim() || null);
        },
        onError: (err) => {
          clearTimeout(timeout);
          logger.log(TAG, `summarizeCurrentSession — error: ${String(err)}, falling back to slice`);
          resolve(null);
        },
      },
    );
  });
}

export async function runCompaction(params: {
  history: Turn[];
  systemPrompt: string;
  maxTokens: number;
  cumulativeTokens: number;
  conversationId: string;
  activeConversationId: string | null;
  opts: { samplerConfig?: SamplerConfigOpts; tools?: any[] };
  summarize: () => Promise<string | null>;
  resetFn: ResetFn;
}): Promise<void> {
  const { history, systemPrompt, maxTokens, cumulativeTokens, conversationId, activeConversationId, opts, summarize, resetFn } = params;
  const dbg = useDebugLogsStore.getState().addLog;
  contextCompactionService.signalCompacting(true);
  try {
    const recentBudgetChars = Math.floor(maxTokens * 0.4) * 4;
    let charCount = 0;
    let recentStart = history.length;
    for (let i = history.length - 1; i >= 0; i--) {
      charCount += history[i].content.length;
      if (charCount > recentBudgetChars) break;
      recentStart = i;
    }
    recentStart = Math.min(recentStart, Math.max(0, history.length - 2));
    const recentHistory = history.slice(recentStart);

    const hasActiveSession = activeConversationId === conversationId;
    let summary: string | null = null;
    if (hasActiveSession) {
      dbg('log', `[LiteRT] compact — active session, requesting summary (cumulative=${cumulativeTokens}/${maxTokens})`);
      logger.log(TAG, `prepareConversation — compact: active session at cumulative=${cumulativeTokens}/${maxTokens}, requesting summary`);
      summary = await summarize();
      dbg('log', `[LiteRT] compact summary — got=${!!summary} length=${summary?.length ?? 0} chars`);
    } else {
      dbg('log', '[LiteRT] compact — no active session, slicing only');
      logger.log(TAG, 'prepareConversation — compact: first load, no active session — slicing');
    }

    const compactedHistory: Turn[] = summary
      ? [
          { role: 'user', content: `[Context from earlier in our conversation]: ${summary}` },
          { role: 'assistant', content: 'Understood.' },
          ...recentHistory,
        ]
      : recentHistory;

    dbg('log', `[LiteRT] compact done — ${history.length} → ${compactedHistory.length} turns, summarized=${!!summary}`);
    logger.log(TAG, `prepareConversation — compact done: ${history.length} → ${compactedHistory.length} turns, summarized=${!!summary}`);
    await resetFn(systemPrompt, { samplerConfig: opts.samplerConfig, tools: opts.tools, history: compactedHistory });
  } finally {
    contextCompactionService.signalCompacting(false);
  }
}
