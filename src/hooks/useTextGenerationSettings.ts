import { DEFAULT_SETTINGS } from '../stores/appStore';
import { selectIsLiteRT, useAppStore } from '../stores';

export interface NumericSettingModel {
  key: string;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  formatValue?: (value: number) => string;
  warning?: string | null;
  onChange: (value: number) => void;
}

export const formatContext = (value: number): string =>
  value >= 1024 ? `${(value / 1024).toFixed(0)}K` : String(value);

export const formatMaxTokens = (value: number): string =>
  value >= 1024 ? `${(value / 1024).toFixed(1)}K` : String(value);

/**
 * One headless settings model for both text-generation settings surfaces.
 * The app store owns selected values. Loaded model metadata owns both maxima.
 * Each surface owns only its layout and presentation.
 */
export function useTextGenerationSettings() {
  const isLiteRT = useAppStore(selectIsLiteRT);
  const settings = useAppStore(state => state.settings);
  const updateSettings = useAppStore(state => state.updateSettings);
  const modelMaxContext = useAppStore(state => state.modelMaxContext);

  const temperature = settings.temperature ?? DEFAULT_SETTINGS.temperature;
  const maxTokens = settings.maxTokens ?? DEFAULT_SETTINGS.maxTokens;
  const maxToolCalls = settings.maxToolCalls ?? DEFAULT_SETTINGS.maxToolCalls;
  const contextLength =
    settings.contextLength ?? DEFAULT_SETTINGS.contextLength;
  const topP = settings.topP ?? DEFAULT_SETTINGS.topP;
  const repeatPenalty =
    settings.repeatPenalty ?? DEFAULT_SETTINGS.repeatPenalty;
  const llamaModelLimit =
    modelMaxContext ?? Math.max(maxTokens, contextLength, 512);

  const liteRTTemperature =
    settings.liteRTTemperature ?? DEFAULT_SETTINGS.liteRTTemperature;
  const liteRTMaxTokens =
    settings.liteRTMaxTokens ?? DEFAULT_SETTINGS.liteRTMaxTokens;
  const liteRTTopP = settings.liteRTTopP ?? DEFAULT_SETTINGS.liteRTTopP;
  const liteRTModelLimit = modelMaxContext ?? Math.max(liteRTMaxTokens, 512);

  const toolCalls = {
    key: 'maxToolCalls',
    label: 'Maximum Tool Calls',
    description: 'Emergency limit for tool calls in one response',
    value: maxToolCalls,
    min: 1,
    max: 100,
    step: 1,
    decimals: 0,
    onChange: (value: number) =>
      updateSettings({ maxToolCalls: Math.round(value) }),
  } satisfies NumericSettingModel;

  const llama = {
    temperature: {
      key: 'temperature',
      label: 'Temperature',
      description: 'Higher = more creative, Lower = more focused',
      value: temperature,
      min: 0,
      max: 2,
      step: 0.05,
      decimals: 2,
      onChange: (value: number) => updateSettings({ temperature: value }),
    },
    maxTokens: {
      key: 'maxTokens',
      label: 'Max Tokens',
      description: 'Maximum length of generated response',
      value: maxTokens,
      min: 64,
      max: llamaModelLimit,
      step: 64,
      formatValue: formatMaxTokens,
      onChange: (value: number) => updateSettings({ maxTokens: value }),
    },
    contextLength: {
      key: 'contextLength',
      label: 'Context Length',
      description: 'KV cache size - larger uses more RAM (requires reload)',
      value: contextLength,
      min: 512,
      max: llamaModelLimit,
      step: 1024,
      formatValue: formatContext,
      warning:
        contextLength > 8192
          ? 'High context uses significant RAM and may crash on some devices'
          : null,
      onChange: (value: number) => updateSettings({ contextLength: value }),
    },
    topP: {
      key: 'topP',
      label: 'Top P',
      description: 'Nucleus sampling threshold',
      value: topP,
      min: 0.1,
      max: 1,
      step: 0.05,
      decimals: 2,
      onChange: (value: number) => updateSettings({ topP: value }),
    },
    repeatPenalty: {
      key: 'repeatPenalty',
      label: 'Repeat Penalty',
      description: 'Penalize repeated tokens',
      value: repeatPenalty,
      min: 1,
      max: 2,
      step: 0.05,
      decimals: 2,
      onChange: (value: number) => updateSettings({ repeatPenalty: value }),
    },
  } satisfies Record<string, NumericSettingModel>;

  const liteRT = {
    temperature: {
      key: 'liteRTTemperature',
      label: 'Temperature',
      description: 'Higher = more creative, Lower = more focused',
      value: liteRTTemperature,
      min: 0,
      max: 2,
      step: 0.05,
      decimals: 2,
      onChange: (value: number) => updateSettings({ liteRTTemperature: value }),
    },
    maxTokens: {
      key: 'liteRTMaxTokens',
      label: 'Max Tokens',
      description:
        'Total token budget - input, history, and output combined (requires reload)',
      value: liteRTMaxTokens,
      min: 512,
      max: liteRTModelLimit,
      step: 1024,
      formatValue: formatContext,
      warning:
        liteRTMaxTokens > 8192
          ? 'High context uses significant RAM and may slow or crash on some devices'
          : null,
      onChange: (value: number) => updateSettings({ liteRTMaxTokens: value }),
    },
    topP: {
      key: 'liteRTTopP',
      label: 'Top P',
      description: 'Nucleus sampling threshold',
      value: liteRTTopP,
      min: 0.1,
      max: 1,
      step: 0.05,
      decimals: 2,
      onChange: (value: number) => updateSettings({ liteRTTopP: value }),
    },
  } satisfies Record<string, NumericSettingModel>;

  return { isLiteRT, llama, liteRT, toolCalls };
}
