/**
 * The third device: Off Grid AI Desktop, driven over SSH.
 *
 * A mesh test needs all three participants in ONE process, but the Mac is not this Mac - the phones hang off this
 * machine's USB while the desktop under test is another box on the LAN. So this speaks to it over ssh and reads
 * what it can honestly read.
 *
 * What it deliberately does NOT do is read the app's database. The desktop profile is encrypted
 * (better-sqlite3-multiple-ciphers, keyed through safeStorage), so `sqlite3` cannot open it, and pretending
 * otherwise would mean asserting against a file this cannot decrypt.
 *
 * Instead the Mac is observed the way a person would: is the app running, and what does its Devices screen say.
 * The window text comes from macOS accessibility via osascript - Electron publishes its tree, so the same labels
 * the app renders are readable without Playwright and without restarting it on a throwaway profile (which would
 * have no pairings and prove nothing about the real mesh).
 *
 * The surface mirrors the phone clients where it can - isReady, labels, screenshot, waitFor - so a three-device
 * test reads the same for all three participants.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const HOST = process.env.E2E_DESKTOP_HOST ?? '192.168.1.64';
const USER = process.env.E2E_DESKTOP_USER ?? 'admin';
const PASSWORD = process.env.E2E_DESKTOP_PASSWORD ?? '1234';
const APP_PROCESS = process.env.E2E_DESKTOP_APP ?? 'Off Grid AI Desktop';

export class DesktopSshClient {
  platform = 'macos';

  #ssh(command, { timeoutMs = 30_000 } = {}) {
    return run(
      'sshpass',
      [
        '-e',
        'ssh',
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        'PreferredAuthentications=password',
        '-o',
        'PubkeyAuthentication=no',
        '-o',
        `ConnectTimeout=${Math.ceil(timeoutMs / 3000)}`,
        `${USER}@${HOST}`,
        command,
      ],
      { env: { ...process.env, SSHPASS: PASSWORD }, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
    ).then(({ stdout }) => stdout);
  }

  /** Reachable over the network at all. Separated from appIsRunning so a failure says which. */
  async isReachable() {
    try {
      return (await this.#ssh('echo ok', { timeoutMs: 12_000 })).trim() === 'ok';
    } catch {
      return false;
    }
  }

  /** Is the desktop app actually up? A restarted Mac is reachable long before the app is running. */
  async appIsRunning() {
    try {
      const out = await this.#ssh(`pgrep -fl ${JSON.stringify(APP_PROCESS)} | grep -v grep | wc -l`);
      return Number(out.trim()) > 0;
    } catch {
      return false;
    }
  }

  async isReady() {
    return (await this.isReachable()) && (await this.appIsRunning());
  }

  /** The Mac's own name, which is what the phones should be showing for it. */
  async deviceName() {
    return (await this.#ssh('scutil --get ComputerName')).trim();
  }

  /**
   * Every string macOS accessibility can see in the app's front window.
   *
   * Electron publishes an accessibility tree, so this is the same text the app renders - the labels a phone would
   * be compared against. It needs the Mac to have granted Accessibility permission to sshd/osascript; when it has
   * not, this throws with that as the reason rather than returning an empty list that would read as "the app
   * shows nothing".
   */
  async labels() {
    const script = [
      'tell application "System Events"',
      `  if not (exists process ${JSON.stringify(APP_PROCESS)}) then return "NO_PROCESS"`,
      `  tell process ${JSON.stringify(APP_PROCESS)}`,
      '    try',
      '      set out to {}',
      '      set out to out & (value of every static text of entire contents of front window)',
      '      set out to out & (description of every UI element of entire contents of front window)',
      '      return out as string',
      '    on error errText',
      '      return "ERROR: " & errText',
      '    end try',
      '  end tell',
      'end tell',
    ]
      .map((line) => `-e ${JSON.stringify(line)}`)
      .join(' ');

    const raw = (await this.#ssh(`osascript ${script}`, { timeoutMs: 60_000 })).trim();
    if (raw === 'NO_PROCESS') throw new Error(`${APP_PROCESS} is not running on ${HOST}`);
    if (raw.startsWith('ERROR:')) {
      throw new Error(
        `macOS accessibility refused to read the window (${raw.slice(7).trim()}). ` +
          'Grant Accessibility to the ssh/osascript path in System Settings > Privacy & Security, or read the ' +
          'screenshot instead.',
      );
    }
    // AppleScript joins a list with ", " and leaves empty strings in - drop those, keep the order.
    return raw
      .split(', ')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  /** First label containing `needle`, shaped like the phone clients' findByLabel. */
  async findByLabel(needle) {
    const wanted = needle.toLowerCase();
    const hit = (await this.labels()).find((label) => label.toLowerCase().includes(wanted));
    return hit ? { label: hit } : null;
  }

  /** A screenshot of the Mac's screen, pulled back here. Evidence a person can check. */
  async screenshot(localPath) {
    const remote = '/tmp/offgrid-desktop-shot.png';
    await this.#ssh(`screencapture -x ${remote}`, { timeoutMs: 30_000 });
    await run(
      'sshpass',
      [
        '-e',
        'scp',
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        'PreferredAuthentications=password',
        '-o',
        'PubkeyAuthentication=no',
        `${USER}@${HOST}:${remote}`,
        localPath,
      ],
      { env: { ...process.env, SSHPASS: PASSWORD }, timeout: 60_000 },
    );
  }

  /** Same contract as the phone clients: poll until `check` is truthy, and name what was waited for. */
  async waitFor(check, { label = 'condition', timeoutMs = 60_000, intervalMs = 2000 } = {}) {
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
        throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label} on the Mac.${because}`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  /** Wait for the box to come back and the app to be up - a restart is the normal starting state. */
  waitUntilReady(options = {}) {
    return this.waitFor((desktop) => desktop.isReady(), {
      label: `${HOST} to be reachable with ${APP_PROCESS} running`,
      timeoutMs: 240_000,
      ...options,
    });
  }
}
