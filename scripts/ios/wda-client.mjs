/**
 * A minimal WebDriverAgent client — eyes and hands on a real iPhone, over plain HTTP.
 *
 * WDA is Apple's XCUITest runner exposed as a REST server. Once it is up (see launch-wda.mjs) it serves over
 * the device's own address, so no tunnel and no Appium in the middle: observe with /screenshot and /source,
 * act with the W3C /actions endpoint.
 *
 * Callers locate a target by MEANING - its accessibility label - and tap its true on-screen centre, which is
 * why the app's testIDs matter more than pixel coordinates. A layout change moves the centre; it does not
 * break the test.
 *
 * Deliberately small and dependency-free. It is not a test framework - node:test and node:assert are the
 * runner and the assertions - but it does carry the one thing a black-box driver cannot do without:
 * waitFor(), so a test waits for the screen it expects instead of sleeping for a guessed interval.
 *
 * scripts/android/adb-client.mjs implements the same surface over adb, so one test drives both platforms.
 */
import { writeFileSync } from 'node:fs';

export class WdaClient {
  #sessionId = null;
  #baseUrl;

  /** baseUrl e.g. "http://192.168.1.20:8100", printed by launch-wda.mjs. */
  constructor(baseUrl) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
  }

  async #post(path, body) {
    const response = await fetch(this.#baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async #get(path) {
    return (await fetch(this.#baseUrl + path)).json();
  }

  /** Is WDA up and serving? */
  async isReady() {
    try {
      return Boolean((await this.#get('/status')).value);
    } catch {
      return false;
    }
  }

  /** Attach to the foreground app, or launch `bundleId` when one is given. */
  async session(bundleId) {
    const capabilities = bundleId ? { bundleId } : {};
    const created = await this.#post('/session', { capabilities: { alwaysMatch: capabilities } });
    this.#sessionId = created.value?.sessionId ?? created.sessionId ?? null;
    if (!this.#sessionId) {
      const detail = JSON.stringify(created.value ?? created).slice(0, 300);
      throw new Error(`WDA session failed: ${detail}`);
    }
    return this.#sessionId;
  }

  #requireSession() {
    if (!this.#sessionId) throw new Error('No WDA session - call session() first');
    return this.#sessionId;
  }

  /** Logical screen size in points, which is what tap() and swipe() expect. */
  async windowSize() {
    const size = await this.#get(`/session/${this.#requireSession()}/window/size`);
    return { width: size.value.width, height: size.value.height };
  }

  /** Save a PNG screenshot of the device to `path`. */
  async screenshot(path) {
    const shot = await this.#get('/screenshot');
    writeFileSync(path, Buffer.from(shot.value, 'base64'));
  }

  /** The foreground app's accessibility tree. */
  async source() {
    const sid = this.#requireSession();
    const response = await fetch(`${this.#baseUrl}/session/${sid}/source?format=json`);
    return (await response.json()).value;
  }

  /** First element whose label, name or value contains `needle`, case-insensitively. */
  async findByLabel(needle) {
    const wanted = needle.toLowerCase();
    let found = null;
    const walk = (node) => {
      if (!node || found) return;
      const text = `${node.label || node.name || node.value || ''}`;
      if (text.toLowerCase().includes(wanted) && node.rect && node.rect.width > 0) {
        found = {
          label: text,
          type: node.type || '',
          rect: node.rect,
          center: {
            x: Math.round(node.rect.x + node.rect.width / 2),
            y: Math.round(node.rect.y + node.rect.height / 2),
          },
        };
      }
      (node.children || []).forEach(walk);
    };
    walk(await this.source());
    return found;
  }

  /** Tap an absolute point, in logical points, via the W3C actions API. */
  async tap(x, y) {
    await this.#post(`/session/${this.#requireSession()}/actions`, {
      actions: [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x, y },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 60 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
  }

  /** Drag from one point to another - a scroll, for instance. */
  async swipe(x1, y1, x2, y2) {
    await this.#post(`/session/${this.#requireSession()}/actions`, {
      actions: [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: x1, y: y1 },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', duration: 400, x: x2, y: y2 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
  }

  /** Find an element by label and tap its centre. Returns the element, or null when it is not there. */
  async tapLabel(needle) {
    const element = await this.findByLabel(needle);
    if (!element) return null;
    await this.tap(element.center.x, element.center.y);
    return element;
  }

  /** Send text to the focused field. Tap the field first so it has focus. */
  async type(text) {
    await this.#post(`/session/${this.#requireSession()}/wda/keys`, { value: [...text] });
  }

  /** Back one screen. iOS has no hardware back, so this is the edge-swipe-from-left gesture. */
  async back() {
    const { width, height } = await this.windowSize();
    await this.swipe(2, Math.round(height / 2), Math.round(width * 0.6), Math.round(height / 2));
  }

  /**
   * Restart the app so a run starts from a known screen.
   *
   * Same reason as the Android client's: a suite that inherits the previous run's screen fails its first
   * assertion for reasons unrelated to the code. WDA needs a session before it can terminate anything, so this
   * attaches, kills, and launches.
   */
  async restart(bundleId) {
    await this.session();
    const sid = this.#requireSession();
    await this.#post(`/session/${sid}/wda/apps/terminate`, { bundleId }).catch(() => {});
    await this.#post(`/session/${sid}/wda/apps/launch`, { bundleId });
    return sid;
  }

  /**
   * Wait until `check` returns something truthy, polling the device.
   *
   * This is the single most important method here. Driving a real device without it means sleeping for a
   * guessed number of milliseconds after every tap, which is where device tests get their reputation: too
   * short and the test is flaky, too long and a suite takes an hour. Detox avoids this by hooking the React
   * Native bridge to know when the app is idle; a black-box driver cannot, so it polls the thing it actually
   * cares about instead and stops as soon as that is true.
   *
   * Returns whatever `check` returned. Throws with `label` in the message on timeout, because "timed out
   * waiting for the Devices list" is a diagnosis and "timeout" is not.
   */
  async waitFor(check, { label = 'condition', timeoutMs = 15_000, intervalMs = 400 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    for (;;) {
      try {
        const result = await check(this);
        if (result) return result;
      } catch (cause) {
        lastError = cause;
      }
      if (Date.now() >= deadline) {
        const because = lastError ? ` Last error: ${lastError.message}` : '';
        throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}.${because}`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  /** Wait for an element whose label contains `needle`, and return it. */
  waitForLabel(needle, options = {}) {
    return this.waitFor((device) => device.findByLabel(needle), {
      label: `an element labelled "${needle}"`,
      ...options,
    });
  }

  /** Wait for an element to appear, then tap it. The everyday gesture: nothing is tapped blind. */
  async tapWhenReady(needle, options = {}) {
    const element = await this.waitForLabel(needle, options);
    await this.tap(element.center.x, element.center.y);
    return element;
  }

  /** Wait until nothing on screen matches `needle` - a sheet dismissed, a spinner finished. */
  waitForGone(needle, options = {}) {
    return this.waitFor(async (device) => (await device.findByLabel(needle)) === null, {
      label: `"${needle}" to disappear`,
      ...options,
    });
  }

  /**
   * Scroll until `needle` is on screen, then return it.
   *
   * Needed because the two platforms disagree about what "on screen" means. WDA returns the whole accessibility
   * tree including nodes scrolled out of view, so findByLabel alone finds them on iOS. Android's compressed dump
   * contains only what is actually rendered, so anything below the fold does not exist until it is scrolled to.
   * A test that passes on iOS and fails on Android with "no such element" is almost always this.
   */
  async scrollToLabel(needle, { maxSwipes = 8, ...options } = {}) {
    const existing = await this.findByLabel(needle);
    if (existing) return existing;
    const { width, height } = await this.windowSize();
    const x = Math.round(width / 2);
    for (let attempt = 0; attempt < maxSwipes; attempt += 1) {
      await this.swipe(x, Math.round(height * 0.75), x, Math.round(height * 0.3));
      await new Promise((resolve) => setTimeout(resolve, 500));
      const found = await this.findByLabel(needle).catch(() => null);
      if (found) return found;
    }
    throw new Error(`"${needle}" did not appear after ${maxSwipes} swipes.${options.hint ? ` ${options.hint}` : ''}`);
  }

  /**
   * Wait until an element's position stops changing, then return it.
   *
   * A list keeps moving after a swipe - the fling carries on for a few hundred milliseconds. Reading an element's
   * centre during that and then tapping it sends the tap to where the row USED to be, so the tap lands on
   * whatever slid into that space, or on nothing. The symptom is maddening: the element is found, the tap is
   * issued, and the screen simply does not change. Found exactly that way tapping a row near the bottom of the
   * Devices screen.
   *
   * Two identical reads in a row is enough to call it settled.
   */
  async waitForStable(needle, { timeoutMs = 8000, intervalMs = 250, ...rest } = {}) {
    let previous = null;
    return this.waitFor(
      async (device) => {
        const element = await device.findByLabel(needle);
        if (!element) {
          previous = null;
          return null;
        }
        const here = `${element.rect.x},${element.rect.y},${element.rect.width},${element.rect.height}`;
        const settled = previous === here;
        previous = here;
        return settled ? element : null;
      },
      { label: `"${needle}" to stop moving`, timeoutMs, intervalMs, ...rest },
    );
  }

  /** Scroll to an element and tap it - the everyday gesture for anything below the fold. */
  async scrollAndTap(needle, options = {}) {
    await this.scrollToLabel(needle, options);
    // Re-read after the fling has stopped: the centre found while scrolling is already out of date.
    const element = await this.waitForStable(needle);
    await this.tap(element.center.x, element.center.y);
    return element;
  }

  /** Every label currently on screen. The first thing to print when a locator does not match. */
  async labels() {
    const found = [];
    const walk = (node) => {
      if (!node) return;
      const text = `${node.label || node.name || node.value || ''}`.trim();
      if (text && node.rect?.width > 0) found.push(text);
      (node.children || []).forEach(walk);
    };
    walk(await this.source());
    return found;
  }
}
