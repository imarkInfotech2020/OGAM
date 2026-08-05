import { basename, dirname, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
const DEFAULT_TIMEOUT_MS = 30_000;
const PICKER_TIMEOUT_MS = 120_000;
export class PhysicalSyncError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'PhysicalSyncError';
    this.code = code;
    this.details = details;
  }
}
function textOf(node) {
  return String(node?.label ?? node?.name ?? node?.value ?? '').trim();
}
function childrenOf(node) {
  return Array.isArray(node?.children) ? node.children : [];
}
function findNode(root, predicate) {
  if (!root) return null;
  if (Array.isArray(root)) {
    for (const node of root) {
      const found = findNode(node, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(root)) return root;
  for (const child of childrenOf(root)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}
function nodeCenter(node) {
  const rect = node?.rect;
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  };
}
function exactNode(root, label) {
  const expected = label.trim().toLocaleLowerCase();
  return findNode(
    root,
    node =>
      textOf(node).toLocaleLowerCase() === expected &&
      nodeCenter(node) !== null,
  );
}
function containsNode(root, label) {
  const expected = label.trim().toLocaleLowerCase();
  return findNode(
    root,
    node =>
      textOf(node).toLocaleLowerCase().includes(expected) &&
      nodeCenter(node) !== null,
  );
}
function subtreeText(node) {
  return [textOf(node), ...childrenOf(node).map(subtreeText)]
    .filter(Boolean)
    .join('\n');
}
function containsPairRow(root, deviceName) {
  const expectedName = deviceName.toLocaleLowerCase();
  return Boolean(
    findNode(root, node => {
      const text = subtreeText(node).toLocaleLowerCase();
      return text.includes(expectedName) && text.includes('connected');
    }),
  );
}
function switchValue(node) {
  const value = String(node?.value ?? '').toLocaleLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(value)) return true;
  if (['0', 'false', 'off', 'no'].includes(value)) return false;
  return undefined;
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

export class IosKnowledgeSyncDeviceAdapter {
  constructor({ actor, device, config }) {
    this.actor = actor;
    this.device = device;
    this.config = config;
    this.hasSession = false;
    this.artifactIndex = 0;
    mkdirSync(config.artifactDir, { recursive: true });
  }

  async execute(action, args = {}) {
    switch (action) {
      case 'preflight':
        return this.preflight();
      case 'launch':
        return this.launch(args);
      case 'wait-document':
        return this.waitDocument(args);
      case 'add-fixture':
        return this.addFixture(args);
      case 'toggle-document':
        return this.toggleDocument(args);
      case 'delete-document':
        return this.deleteDocument(args);
      case 'screenshot':
        return this.screenshot(args);
      default:
        throw new PhysicalSyncError(
          'UNKNOWN_ACTION',
          `Unknown Mobile physical Sync action: ${action}`,
        );
    }
  }

  async preflight() {
    const [wdaReady, device] = await Promise.all([
      this.actor.isReady(),
      this.device.preflight(),
    ]);
    if (!wdaReady) {
      throw new PhysicalSyncError(
        'WDA_UNAVAILABLE',
        `WebDriverAgent is not reachable at ${this.config.wdaUrl}. Run ` +
          `WDA_UDID=${this.config.deviceId} node scripts/ios/launch-wda.mjs, ` +
          'then set IOS_SYNC_WDA_URL to the newly printed WDA_URL',
      );
    }
    if (!device.appInstalled) {
      throw new PhysicalSyncError(
        'APP_NOT_INSTALLED',
        `${this.config.bundleId} is not installed on ${this.config.deviceId}`,
      );
    }
    return {
      observed: {
        wdaReady,
        deviceReachable: true,
        appInstalled: true,
        deviceId: this.config.deviceId,
        bundleId: this.config.bundleId,
      },
    };
  }

  async launch(args) {
    const pairedDeviceName =
      args.pairedDeviceName ?? this.config.pairedDeviceName;
    if (args.restart === true) {
      await this.device.restartApp();
    }
    await this.actor.session(this.config.bundleId);
    this.hasSession = true;
    await this.openSync();
    await this.waitFor(
      root => containsPairRow(root, pairedDeviceName),
      `paired device ${pairedDeviceName} to report Connected`,
      args.timeoutMs,
    );
    const artifact = await this.capture('launch-connected');
    return {
      observed: {
        pairedDeviceName,
        paired: true,
        connected: true,
        restarted: args.restart === true,
      },
      artifacts: [artifact],
    };
  }

  async waitDocument(args) {
    const { project, name } = this.requireDocumentArgs(args);
    await this.openProject(project, args.timeoutMs);
    const expectedPresent = args.present !== false;
    if (!expectedPresent) {
      await this.waitFor(
        root =>
          exactNode(root, 'kb-add-document') !== null &&
          exactNode(root, name) === null,
        `document ${name} to disappear from project ${project}`,
        args.timeoutMs,
      );
      const artifact = await this.capture(`document-absent-${name}`);
      return {
        observed: { project, name, visible: false, present: false },
        artifacts: [artifact],
      };
    }
    await this.waitFor(
      root => {
        if (!exactNode(root, name)) return false;
        if (typeof args.enabled !== 'boolean') return true;
        const toggle = exactNode(root, `Use ${name}`);
        return toggle && switchValue(toggle) === args.enabled;
      },
      typeof args.enabled === 'boolean'
        ? `document ${name} enabled=${args.enabled} in project ${project}`
        : `document ${name} in project ${project}`,
      args.timeoutMs,
    );
    const artifact = await this.capture(`document-${name}`);
    return {
      observed: {
        project,
        name,
        visible: true,
        present: true,
        ...(typeof args.enabled === 'boolean' ? { enabled: args.enabled } : {}),
      },
      artifacts: [artifact],
    };
  }

  async addFixture(args) {
    const project = this.requireString(args.project, 'project');
    const fixture = resolve(this.requireString(args.fixture, 'fixture'));
    if (!existsSync(fixture)) {
      throw new PhysicalSyncError(
        'FIXTURE_NOT_FOUND',
        `Fixture does not exist on the Mac: ${fixture}`,
      );
    }
    const name = basename(fixture);
    await this.openProject(project, args.timeoutMs);
    await this.tapRequired('kb-add-document', 'Add document');
    let fixtureNode;
    try {
      fixtureNode = await this.waitFor(
        root => exactNode(root, name),
        `fixture ${name} in the iOS Files picker`,
        args.timeoutMs ?? PICKER_TIMEOUT_MS,
      );
    } catch (error) {
      throw new PhysicalSyncError(
        'FIXTURE_NOT_STAGED',
        `${name} must already exist in an iOS Files provider before add-fixture runs`,
        { fixture, cause: error.message },
      );
    }
    await this.tapNode(fixtureNode);
    const openButton = await this.waitForOptional(
      root => exactNode(root, 'Open'),
      1_500,
    );
    if (openButton) await this.tapNode(openButton);
    await this.waitFor(
      root => exactNode(root, 'kb-add-document') && exactNode(root, name),
      `${name} to finish indexing in project ${project}`,
      args.timeoutMs ?? PICKER_TIMEOUT_MS,
    );
    const artifact = await this.capture(`added-${name}`);
    return {
      observed: {
        project,
        name,
        visible: true,
        picker: 'ios-files',
        staging: 'external-files-provider',
      },
      artifacts: [artifact],
    };
  }

  async toggleDocument(args) {
    const { project, name } = this.requireDocumentArgs(args);
    if (typeof args.enabled !== 'boolean') {
      throw new PhysicalSyncError(
        'INVALID_ARGUMENT',
        'toggle-document requires args.enabled as a boolean',
      );
    }
    await this.openProject(project, args.timeoutMs);
    const label = `Use ${name}`;
    const toggle = await this.waitFor(
      root => exactNode(root, label),
      `toggle for ${name}`,
      args.timeoutMs,
    );
    const before = switchValue(toggle);
    if (before === undefined) {
      throw new PhysicalSyncError(
        'UNREADABLE_SWITCH',
        `Could not read the enabled state for ${name}`,
      );
    }
    if (before !== args.enabled) await this.tapNode(toggle);
    await this.waitFor(
      root => {
        const current = exactNode(root, label);
        return current && switchValue(current) === args.enabled;
      },
      `${name} enabled=${args.enabled}`,
      args.timeoutMs,
    );
    const artifact = await this.capture(
      `${args.enabled ? 'enabled' : 'disabled'}-${name}`,
    );
    return {
      observed: {
        project,
        name,
        enabled: args.enabled,
        changed: before !== args.enabled,
      },
      artifacts: [artifact],
    };
  }

  async deleteDocument(args) {
    const { project, name } = this.requireDocumentArgs(args);
    await this.openProject(project, args.timeoutMs);
    await this.tapRequired(`Remove ${name}`, `remove control for ${name}`);
    await this.waitFor(
      root => exactNode(root, 'Remove Document'),
      'Remove Document confirmation',
      args.timeoutMs,
    );
    await this.tapRequired('Remove', 'Remove confirmation button');
    await this.waitFor(
      root =>
        exactNode(root, 'kb-add-document') !== null &&
        exactNode(root, name) === null,
      `${name} to disappear from project ${project}`,
      args.timeoutMs,
    );
    const artifact = await this.capture(`deleted-${name}`);
    return {
      observed: { project, name, visible: false, deleted: true },
      artifacts: [artifact],
    };
  }

  async screenshot(args) {
    await this.ensureSession();
    const path = args.path
      ? resolve(args.path)
      : this.artifactPath(args.label ?? 'screenshot');
    mkdirSync(dirname(path), { recursive: true });
    await this.actor.screenshot(path);
    return { observed: { captured: true }, artifacts: [path] };
  }

  async ensureSession() {
    if (this.hasSession) return;
    await this.actor.session(this.config.bundleId);
    this.hasSession = true;
  }

  async openSync() {
    await this.ensureSession();
    await this.returnToTabs('settings-tab');
    await this.tapRequired('settings-tab', 'Settings tab');
    await this.waitFor(root => exactNode(root, 'Settings'), 'Settings screen');
    const openSync = await this.findWithScroll('Open Sync');
    await this.tapNode(openSync);
    await this.waitFor(root => exactNode(root, 'Sync'), 'Sync screen');
  }

  async openProject(project, timeoutMs) {
    await this.ensureSession();
    const current = await this.actor.source();
    if (exactNode(current, 'Knowledge Base') && exactNode(current, project)) {
      return;
    }
    await this.returnToTabs('projects-tab');
    await this.tapRequired('projects-tab', 'Projects tab');
    await this.waitFor(root => exactNode(root, 'Projects'), 'Projects screen');
    const projectNode = await this.findWithScroll(project, timeoutMs);
    await this.tapNode(projectNode);
    await this.waitFor(
      root => exactNode(root, 'Knowledge Base') && exactNode(root, project),
      `project ${project}`,
      timeoutMs,
    );
  }

  async returnToTabs(tabLabel) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const root = await this.actor.source();
      if (exactNode(root, tabLabel)) return;
      await this.actor.back();
      const found = await this.waitForOptional(
        next => exactNode(next, tabLabel),
        2_000,
      );
      if (found) return;
    }
    throw new PhysicalSyncError(
      'NAVIGATION_FAILED',
      `Could not return to the tab bar for ${tabLabel}`,
    );
  }

  async findWithScroll(label, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    const { width, height } = await this.actor.windowSize();
    while (Date.now() < deadline) {
      const root = await this.actor.source();
      const found = exactNode(root, label) ?? containsNode(root, label);
      if (found) return found;
      await this.actor.swipe(
        Math.round(width / 2),
        Math.round(height * 0.78),
        Math.round(width / 2),
        Math.round(height * 0.28),
      );
    }
    throw new PhysicalSyncError(
      'ELEMENT_TIMEOUT',
      `Timed out waiting for ${label}`,
    );
  }

  async tapRequired(label, description) {
    const node = await this.waitFor(
      root => exactNode(root, label) ?? containsNode(root, label),
      description,
    );
    await this.tapNode(node);
  }

  async tapNode(node) {
    const center = nodeCenter(node);
    if (!center) {
      throw new PhysicalSyncError(
        'ELEMENT_NOT_TAPPABLE',
        `Element ${textOf(node)} has no tappable rectangle`,
      );
    }
    await this.actor.tap(center.x, center.y);
  }

  async waitFor(predicate, description, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    do {
      const root = await this.actor.source();
      const result = predicate(root);
      if (result) return result;
      await delay(150);
    } while (Date.now() < deadline);
    throw new PhysicalSyncError(
      'ELEMENT_TIMEOUT',
      `Timed out waiting for ${description}`,
    );
  }

  async waitForOptional(predicate, timeoutMs) {
    try {
      return await this.waitFor(predicate, 'optional element', timeoutMs);
    } catch (error) {
      if (
        error instanceof PhysicalSyncError &&
        error.code === 'ELEMENT_TIMEOUT'
      ) {
        return null;
      }
      throw error;
    }
  }

  async capture(label) {
    const path = this.artifactPath(label);
    await this.actor.screenshot(path);
    return path;
  }

  artifactPath(label) {
    this.artifactIndex += 1;
    const safe = label.replaceAll(/[^a-z0-9._-]+/gi, '-').toLocaleLowerCase();
    return resolve(
      this.config.artifactDir,
      `${String(this.artifactIndex).padStart(2, '0')}-${safe}.png`,
    );
  }

  requireDocumentArgs(args) {
    return {
      project: this.requireString(args.project, 'project'),
      name: this.requireString(args.name, 'name'),
    };
  }

  requireString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new PhysicalSyncError(
        'INVALID_ARGUMENT',
        `${field} must be a non-empty string`,
      );
    }
    return value.trim();
  }
}
