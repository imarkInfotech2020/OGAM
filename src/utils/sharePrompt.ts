import { Linking } from 'react-native';

const GITHUB_URL = 'https://github.com/alichherawalla/off-grid-mobile-ai';

const SHARE_TEXT = `Just tried Off Grid - a completely free, open-source AI that runs 100% on your phone. No cloud, no subscriptions, no data leaving your device.

If you believe everyone should have access to private AI, check it out

${GITHUB_URL}`;

// The X app's compose deep link, with the x.com web intent as the fallback.
// Opening the legacy twitter.com/intent link foregrounded the X app without
// composing; the native scheme opens the composer directly, and the web URL
// covers devices without the app (and routes to the app via universal links).
const X_APP_URL = `twitter://post?message=${encodeURIComponent(SHARE_TEXT)}`;
const X_WEB_URL = `https://x.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}`;

/**
 * Open a pre-filled X (Twitter) compose screen: the native app if it's
 * installed (requires `twitter`/`x` in Info.plist LSApplicationQueriesSchemes
 * for canOpenURL to work), otherwise the web intent.
 */
export async function shareOnX(): Promise<void> {
  try {
    if (await Linking.canOpenURL(X_APP_URL)) {
      await Linking.openURL(X_APP_URL);
      return;
    }
  } catch {
    // canOpenURL/openURL can reject (e.g. scheme not whitelisted) — fall back.
  }
  await Linking.openURL(X_WEB_URL);
}

export { GITHUB_URL };

export function shouldShowSharePrompt(count: number): boolean {
  // Skip on first text generation (count === 1) to avoid stacking with other sheets
  // Show on: 2nd text (count === 2), every 10th text (count % 10 === 0), or any image generation
  return count > 1 && ((count > 0 && count % 10 === 0) || count === 2);
}

type ShareVariant = 'text' | 'image';
type SharePromptListener = (variant: ShareVariant) => void;

const listeners = new Set<SharePromptListener>();

export function subscribeSharePrompt(
  listener: SharePromptListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSharePrompt(variant: ShareVariant): void {
  listeners.forEach(l => l(variant));
}
