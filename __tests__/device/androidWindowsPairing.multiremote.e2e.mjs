/**
 * Real Android -> Windows pairing, guarded against destructive setup.
 *
 * Acceptance behavior:
 * - both real installations already have Pro and advertise on the LAN;
 * - each visibly lists the other as an unpaired device with Pair, never Connected/Reconnect;
 * - Android enters the code currently shown by Windows;
 * - both screens finish on the other device's stable name and `Connected · LAN`;
 * - the successful connection is left intact.
 *
 * No test teardown forgets, disconnects, changes a licence, edits storage or changes discoverability.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browser } from '@wdio/globals';
import { parse } from 'node-html-parser';
import { PAIRING_CODE } from '../../scripts/e2e/selectors.mjs';

const PACKAGE = 'ai.offgridmobile.dev';
const ARTIFACTS = path.resolve(
  process.env.E2E_ARTIFACT_DIR ?? '.artifacts/wdio/android-windows-pairing',
);
const FINAL_STATUS = 'Connected · LAN';

const id = testId => `id=${testId}`;
const normalizeTestId = (resourceId = '') => resourceId.split(':id/').at(-1);

const exactLines = text =>
  String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

function mobileRows(source) {
  const nodes = parse(source)
    .querySelectorAll('node')
    .map(node => ({
      testId: normalizeTestId(node.getAttribute('resource-id')),
      text: (node.getAttribute('text') ?? '').trim(),
      description: (node.getAttribute('content-desc') ?? '').trim(),
    }));
  const starts = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) =>
      /^sync-(?:discovered|paired)-[0-9a-f]+$/.test(node.testId),
    );
  return starts.map(({ node, index }, rowIndex) => {
    const end = starts[rowIndex + 1]?.index ?? nodes.length;
    const slice = nodes.slice(index, end);
    const controls = new Set(slice.map(entry => entry.testId).filter(Boolean));
    return {
      rowTestId: node.testId,
      deviceId: node.testId.replace(/^sync-(?:discovered|paired)-/, ''),
      lines: slice
        .flatMap(entry => [entry.text, entry.description])
        .filter(Boolean),
      controls,
    };
  });
}

function mobileRowFor(source, name) {
  return mobileRows(source).find(row => row.lines.includes(name));
}

async function existing(element) {
  return element.isExisting().catch(() => false);
}

async function openAndroidSync(android) {
  await android.execute('mobile: activateApp', { appId: PACKAGE });
  if (await existing(android.$(id('sync-this-device')))) return;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const homeTab = android.$(id('home-tab'));
    if (await existing(homeTab)) {
      await homeTab.click();
      break;
    }
    await android.back();
  }

  await android.$(id('home-screen')).waitForExist({ timeout: 40_000 });
  const syncEntry = android.$(
    'android=new UiScrollable(new UiSelector().scrollable(true))' +
      '.scrollIntoView(new UiSelector().resourceId("open-sync-from-home"))',
  );
  await syncEntry.waitForExist({ timeout: 30_000 });
  await syncEntry.click();
  await android.$(id('sync-this-device')).waitForExist({ timeout: 40_000 });
}

async function openWindowsSync(windows) {
  const controlCenter = windows.$('aria/Devices control center');
  if (!(await existing(controlCenter))) {
    const devices = windows.$('aria/Devices');
    await devices.waitForClickable({ timeout: 30_000 });
    await devices.click();
  }
  await controlCenter.waitForExist({ timeout: 30_000 });
}

async function windowsCardFor(windows, name) {
  const cards = await windows.$$('article');
  for (const card of cards) {
    if (!(await card.isDisplayed().catch(() => false))) continue;
    const text = await card.getText();
    if (exactLines(text).includes(name)) return { card, text };
  }
  return undefined;
}

async function waitForWindowsCard(windows, name) {
  let found;
  await windows.waitUntil(
    async () => {
      found = await windowsCardFor(windows, name);
      return Boolean(found);
    },
    {
      timeout: 60_000,
      interval: 1500,
      timeoutMsg: `Windows did not discover ${name}`,
    },
  );
  return found;
}

async function waitForAndroidRow(android, name) {
  let found;
  await android.waitUntil(
    async () => {
      found = mobileRowFor(await android.getPageSource(), name);
      return Boolean(found);
    },
    {
      timeout: 60_000,
      interval: 1500,
      timeoutMsg: `Android did not discover ${name}`,
    },
  );
  return found;
}

async function capture(android, windows, phase) {
  await Promise.all([
    android.saveScreenshot(path.join(ARTIFACTS, `${phase}-android.png`)),
    windows.saveScreenshot(path.join(ARTIFACTS, `${phase}-windows.png`)),
  ]);
}

async function driverLogs(driver, types) {
  const result = {};
  for (const type of types) {
    try {
      result[type] = await driver.getLogs(type);
    } catch (error) {
      result[type] = [
        {
          level: 'ERROR',
          message: `Could not read ${type} logs: ${error.message}`,
        },
      ];
    }
  }
  return result;
}

function assertExpectedName(platform, actual, expected) {
  assert.ok(actual, `${platform} must show a stable local device name`);
  if (expected)
    assert.equal(actual, expected, `${platform} local device name changed`);
}

describe('Off Grid Sync real Android -> Windows pairing', () => {
  it('uses Windows on-screen code and leaves both devices Connected · LAN', async () => {
    const startedAt = new Date();
    const started = Date.now();
    const events = [];
    let outcome = 'failed';
    let androidName;
    let windowsName;
    const android = browser.getInstance('android');
    const windows = browser.getInstance('windows');
    const record = message => {
      events.push({ at: new Date().toISOString(), message });
      console.log(`[android-windows-pairing] ${message}`);
    };

    await mkdir(ARTIFACTS, { recursive: true });

    try {
      await Promise.all([openAndroidSync(android), openWindowsSync(windows)]);

      // Reaching the full Pro-only surfaces is itself the visible entitlement assertion. The free
      // Windows bootstrap omits this nav; the free Android card never renders sync-this-device.
      assert.equal(
        await android.$(id('sync-this-device')).isDisplayed(),
        true,
        'Android is not on Pro Sync',
      );
      assert.equal(
        await windows.$('aria/Devices control center').isDisplayed(),
        true,
        'Windows is not on the full Pro Devices surface',
      );
      assert.equal(
        await windows
          .$('[aria-label^="Manage licensed devices,"]')
          .isDisplayed(),
        true,
        'Windows does not show its Pro licensed-device registry',
      );

      androidName = (await android.$(id('sync-this-device')).getText()).trim();
      const windowsLocal = (
        await windows.$('aria/Rename this device').getText()
      ).trim();
      windowsName = windowsLocal.match(/^This device:\s*(.+)$/)?.[1]?.trim();
      assertExpectedName(
        'Android',
        androidName,
        process.env.E2E_EXPECTED_ANDROID_NAME,
      );
      assertExpectedName(
        'Windows',
        windowsName,
        process.env.E2E_EXPECTED_WINDOWS_NAME,
      );
      record(`stable names: Android=${androidName}; Windows=${windowsName}`);

      const androidDiscoverable = android.$(id('sync-toggle-discoverable'));
      assert.equal(
        await androidDiscoverable.getAttribute('checked'),
        'true',
        'Android is not currently discoverable; refusing to change it',
      );
      const windowsDiscoverable = windows.$(
        'header button[aria-pressed="true"]',
      );
      assert.equal(
        await windowsDiscoverable.isDisplayed(),
        true,
        'Windows is not currently discoverable; refusing to change it',
      );
      assert.match(
        await windows.$('header').getText(),
        /LAN:\s*ready/i,
        'Windows LAN route is not ready',
      );

      let androidRow = await waitForAndroidRow(android, windowsName);
      let windowsRow = await waitForWindowsCard(windows, androidName);

      // Fail closed before the first pairing action. Forget/reconnect/repair are not setup paths.
      assert.match(
        androidRow.rowTestId,
        /^sync-discovered-/,
        'Android has Windows saved already',
      );
      assert.ok(
        androidRow.controls.has(`sync-pair-${androidRow.deviceId}`),
        'Android does not offer Pair',
      );
      assert.ok(
        !androidRow.controls.has(`sync-reconnect-${androidRow.deviceId}`),
        'Android offers Reconnect',
      );
      assert.ok(
        !androidRow.controls.has(`sync-repair-${androidRow.deviceId}`),
        'Android offers Pair again',
      );
      assert.ok(
        !androidRow.lines.some(line => line.includes('Connected')),
        'Android already shows Connected',
      );
      assert.ok(
        androidRow.lines.some(line => /^windows - LAN$/i.test(line)),
        'Android did not discover Windows over LAN',
      );

      let windowsLines = exactLines(windowsRow.text);
      assert.ok(
        windowsLines.includes('Pair'),
        'Windows does not offer Pair for Android',
      );
      assert.ok(
        !windowsLines.includes('Reconnect'),
        'Windows offers Reconnect for Android',
      );
      assert.ok(
        !windowsLines.includes('Pair again'),
        'Windows offers Pair again for Android',
      );
      assert.ok(
        !windowsLines.includes(FINAL_STATUS),
        'Windows already shows Android Connected',
      );
      assert.ok(
        windowsLines.some(line =>
          /Android\s*·\s*LAN\s*·\s*Not paired/i.test(line),
        ),
        'Windows did not discover Android as unpaired over LAN',
      );

      // Re-read immediately before mutation so an asynchronous auto-connect cannot race preflight.
      androidRow = await waitForAndroidRow(android, windowsName);
      windowsRow = await waitForWindowsCard(windows, androidName);
      assert.match(androidRow.rowTestId, /^sync-discovered-/);
      assert.ok(androidRow.controls.has(`sync-pair-${androidRow.deviceId}`));
      assert.ok(exactLines(windowsRow.text).includes('Pair'));

      await capture(android, windows, 'before');
      record('preflight passed; captured both Pair · LAN screens');

      const codeSection = windows.$('[aria-labelledby="sharing-code-heading"]');
      const code = (await codeSection.getText()).match(PAIRING_CODE)?.[1];
      assert.match(
        code ?? '',
        PAIRING_CODE,
        'Windows shows no valid pairing code',
      );

      await android.$(id(`sync-pair-${androidRow.deviceId}`)).click();
      const codeInput = android.$(id('sync-pairing-code-input'));
      await codeInput.waitForExist({ timeout: 30_000 });
      assert.match(
        await android.getPageSource(),
        new RegExp(windowsName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        'Android pairing sheet names a different target',
      );
      await codeInput.setValue(code);
      await android.$(id('sync-pairing-code-confirm')).click();
      record('Android submitted the code currently shown by Windows');

      await Promise.all([
        android.waitUntil(
          async () => {
            const row = mobileRowFor(
              await android.getPageSource(),
              windowsName,
            );
            return Boolean(
              row?.lines.includes(windowsName) &&
                row.lines.some(line =>
                  new RegExp(`^windows - ${FINAL_STATUS}$`, 'i').test(line),
                ),
            );
          },
          {
            timeout: 120_000,
            interval: 2000,
            timeoutMsg: 'Android never showed Windows Connected · LAN',
          },
        ),
        windows.waitUntil(
          async () => {
            const row = await windowsCardFor(windows, androidName);
            const lines = row ? exactLines(row.text) : [];
            return lines.includes(androidName) && lines.includes(FINAL_STATUS);
          },
          {
            timeout: 120_000,
            interval: 2000,
            timeoutMsg: 'Windows never showed Android Connected · LAN',
          },
        ),
      ]);

      await capture(android, windows, 'after');
      outcome = 'passed';
      record(
        `both screens show the reciprocal stable name and ${FINAL_STATUS}`,
      );
    } catch (error) {
      record(`stopped: ${error.message}`);
      await capture(android, windows, 'failure').catch(() => undefined);
      throw error;
    } finally {
      const finishedAt = new Date();
      const elapsedMs = Date.now() - started;
      const [androidLogs, windowsLogs] = await Promise.all([
        driverLogs(android, ['logcat']),
        driverLogs(windows, ['browser', 'driver']),
      ]);
      await Promise.all([
        writeFile(
          path.join(ARTIFACTS, 'android-logs.json'),
          JSON.stringify(androidLogs, null, 2),
        ),
        writeFile(
          path.join(ARTIFACTS, 'windows-logs.json'),
          JSON.stringify(windowsLogs, null, 2),
        ),
        writeFile(
          path.join(ARTIFACTS, 'run-summary.json'),
          JSON.stringify(
            {
              outcome,
              startedAt: startedAt.toISOString(),
              finishedAt: finishedAt.toISOString(),
              elapsedMs,
              androidName,
              windowsName,
              connectionLeftIntact: outcome === 'passed',
              events,
            },
            null,
            2,
          ),
        ),
      ]);
      console.log(
        `[android-windows-pairing] ${outcome} in ${elapsedMs}ms; artifacts: ${ARTIFACTS}`,
      );
    }
  });
});
