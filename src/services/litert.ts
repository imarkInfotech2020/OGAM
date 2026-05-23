/**
 * LiteRTService — JS bridge to the native LiteRTModule (Android).
 *
 * Architecture notes:
 * - The native Conversation object holds turn history internally.
 *   JS sends only the current user message via sendMessage().
 * - Call resetConversation() before each generation (MVP approach).
 *   This is safe and correct for all flows including retry/edit/switch.
 * - onComplete receives fully accumulated content, not an empty string.
 */

import { NativeModules, NativeEventEmitter, Platform, EmitterSubscription } from 'react-native';
import logger from '../utils/logger';
import { useDebugLogsStore } from '../stores/debugLogsStore';
import { contextCompactionService } from './contextCompaction';

const TAG = '[LiteRTService]';

const { LiteRTModule } = NativeModules;

// Events emitted by the native module
const EVENT_TOKEN     = 'litert_token';
const EVENT_THINKING  = 'litert_thinking';
const EVENT_COMPLETE  = 'litert_complete';
const EVENT_ERROR     = 'litert_error';
const EVENT_TOOL_CALL = 'litert_tool_call';
const EVENT_DEBUG_LOG = 'litert_debug_log';

export type LiteRTBackend = 'cpu' | 'gpu' | 'npu';

export interface LiteRTBenchmarkStats {
  ttft: number;
  decodeTokensPerSecond: number;
  prefillTokensPerSecond: number;
  prefillTokenCount: number;
  decodeTokenCount: number;
  maxNumTokens?: number;
  initTimeSeconds: number;
}

export interface LiteRTMemoryInfo {
  totalRamMb: number;
  usedRamMb: number;
  availRamMb: number;
  gpuPrivateMb: number;
  lowMemory: boolean;
}

export interface LiteRTGenerationCallbacks {
  onToken: (token: string) => void;
  onReasoning: (token: string) => void;
  onComplete: (fullContent: string, fullReasoning: string, stats?: LiteRTBenchmarkStats) => void;
  onError: (error: Error) => void;
}

class LiteRTService {
  private loaded = false;
  private activeBackend: LiteRTBackend | null = null;
  private emitter: NativeEventEmitter | null = null;
  private subscriptions: EmitterSubscription[] = [];

  // Accumulated content for current generation
  private currentContent = '';
  private currentReasoning = '';
  private currentToolCallHandler: ((name: string, args: Record<string, unknown>) => Promise<string>) | null = null;

  // Multi-turn tracking — reset conversation only when context changes
  private activeConversationId: string | null = null;
  private activeSystemPrompt: string | null = null;
  private activeToolsJson: string | null = null;
  private _lastBenchmarkStats: LiteRTBenchmarkStats | undefined = undefined;

  // Context usage tracking — cumulative tokens across turns, reset on conversation reset
  private cumulativeTokens = 0;
  private configuredMaxTokens = 4096;

  constructor() {
    if (Platform.OS === 'android' && LiteRTModule) {
      this.emitter = new NativeEventEmitter(LiteRTModule);
      this.emitter.addListener(EVENT_DEBUG_LOG, (msg: string) => {
        useDebugLogsStore.getState().addLog('log', `[Kotlin] ${msg}`);
      });
      logger.log(TAG, 'initialized — native module available');
    } else {
      logger.log(TAG, 'native module not available on this platform');
    }
  }

  // ---------------------------------------------------------------------------
  // loadModel
  // ---------------------------------------------------------------------------

