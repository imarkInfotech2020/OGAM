import { useAppStore } from '../stores/appStore';

export const PRO_URL = 'https://offgridmobileai.co';

const PRO_AHA_THRESHOLD = 3;
const PRO_AHA_MAX_SHOWS = 5;
const PRO_AHA_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type ProPromptVariant = 'text' | 'image';
type ProPromptListener = (variant: ProPromptVariant) => void;

const listeners = new Set<ProPromptListener>();

export function subscribeProPrompt(listener: ProPromptListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitProPrompt(variant: ProPromptVariant): void {
  listeners.forEach(l => l(variant));
}

function canShowProAha(): boolean {
  const s = useAppStore.getState();
  if (s.hasRegisteredPro) return false;
  if (s.proAhaShowCount >= PRO_AHA_MAX_SHOWS) return false;
  if (s.lastProAhaShownAt !== null && Date.now() - s.lastProAhaShownAt < PRO_AHA_COOLDOWN_MS) return false;
  return true;
}

// Called by generationService after each completed text response
export function checkProPromptForText(delayMs: number): void {
  const s = useAppStore.getState();
  if (s.proAhaTriggeredBy === 'image') return;
  if (s.textGenerationCount !== PRO_AHA_THRESHOLD) return;
  if (!canShowProAha()) return;
  s.setProAhaTriggeredBy('text');
  setTimeout(() => emitProPrompt('text'), delayMs);
}

// Called by imageGenerationService after each completed image generation
export function checkProPromptForImage(delayMs: number): void {
  const s = useAppStore.getState();
  if (s.proAhaTriggeredBy === 'text') return;
  if (s.imageGenerationCount !== PRO_AHA_THRESHOLD) return;
  if (!canShowProAha()) return;
  s.setProAhaTriggeredBy('image');
  setTimeout(() => emitProPrompt('image'), delayMs);
}
