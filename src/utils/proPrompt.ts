import { useAppStore } from '../stores/appStore';

export const PRO_URL = 'https://offgridmobileai.co';
export const PRO_WAITLIST_URL = 'https://script.google.com/macros/s/AKfycbzlN88mxRESbXSe0varMVqenIfSrsq5DkNF53Wy8bEWQ84U4W_nlo1evFYQTlz0ojCC/exec';

export async function submitProEmail(email: string): Promise<unknown> {
  console.log('[proPrompt] GET to:', PRO_WAITLIST_URL, 'email:', email);
  const res = await fetch(`${PRO_WAITLIST_URL}?email=${encodeURIComponent(email)}`);
  const text = await res.text();
  console.log('[proPrompt] Response status:', res.status, 'body:', text);
  return text;
}

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
  const cooldownActive = s.lastProAhaShownAt !== null && Date.now() - s.lastProAhaShownAt < PRO_AHA_COOLDOWN_MS;
  if (cooldownActive) return false;
  // Cooldown has expired — reset the cycle so the sheet can show again
  if (s.lastProAhaShownAt !== null && !cooldownActive && s.proAhaTriggeredBy !== null) {
    s.setProAhaTriggeredBy(null);
  }
  return true;
}

// Called by generationService after each completed text response
export function checkProPromptForText(delayMs: number): void {
  const s = useAppStore.getState();
  if (s.proAhaTriggeredBy !== null) return; // already fired this cycle
  if (s.textGenerationCount < PRO_AHA_THRESHOLD) return;
  if (!canShowProAha()) return;
  s.setProAhaTriggeredBy('text');
  setTimeout(() => emitProPrompt('text'), delayMs);
}

// Called by imageGenerationService after each completed image generation
export function checkProPromptForImage(delayMs: number): void {
  const s = useAppStore.getState();
  if (s.proAhaTriggeredBy !== null) return; // already fired this cycle
  if (s.imageGenerationCount < PRO_AHA_THRESHOLD) return;
  if (!canShowProAha()) return;
  s.setProAhaTriggeredBy('image');
  setTimeout(() => emitProPrompt('image'), delayMs);
}
