/**
 * Put Android in a known IMAGE-GENERATION state before a mesh journey.
 *
 * The image journey used to start in whatever state the app happened to be in, so a slow run and a
 * fast one were not the same test and neither could be compared to the last. This sets the four
 * things that decide what the run actually exercises, through the real controls a person uses:
 *
 *   steps          maximum, so the run is the long path rather than the 4-step preview
 *   size           512, the detailed output rather than the 256 sweet spot
 *   GPU            on, because a CPU-only run is a different engine path entirely
 *   enhancement    off or on, chosen per run - it adds a whole model pass before the image
 *
 * Values are TYPED into each slider's value field rather than dragged: a drag lands wherever the
 * gesture ends, which is how a "maximum steps" run quietly becomes a 47-step one.
 *
 *   node scripts/e2e/prepare-image-settings.mjs --enhancement off
 *   node scripts/e2e/prepare-image-settings.mjs --enhancement on --fresh-chat false
 */
import { AdbClient } from '../android/adb-client.mjs';
import { AppiumAndroidClient } from '../android/appium-client.mjs';
import { flag } from './mesh-config.mjs';

const MAX_IMAGE_STEPS = 50;
const IMAGE_SIZE = 512;

const enhancement = flag('enhancement', 'off').toLowerCase();
if (!['on', 'off'].includes(enhancement)) {
  throw new Error('--enhancement must be on or off');
}
const freshChat = flag('fresh-chat', 'true') === 'true';
const serial = flag('android', '505b53a0');
const appiumUrl = flag('appium', process.env.APPIUM_URL ?? 'http://127.0.0.1:4723');
const packageName = flag('package', 'ai.offgridmobile.dev');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const adb = new AdbClient(serial);
const appium = new AppiumAndroidClient(appiumUrl, serial);

/** Set a slider by typing its value, so the run gets the number this asked for. */
const setSlider = async (testId, value) => {
  await adb.scrollToLabel(`${testId}-value-button`, { maxSwipes: 10 });
  await adb.tapLabel(`${testId}-value-button`);
  await sleep(600);
  await appium.replaceTestId(`${testId}-input`, String(value));
  // Submit by leaving the field: the input commits on blur as well as on submit, and tapping the
  // label beside it cannot land on another control.
  await adb.tapLabel(`${testId}-value-button`).catch(() => undefined);
  await sleep(600);
  const shown = (await adb.labels()).some((label) => label.includes(String(value)));
  if (!shown) throw new Error(`${testId} did not accept ${value}`);
  console.log(`SET   ${testId} = ${value}`);
};

const ensureToggle = async (testId, name, wanted) => {
  await adb.scrollToLabel(testId, { maxSwipes: 10 });
  const labels = await adb.labels();
  const on = labels.includes(`${name}, ON`);
  const off = labels.includes(`${name}, OFF`);
  if (!on && !off) throw new Error(`${name} exposes no state`);
  if (on === wanted) {
    console.log(`KEEP  ${name} already ${wanted ? 'ON' : 'OFF'}`);
    return;
  }
  await adb.tapLabel(testId);
  await sleep(800);
  const after = await adb.labels();
  if (!after.includes(`${name}, ${wanted ? 'ON' : 'OFF'}`)) {
    throw new Error(`${name} did not reach ${wanted ? 'ON' : 'OFF'}`);
  }
  console.log(`SET   ${name} = ${wanted ? 'ON' : 'OFF'}`);
};

await adb.session(packageName);
await appium.session();

if (freshChat) {
  await adb.waitForLabel('home-screen', { label: 'Android home', timeoutMs: 40_000 });
  await adb.scrollAndTap('new-chat-button', { timeoutMs: 20_000 }).catch(async () => {
    await adb.tapLabel('New Chat');
  });
  await adb.waitForLabel('chat-screen', { label: 'a new chat', timeoutMs: 30_000 });
  console.log('OPEN  a new chat');
}

await adb.tapLabel('quick-settings-button');
await adb.waitForLabel('quick-tools', { label: 'in-chat settings', timeoutMs: 20_000 });
console.log('OPEN  in-chat settings');

// The image controls live behind their own section, and the GPU switch behind Advanced inside it.
await adb.scrollAndTap('IMAGE GENERATION', { maxSwipes: 8 });
await sleep(800);

await setSlider('image-steps', MAX_IMAGE_STEPS);
await setSlider('image-size', IMAGE_SIZE);

await adb.scrollAndTap('modal-image-advanced-toggle', { maxSwipes: 8 });
await sleep(800);
await ensureToggle('image-gpu-acceleration', 'GPU Acceleration', true);

await adb.scrollToLabel(`image-enhance-${enhancement}`, { maxSwipes: 10 });
await adb.tapLabel(`image-enhance-${enhancement}`);
await sleep(600);
console.log(`SET   prompt enhancement = ${enhancement.toUpperCase()}`);

await adb.back();
await adb.waitForLabel('chat-screen', { label: 'the prepared chat', timeoutMs: 20_000 });
await appium.close().catch(() => undefined);
console.log(
  `PASS  android  steps=${MAX_IMAGE_STEPS} size=${IMAGE_SIZE} GPU=ON enhancement=${enhancement.toUpperCase()}`,
);
