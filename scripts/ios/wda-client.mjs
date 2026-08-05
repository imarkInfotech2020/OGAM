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
 * This is deliberately small and dependency-free. It is not a test framework: no runner, no assertions, no
 * idle synchronisation. It exists so the physical-device harnesses in this repo can drive an iPhone without
 * depending on anything outside it.
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
}
