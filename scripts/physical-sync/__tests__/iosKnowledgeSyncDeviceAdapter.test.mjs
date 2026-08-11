import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  IosKnowledgeSyncDeviceAdapter,
  PhysicalSyncError,
} from '../iosKnowledgeSyncDeviceAdapter.mjs';

let rectIndex = 0;

function node(label, value, children = []) {
  const x = rectIndex * 50;
  rectIndex += 1;
  return {
    label,
    value,
    rect: { x, y: 10, width: 40, height: 40 },
    children,
  };
}

class WdaBoundary {
  constructor() {
    this.screen = 'home';
    this.documents = new Map([['desktop-brief.txt', true]]);
    this.pendingFixture = null;
    this.screenshots = [];
  }

  async isReady() {
    return true;
  }

  async session() {
    this.screen = 'home';
    return 'wda-session';
  }

  async source() {
    rectIndex = 0;
    let root;
    if (this.screen === 'home') {
      root = node('root', undefined, [
        node('settings-tab'),
        node('projects-tab'),
      ]);
    } else if (this.screen === 'settings') {
      root = node('root', undefined, [node('Settings'), node('Open Sync')]);
    } else if (this.screen === 'sync') {
      root = node('root', undefined, [
        node('Sync'),
        node('paired-row', undefined, [
          node('Off Grid AI Desktop'),
          node('macos - Connected'),
        ]),
      ]);
    } else if (this.screen === 'projects') {
      root = node('root', undefined, [
        node('Projects'),
        node('OGAD'),
        node('settings-tab'),
        node('projects-tab'),
      ]);
    } else if (this.screen === 'picker') {
      root = node('root', undefined, [node(this.pendingFixture)]);
    } else if (this.screen === 'picker-selected') {
      root = node('root', undefined, [node(this.pendingFixture), node('Open')]);
    } else if (this.screen === 'remove-confirmation') {
      root = node('root', undefined, [
        ...this.projectNodes(),
        node('Remove Document'),
        node('Remove'),
      ]);
    } else {
      root = node('root', undefined, this.projectNodes());
    }
    this.lastSource = root;
    return root;
  }

  projectNodes() {
    const documents = [...this.documents.entries()].flatMap(
      ([name, enabled]) => [
        node(name),
        node(`Use ${name}`, enabled ? '1' : '0'),
        node(`Remove ${name}`),
      ],
    );
    return [
      node('OGAD'),
      node('Knowledge Base'),
      node('kb-add-document'),
      ...documents,
    ];
  }

  async tap(x, y) {
    let target;
    const walk = current => {
      const rect = current?.rect;
      if (
        rect &&
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
      ) {
        target = current.label;
      }
      for (const child of current?.children ?? []) walk(child);
    };
    walk(this.lastSource);
    if (this.screen === 'home' && target === 'settings-tab') {
      this.screen = 'settings';
    } else if (this.screen === 'settings' && target === 'Open Sync') {
      this.screen = 'sync';
    } else if (this.screen === 'home' && target === 'projects-tab') {
      this.screen = 'projects';
    } else if (this.screen === 'projects' && target === 'OGAD') {
      this.screen = 'project';
    } else if (this.screen === 'project' && target === 'kb-add-document') {
      this.pendingFixture = 'phone-fixture.txt';
      this.screen = 'picker';
    } else if (this.screen === 'picker' && target === this.pendingFixture) {
      this.screen = 'picker-selected';
    } else if (this.screen === 'picker-selected' && target === 'Open') {
      this.documents.set(this.pendingFixture, true);
      this.screen = 'project';
    } else if (this.screen === 'project' && target?.startsWith('Use ')) {
      const name = target.slice(4);
      this.documents.set(name, !this.documents.get(name));
    } else if (this.screen === 'project' && target?.startsWith('Remove ')) {
      this.pendingFixture = target.slice(7);
      this.screen = 'remove-confirmation';
    } else if (this.screen === 'remove-confirmation' && target === 'Remove') {
      this.documents.delete(this.pendingFixture);
      this.screen = 'project';
    }
  }