  async loadModel(modelPath: string, preferredBackend: LiteRTBackend, opts: { supportsVision?: boolean; maxNumTokens?: number } = {}): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('LiteRT is not available on this platform');
    }
    const { supportsVision = false, maxNumTokens = 4096 } = opts;
    this.configuredMaxTokens = maxNumTokens;
    logger.log(TAG, `loadModel — path=${modelPath} backend=${preferredBackend} supportsVision=${supportsVision} maxNumTokens=${maxNumTokens}`);

    try {
      const actualBackend: string = await LiteRTModule.loadModel(modelPath, preferredBackend, supportsVision, maxNumTokens);
      this.activeBackend = actualBackend as LiteRTBackend;
      this.loaded = true;
      logger.log(TAG, `loadModel — loaded on ${this.activeBackend}`);
    } catch (e) {
      this.loaded = false;
      this.activeBackend = null;
      logger.log(TAG, `loadModel — failed: ${String(e)}`);
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // resetConversation — cheap: closes + recreates Conversation, Engine stays
  // ---------------------------------------------------------------------------

  async resetConversation(
    systemPrompt: string,
    opts?: {
      samplerConfig?: { temperature?: number; topK?: number; topP?: number };
      tools?: any[];
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
  ): Promise<void> {
    if (!this.isAvailable() || !this.loaded) {
      throw new Error('No LiteRT model loaded');
    }
    const { samplerConfig, tools, history } = opts ?? {};
    const temperature = samplerConfig?.temperature ?? 0.8;
    const topK = samplerConfig?.topK ?? 40;
    const topP = samplerConfig?.topP ?? 0.95;
    const toolsJson = tools && tools.length > 0 ? JSON.stringify(tools) : '';
    const historyJson = history && history.length > 0 ? JSON.stringify(history) : '';
    const dbg = useDebugLogsStore.getState().addLog;
    logger.log(TAG, `resetConversation — systemPrompt length=${systemPrompt.length} temperature=${temperature} topK=${topK} topP=${topP} tools=${tools?.length ?? 0} history=${history?.length ?? 0}`);
    dbg('log', `[LiteRT] resetConversation — systemLen=${systemPrompt.length} temp=${temperature} topK=${topK} topP=${topP} tools=${tools?.length ?? 0} historyTurns=${history?.length ?? 0}`);
    if (history && history.length > 0) {
      const totalHistoryChars = history.reduce((s, m) => s + m.content.length, 0);
      dbg('log', `[LiteRT] resetConversation history — ${history.map((m, i) => `[${i}] ${m.role}(${m.content.length}ch)`).join(' ')}`);
      dbg('log', `[LiteRT] resetConversation history chars — total=${totalHistoryChars} estimatedTokens=~${Math.ceil(totalHistoryChars / 4)}`);
    }
    await LiteRTModule.resetConversation(systemPrompt, temperature, topK, topP, toolsJson, historyJson);
    this.activeSystemPrompt = systemPrompt;
    this.activeToolsJson = toolsJson;
    // Seed the counter with estimated tokens already in the KV cache from history + system prompt.
    // The SDK loads these silently via ConversationConfig.initialMessages so they never appear
    // in lastPrefillTokenCount, causing cumulativeTokens to undercount and auto-compact to fire too late.
    const historyChars = (history ?? []).reduce((sum, m) => sum + m.content.length, 0);
    const systemChars = systemPrompt.length;
    this.cumulativeTokens = Math.ceil((historyChars + systemChars) / 4);
    dbg('log', `[LiteRT] resetConversation done — seeded cumulativeTokens=${this.cumulativeTokens} (historyChars=${historyChars} systemChars=${systemChars})`);
    logger.log(TAG, `resetConversation — done, seeded cumulativeTokens=${this.cumulativeTokens} from history+system estimate`);

  }

  /**
   * Ensure conversation is ready for the given context.
   * Resets only when conversationId or systemPrompt has changed — preserves
   * native turn history for follow-up messages in the same conversation.
   *
   * Auto-compact fires at 65% of context:
   * - Active session: asks the model to summarize what was discussed, then resets
   *   with [summary context + recent turns]. One reset only — summarization runs
   *   in the current KV cache while headroom still exists.
   * - First load (no active session): falls back to slicing the oldest half because
   *   we cannot summarize a session that has not been loaded yet.
   */
  async prepareConversation(
    conversationId: string,
    systemPrompt: string,
    opts?: {
      samplerConfig?: { temperature?: number; topK?: number; topP?: number };
      tools?: any[];
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
  ): Promise<void> {
    const dbg = useDebugLogsStore.getState().addLog;
    const toolsJson = opts?.tools && opts.tools.length > 0 ? JSON.stringify(opts.tools) : '';

    const maxTokens = this.configuredMaxTokens;
    const history = opts?.history;
    const incomingEstimate = history
      ? Math.ceil((history.reduce((s, m) => s + m.content.length, 0) + systemPrompt.length) / 4)
      : 0;

    dbg('log', `[LiteRT] prepareConversation — convId=${conversationId.substring(0, 8)} activeConvId=${this.activeConversationId?.substring(0, 8) ?? 'null'} sameConv=${this.activeConversationId === conversationId}`);
    dbg('log', `[LiteRT] prepareConversation state — cumulativeTokens=${this.cumulativeTokens} maxTokens=${maxTokens} historyTurns=${history?.length ?? 0} incomingEstimate=~${incomingEstimate}`);

    const COMPACT_THRESHOLD = 0.65;
    const needsCompact =
      maxTokens > 0 &&
      history &&
      history.length > 2 &&
      (this.cumulativeTokens > maxTokens * COMPACT_THRESHOLD || incomingEstimate > maxTokens * COMPACT_THRESHOLD);

    dbg('log', `[LiteRT] prepareConversation compact check — needsCompact=${needsCompact} threshold=${Math.floor(maxTokens * COMPACT_THRESHOLD)} cumul=${this.cumulativeTokens} incoming=~${incomingEstimate}`);

    if (needsCompact) {
      contextCompactionService.signalCompacting(true);
      try {
        // Select recent turns that fit within 40% of context by char estimate.
        // Always keep at least the last 2 turns regardless of budget.
        const recentBudgetChars = Math.floor(maxTokens * 0.40) * 4;
        let charCount = 0;
        let recentStart = history!.length;
        for (let i = history!.length - 1; i >= 0; i--) {
          charCount += history![i].content.length;
          if (charCount > recentBudgetChars) break;
          recentStart = i;
        }
        recentStart = Math.min(recentStart, Math.max(0, history!.length - 2));
        const recentHistory = history!.slice(recentStart);

        const hasActiveSession = this.activeConversationId === conversationId;
        let summary: string | null = null;

        if (hasActiveSession) {
          dbg('log', `[LiteRT] compact — active session, requesting summary (cumulative=${this.cumulativeTokens}/${maxTokens})`);
          logger.log(TAG, `prepareConversation — compact: active session at cumulative=${this.cumulativeTokens}/${maxTokens}, requesting summary`);
          summary = await this.summarizeCurrentSession();
          dbg('log', `[LiteRT] compact summary — got=${!!summary} length=${summary?.length ?? 0} chars`);
        } else {
          dbg('log', `[LiteRT] compact — no active session, slicing only (incomingEstimate=~${incomingEstimate}/${maxTokens})`);
          logger.log(TAG, `prepareConversation — compact: first load, incomingEstimate=${incomingEstimate}/${maxTokens}, no active session to summarize — slicing`);
        }

        const compactedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = summary
          ? [
              { role: 'user', content: `[Context from earlier in our conversation]: ${summary}` },
              { role: 'assistant', content: 'Understood.' },
              ...recentHistory,
            ]
          : recentHistory;

        dbg('log', `[LiteRT] compact done — ${history!.length} → ${compactedHistory.length} turns, summarized=${!!summary}`);
        logger.log(TAG, `prepareConversation — compact done: ${history!.length} → ${compactedHistory.length} turns, summarized=${!!summary}`);
        await this.resetConversation(systemPrompt, { samplerConfig: opts?.samplerConfig, tools: opts?.tools, history: compactedHistory });
      } finally {
        contextCompactionService.signalCompacting(false);
      }
      this.activeConversationId = conversationId;
      this.activeSystemPrompt = systemPrompt;
      this.activeToolsJson = toolsJson;
      return;
    }

    const needsReset =
      this.activeConversationId !== conversationId ||
      this.activeSystemPrompt !== systemPrompt ||
      this.activeToolsJson !== toolsJson;

    const resetReason = needsReset
      ? [
          this.activeConversationId !== conversationId ? `newConv(${this.activeConversationId?.substring(0, 8) ?? 'null'}→${conversationId.substring(0, 8)})` : '',
          this.activeSystemPrompt !== systemPrompt ? 'sysPromptChanged' : '',
          this.activeToolsJson !== toolsJson ? 'toolsChanged' : '',
        ].filter(Boolean).join(' ')
      : 'none';

    dbg('log', `[LiteRT] prepareConversation decision — needsReset=${needsReset} reason=${resetReason} historyTurns=${opts?.history?.length ?? 0}`);

    if (needsReset) {
      logger.log(TAG, `prepareConversation — reset (convId changed=${this.activeConversationId !== conversationId}, sysPrompt changed=${this.activeSystemPrompt !== systemPrompt}, tools changed=${this.activeToolsJson !== toolsJson}, history=${opts?.history?.length ?? 0})`);
      await this.resetConversation(systemPrompt, { samplerConfig: opts?.samplerConfig, tools: opts?.tools, history: opts?.history });
      this.activeConversationId = conversationId;
      dbg('log', `[LiteRT] prepareConversation reset complete — activeConvId set to ${conversationId.substring(0, 8)}`);
    } else {
      dbg('log', `[LiteRT] prepareConversation — reusing existing session (multi-turn, no reset)`);
      logger.log(TAG, 'prepareConversation — reusing existing conversation (multi-turn)');
    }
  }

  /**
   * Ask the active session to summarize itself while headroom remains (called at
   * 65% context, so ~35% is free for the request + response).
   * Returns null on timeout or error so callers can fall back to slice.
   */
  private summarizeCurrentSession(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      if (!this.isAvailable() || !this.loaded) {
        resolve(null);
        return;
      }
      let summary = '';
      const timeout = setTimeout(() => {
        logger.log(TAG, 'summarizeCurrentSession — timed out, falling back to slice');
        resolve(null);
      }, 20_000);
      this.sendMessage(
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

  // ---------------------------------------------------------------------------
  // warmup — send a throwaway prompt to prime GPU/NPU shader caches
  // ---------------------------------------------------------------------------

  async warmup(): Promise<void> {
    if (!this.isAvailable() || !this.loaded) return;
    logger.log(TAG, 'warmup — starting');
    try {
      await this.resetConversation('');
      await new Promise<void>((resolve) => {
        this.sendMessage('Hi', {
          onToken: () => {},
          onReasoning: () => {},
          onComplete: () => resolve(),
          onError: () => resolve(),
        });
      });
      // Clear warmup state so first real message gets a fresh conversation
      this.activeConversationId = null;
      this.activeSystemPrompt = null;
      logger.log(TAG, 'warmup — done');
    } catch (e) {
      logger.log(TAG, `warmup — error (ignored): ${String(e)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // sendMessage — sends current turn only, library holds history
  // ---------------------------------------------------------------------------

  async sendMessage(
    text: string,
    callbacks: LiteRTGenerationCallbacks,
    imageUri?: string,
  ): Promise<void> {
    if (!this.isAvailable() || !this.loaded) {
      callbacks.onError(new Error('No LiteRT model loaded'));
      return;
    }

    const sendMsgDbg = useDebugLogsStore.getState().addLog;
    logger.log(TAG, `sendMessage — text length=${text.length}`);
    sendMsgDbg('log', `[Vision] sendMessage called — textLen=${text.length} hasImage=${imageUri != null} imageUri=${imageUri ? imageUri.substring(0, 80) : 'none'}`);

    // Reset accumulators
    this.currentContent = '';
    this.currentReasoning = '';
    // currentToolCallHandler is set by generateRaw before sendMessage is called

    // Wall-clock tracking
    const sendStart = Date.now();
    let firstTokenTime: number | undefined;
    let jsDecodeTokenCount = 0;

    // Register event listeners for this generation
    this.clearSubscriptions();
    this.subscriptions = [
      this.emitter!.addListener(EVENT_TOKEN, (token: string) => {
        if (firstTokenTime === undefined) firstTokenTime = Date.now();
        jsDecodeTokenCount++;
        this.currentContent += token;
        callbacks.onToken(token);
      }),
      this.emitter!.addListener(EVENT_THINKING, (token: string) => {
        this.currentReasoning += token;
        callbacks.onReasoning(token);
      }),
      this.emitter!.addListener(EVENT_COMPLETE, (benchmarkJson: string) => {
        logger.log(TAG, `sendMessage — complete, content=${this.currentContent.length} chars`);
        this.clearSubscriptions();

        this.currentToolCallHandler = null;
        const addLog = useDebugLogsStore.getState().addLog;

        // Parse native benchmark stats for accurate token counts
        let nativePrefillCount = 0;
        let nativeDecodeCount = jsDecodeTokenCount;
        if (benchmarkJson) {
          try {
            const native = JSON.parse(benchmarkJson) as Record<string, number>;
            nativePrefillCount = native.prefillTokenCount ?? 0;
            nativeDecodeCount = native.decodeTokenCount ?? jsDecodeTokenCount;
          } catch { /* use JS fallback counts */ }
        }

        // Accumulate into cumulative context usage
        this.cumulativeTokens += nativePrefillCount + nativeDecodeCount;

        // Build wall-clock stats
        const completeTime = Date.now();
        const ttft = firstTokenTime !== undefined ? (firstTokenTime - sendStart) / 1000 : undefined;
        const decodeElapsed = firstTokenTime !== undefined ? (completeTime - firstTokenTime) / 1000 : undefined;
        const decodeTokensPerSecond = decodeElapsed && decodeElapsed > 0 && jsDecodeTokenCount > 1
          ? jsDecodeTokenCount / decodeElapsed
          : undefined;

        const wallClockStats: LiteRTBenchmarkStats = {
          ttft: ttft ?? 0,
          decodeTokensPerSecond: decodeTokensPerSecond ?? 0,
          prefillTokensPerSecond: 0,
          prefillTokenCount: nativePrefillCount || jsDecodeTokenCount,
          decodeTokenCount: nativeDecodeCount,
          maxNumTokens: this.configuredMaxTokens,
          initTimeSeconds: 0,
        };

        addLog('log', `[LiteRTService] wall-clock stats — ttft=${ttft?.toFixed(3)}s decode=${decodeTokensPerSecond?.toFixed(1)}tok/s tokens=${jsDecodeTokenCount} cumulative=${this.cumulativeTokens}/${this.configuredMaxTokens}`);
        callbacks.onComplete(this.currentContent, this.currentReasoning, wallClockStats);
      }),
      this.emitter!.addListener(EVENT_ERROR, (message: string) => {
        logger.log(TAG, `sendMessage — error: ${message}`);
        this.clearSubscriptions();

        this.currentToolCallHandler = null;
        callbacks.onError(new Error(message));
      }),
      this.emitter!.addListener(EVENT_TOOL_CALL, async (json: string) => {
        logger.log(TAG, `sendMessage — tool call received: ${json.substring(0, 200)}`);
        try {
          const { id, name, arguments: args } = JSON.parse(json) as {
            id: string;
            name: string;
            arguments: Record<string, unknown>;
          };
          const handler = this.currentToolCallHandler;
          const result = handler ? await handler(name, args) : '';
          logger.log(TAG, `sendMessage — responding to tool call id=${id} name=${name} resultLen=${result.length}`);
          await LiteRTModule.respondToToolCall(id, result);
        } catch (e) {
          logger.log(TAG, `sendMessage — tool call handling error: ${String(e)}`);
        }
      }),
    ];

    try {
      sendMsgDbg('log', `[Vision] → LiteRTModule.sendMessage — imageArg=${imageUri != null ? 'SET' : 'NULL'}`);
      await LiteRTModule.sendMessage(text, imageUri ?? null);
    } catch (e) {
      this.clearSubscriptions();
      const err = e instanceof Error ? e : new Error(String(e));
      logger.log(TAG, `sendMessage — native error: ${err.message}`);
      callbacks.onError(err);
    }
  }

  // ---------------------------------------------------------------------------
  // generateRaw — used by the tool loop only.
  // Wraps sendMessage into a Promise<string>. No chat store interaction.
  // ---------------------------------------------------------------------------

  async generateRaw(
    text: string,
    onToken?: (token: string) => void,
    onToolCall?: (name: string, args: Record<string, unknown>) => Promise<string>,
    imageUri?: string,
    onReasoning?: (token: string) => void,
  ): Promise<string> {
    logger.log(TAG, `generateRaw — text=${text.length}ch, hasToolHandler=${!!onToolCall}, hasImage=${!!imageUri}, first100="${text.substring(0, 100)}"`);
    this.currentToolCallHandler = onToolCall ?? null;
    return new Promise((resolve, reject) => {
      this.sendMessage(text, {
        onToken: t => onToken?.(t),
        onReasoning: t => onReasoning?.(t),
        onComplete: (fullContent, _reasoning, stats) => {
          logger.log(TAG, `generateRaw — complete, response=${fullContent.length}ch, first200="${fullContent.substring(0, 200)}"`);
          this._lastBenchmarkStats = stats;
          resolve(fullContent);
        },
        onError: (err) => {
          logger.log(TAG, `generateRaw — error: ${err.message}`);
          this.currentToolCallHandler = null;
          reject(err);
        },
      }, imageUri).catch(reject);
    });
  }

  // ---------------------------------------------------------------------------
  // stopGeneration
  // ---------------------------------------------------------------------------

  async stopGeneration(): Promise<void> {
    if (!this.isAvailable()) return;
    logger.log(TAG, 'stopGeneration');
    this.clearSubscriptions();
    try {
      await LiteRTModule.stopGeneration();
    } catch (e) {
      logger.log(TAG, `stopGeneration — error (ignored): ${String(e)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // unloadModel — expensive: closes Conversation + Engine
  // ---------------------------------------------------------------------------

  async unloadModel(): Promise<void> {
    if (!this.isAvailable()) return;
    logger.log(TAG, 'unloadModel');
    this.clearSubscriptions();
    this.currentToolCallHandler = null;
    this.activeConversationId = null;
    this.activeSystemPrompt = null;
    this.activeToolsJson = null;
    this.cumulativeTokens = 0;
    this.configuredMaxTokens = 4096;
    try {
      await LiteRTModule.unloadModel();
    } catch (e) {
      logger.log(TAG, `unloadModel — error (ignored): ${String(e)}`);
    } finally {
      this.loaded = false;
      this.activeBackend = null;
    }
  }

  // ---------------------------------------------------------------------------
  // State queries
  // ---------------------------------------------------------------------------

  isModelLoaded(): boolean {
    return this.loaded;
  }

  isNPU(): boolean {
    return this.activeBackend === 'npu';
  }

  getActiveBackend(): LiteRTBackend | null {
    return this.activeBackend;
  }

  getLastBenchmarkStats(): LiteRTBenchmarkStats | undefined {
    return this._lastBenchmarkStats;
  }

  getContextUsage(): { used: number; max: number } {
    return { used: this.cumulativeTokens, max: this.configuredMaxTokens };
  }

  isAvailable(): boolean {
    return Platform.OS === 'android' && !!LiteRTModule;
  }

  /**
   * Force the next prepareConversation call to reset native history.
   * Call before regeneration or edit — the JS message array is being rewound,
   * so the native conversation must start fresh from that point.
   */
  invalidateConversation(): void {
    this.activeConversationId = null;
  }

  async getMemoryInfo(): Promise<LiteRTMemoryInfo | null> {
    if (!this.isAvailable()) return null;
    try {
      return await LiteRTModule.getMemoryInfo();
    } catch (e) {
      logger.log(TAG, `getMemoryInfo — error: ${String(e)}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private clearSubscriptions(): void {
    this.subscriptions.forEach(s => s.remove());
    this.subscriptions = [];
  }
}

export const liteRTService = new LiteRTService();
