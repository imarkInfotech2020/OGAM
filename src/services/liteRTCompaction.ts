import logger from '../utils/logger';
import { contextCompactionService } from './contextCompaction';

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

type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<string>;
export type InstallToolHandlerFn = (h: ToolHandler) => () => void;

const NEUTRAL_TOOL_HANDLER: ToolHandler = async () =>
  'No tool needed. Reply in plain text with the summary requested.';

export async function summarizeSession(
  sendMessage: SendMessageFn,
  isReady: boolean,
  installToolHandler?: InstallToolHandlerFn,
  stopGeneration?: () => Promise<void>,
): Promise<string | null> {
  // Active conversation has tools registered with autoToolCalling=true. If the
  // model emits a tool_call mid-summary and the handler is null, sendMessage's
  // fallback ("Tool unavailable…") often makes the model emit 0-1 tokens and quit.
  // Install a neutral handler that nudges the model back to plain text.
  const restoreHandler = installToolHandler?.(NEUTRAL_TOOL_HANDLER);
  logger.log(TAG, `summarizeSession — START isReady=${isReady}, hasToolHandlerInstaller=${!!installToolHandler}`);
  return new Promise<string | null>((resolve) => {
    if (!isReady) {
      restoreHandler?.();
      logger.log(TAG, 'summarizeSession — SKIP: model not ready');
      resolve(null);
      return;
    }
    let summary = '';
    let answerTokenCount = 0;
    let reasoningCharCount = 0;
    const startMs = Date.now();
    let finished = false;
    const finish = (value: string | null) => {
      if (finished) return;
      finished = true;
      logger.log(TAG, `summarizeSession — finish: result=${value ? `${value.length}ch` : 'null'}, elapsed=${Date.now() - startMs}ms`);
      restoreHandler?.();
      resolve(value);
    };
    const timeout = setTimeout(() => {
      logger.log(TAG, `summarizeSession — TIMEOUT at 20s: answerTokens=${answerTokenCount}, reasoningChars=${reasoningCharCount}, summaryBuiltSoFar="${summary.substring(0, 100)}"`);
      // Stop native generation before resetConversation is called to avoid race condition
      stopGeneration?.().catch(() => {}).finally(() => finish(null));
    }, 20_000);
    logger.log(TAG, 'summarizeSession — firing sendMessage for summary prompt');
    sendMessage(
      'Briefly summarize our conversation so far — key topics, decisions, and context. 3 to 5 sentences maximum. Do not call any tools, just answer in plain text.',
      {
        onToken: (token) => {
          answerTokenCount++;
          summary += token;
          if (answerTokenCount === 1) logger.log(TAG, `summarizeSession — first answer token received at ${Date.now() - startMs}ms`);
        },
        onReasoning: (token) => {
          reasoningCharCount += token.length;
          if (reasoningCharCount <= token.length) logger.log(TAG, `summarizeSession — first reasoning token at ${Date.now() - startMs}ms (thinking mode active)`);
        },
        onComplete: () => {
          clearTimeout(timeout);
          const trimmed = summary.trim();
          const passed = trimmed.length >= 30;
          logger.log(TAG, `summarizeSession — onComplete: elapsed=${Date.now() - startMs}ms, answerTokens=${answerTokenCount}, reasoningChars=${reasoningCharCount}, summaryLen=${trimmed.length}, passed30charMin=${passed}`);
          logger.log(TAG, `summarizeSession — summary content: "${trimmed.substring(0, 500)}"`);
          finish(passed ? trimmed : null);
        },
        onError: (err) => {
          clearTimeout(timeout);
          logger.log(TAG, `summarizeSession — onError at ${Date.now() - startMs}ms: ${String(err)}, answerTokens=${answerTokenCount}, reasoningChars=${reasoningCharCount}`);
          finish(null);
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
  summarize: (fullHistory: Turn[]) => Promise<string | null>;
  resetFn: ResetFn;
}): Promise<void> {
  const { history, systemPrompt, maxTokens, cumulativeTokens, conversationId, activeConversationId, opts, summarize, resetFn } = params;
  const hasActiveSession = activeConversationId === conversationId;
  const usedPct = maxTokens > 0 ? ((cumulativeTokens / maxTokens) * 100).toFixed(1) : '?';
  logger.log(TAG, `runCompaction — START: turns=${history.length}, tokens=${cumulativeTokens}/${maxTokens} (${usedPct}% used), hasActiveSession=${hasActiveSession}, tools=${opts.tools?.length ?? 0}, systemPromptLen=${systemPrompt.length}`);
  logger.log(TAG, `runCompaction — systemPrompt preview: "${systemPrompt.substring(0, 200)}"`);
  contextCompactionService.signalCompacting(true);
  try {
    const POST_COMPACT_TARGET = 0.45;
    const SUMMARY_RESERVE_TOKENS = hasActiveSession ? 200 : 0;
    const systemAndToolsChars = systemPrompt.length + (opts.tools && opts.tools.length > 0 ? JSON.stringify(opts.tools).length : 0);
    const systemAndToolsTokens = Math.ceil(systemAndToolsChars / 4);
    const historyBudgetTokens = Math.max(
      Math.floor(maxTokens * POST_COMPACT_TARGET) - systemAndToolsTokens - SUMMARY_RESERVE_TOKENS,
      50,
    );
    const recentBudgetChars = historyBudgetTokens * 4;
    logger.log(TAG, `runCompaction — budget: target=${(POST_COMPACT_TARGET * 100).toFixed(0)}%, historyBudgetTokens=${historyBudgetTokens}, recentBudgetChars=${recentBudgetChars}, systemAndToolsTokens=${systemAndToolsTokens}`);

    let charCount = 0;
    let recentStart = history.length;
    for (let i = history.length - 1; i >= 0; i--) {
      charCount += history[i].content.length;
      if (charCount > recentBudgetChars) break;
      recentStart = i;
    }
    recentStart = Math.min(recentStart, Math.max(0, history.length - 2));
    const recentHistory = history.slice(recentStart);
    logger.log(TAG, `runCompaction — slice: keeping turns[${recentStart}..${history.length - 1}] = ${recentHistory.length} recent turns (${charCount} chars scanned)`);

    let summary: string | null = null;
    if (hasActiveSession) {
      logger.log(TAG, `runCompaction — calling summarize() (activeSession, tokens=${cumulativeTokens}/${maxTokens})`);
      summary = await summarize(history);
      logger.log(TAG, `runCompaction — summarize() returned: ${summary ? `${summary.length}ch` : 'null (will slice only)'}`);
    } else {
      logger.log(TAG, 'runCompaction — no active session, slice only (no summary call)');
    }

    const compactedHistory: Turn[] = summary
      ? [
          { role: 'user', content: `[Context from earlier in our conversation]: ${summary}` },
          { role: 'assistant', content: 'Understood.' },
          ...recentHistory,
        ]
      : recentHistory;

    const estCompactedTokens = Math.ceil(compactedHistory.reduce((s, m) => s + m.content.length, 0) / 4) + systemAndToolsTokens;
    logger.log(TAG, `runCompaction — calling resetFn: ${history.length} → ${compactedHistory.length} turns, summarized=${!!summary}, estTokensAfter=${estCompactedTokens}/${maxTokens} (${maxTokens > 0 ? ((estCompactedTokens / maxTokens) * 100).toFixed(1) : '?'}%)`);
    await resetFn(systemPrompt, { samplerConfig: opts.samplerConfig, tools: opts.tools, history: compactedHistory });
    logger.log(TAG, 'runCompaction — resetFn DONE, compaction complete');
  } catch (e) {
    logger.log(TAG, `runCompaction — CAUGHT ERROR: ${String(e)}`);
    throw e;
  } finally {
    contextCompactionService.signalCompacting(false);
  }
}