  async windowSize() {
    return { width: 430, height: 932 };
  }

  async swipe() {}

  async back() {
    this.screen = 'home';
  }

  async screenshot(path) {
    this.screenshots.push(path);
  }
}

test('drives the physical knowledge journey through only WDA and device boundaries', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ios-sync-adapter-'));
  const fixture = join(directory, 'phone-fixture.txt');
  writeFileSync(fixture, 'fixture bytes');
  const actor = new WdaBoundary();
  const device = {
    preflight: async () => ({ appInstalled: true }),
    restartApp: async () => undefined,
  };
  const adapter = new IosKnowledgeSyncDeviceAdapter({
    actor,
    device,
    config: {
      wdaUrl: 'http://iphone.local:8100',
      deviceId: 'physical-iphone',
      bundleId: 'ai.offgridmobile.dev',
      pairedDeviceName: 'Off Grid AI Desktop',
      artifactDir: directory,
    },
  });

  assert.equal((await adapter.execute('preflight')).observed.wdaReady, true);
  assert.equal(
    (await adapter.execute('launch', { timeoutMs: 500 })).observed.connected,
    true,
  );
  assert.equal(
    (
      await adapter.execute('wait-document', {
        project: 'OGAD',
        name: 'desktop-brief.txt',
        present: true,
        enabled: true,
        timeoutMs: 500,
      })
    ).observed.visible,
    true,
  );
  assert.equal(
    (
      await adapter.execute('toggle-document', {
        project: 'OGAD',
        name: 'desktop-brief.txt',
        enabled: false,
        timeoutMs: 500,
      })
    ).observed.enabled,
    false,
  );
  assert.equal(
    (
      await adapter.execute('wait-document', {
        project: 'OGAD',
        name: 'desktop-brief.txt',
        present: true,
        enabled: false,
        timeoutMs: 500,
      })
    ).observed.enabled,
    false,
  );
  assert.equal(
    (
      await adapter.execute('add-fixture', {
        project: 'OGAD',
        fixture,
        timeoutMs: 500,
      })
    ).observed.name,
    'phone-fixture.txt',
  );
  assert.equal(
    (
      await adapter.execute('delete-document', {
        project: 'OGAD',
        name: 'desktop-brief.txt',
        timeoutMs: 500,
      })
    ).observed.deleted,
    true,
  );
  assert.equal(
    (
      await adapter.execute('wait-document', {
        project: 'OGAD',
        name: 'desktop-brief.txt',
        present: false,
        timeoutMs: 500,
      })
    ).observed.present,
    false,
  );
  assert.ok(actor.screenshots.length >= 5);
});

test('rejects a stale WDA URL with the exact relaunch requirement', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ios-sync-stale-wda-'));
  const actor = new WdaBoundary();
  actor.isReady = async () => false;
  const adapter = new IosKnowledgeSyncDeviceAdapter({
    actor,
    device: {
      preflight: async () => ({ appInstalled: true }),
      restartApp: async () => undefined,
    },
    config: {
      wdaUrl: 'http://stale-iphone.local:8100',
      deviceId: 'physical-iphone',
      bundleId: 'ai.offgridmobile.dev',
      pairedDeviceName: 'Off Grid AI Desktop',
      artifactDir: directory,
    },
  });

  await assert.rejects(
    adapter.execute('preflight'),
    error =>
      error instanceof PhysicalSyncError &&
      error.code === 'WDA_UNAVAILABLE' &&
      error.message.includes(
        'WDA_UDID=physical-iphone node scripts/ios/launch-wda.mjs',
      ) &&
      error.message.includes(
        'set IOS_SYNC_WDA_URL to the newly printed WDA_URL',
      ),
  );
});
