#!/usr/bin/env -S node --experimental-strip-types --no-warnings

import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { WdaClient } from '../ios/wda-client.mjs';
import {
  IosKnowledgeSyncDeviceAdapter,
  PhysicalSyncError,
} from './iosKnowledgeSyncDeviceAdapter.mjs';

const execFileAsync = promisify(execFile);
const schemaVersion = 1;

class DevicectlBoundary {
  constructor({ deviceId, bundleId }) {
    this.deviceId = deviceId;
    this.bundleId = bundleId;
  }

  async preflight() {
    await execFileAsync('xcrun', [
      'devicectl',
      'device',
      'info',
      'details',
      '--device',
      this.deviceId,
    ]);
    const { stdout } = await execFileAsync('xcrun', [
      'devicectl',
      'device',
      'info',
      'apps',
      '--device',
      this.deviceId,
    ]);
    return { appInstalled: stdout.includes(this.bundleId) };
  }

  async restartApp() {
    await execFileAsync('xcrun', [
      'devicectl',
      'device',
      'process',
      'launch',
      '--device',
      this.deviceId,
      '--terminate-existing',
      this.bundleId,
    ]);
  }
}

function configFromEnvironment() {
  const wdaUrl = process.env.IOS_SYNC_WDA_URL;
  const deviceId = process.env.IOS_DEVICE_ID;
  if (!wdaUrl || !deviceId) {
    throw new PhysicalSyncError(
      'MISSING_CONFIG',
      'IOS_SYNC_WDA_URL and IOS_DEVICE_ID are required',
    );
  }
  return {
    wdaUrl: wdaUrl.replace(/\/$/, ''),
    deviceId,
    bundleId: process.env.IOS_SYNC_BUNDLE_ID ?? 'ai.offgridmobile.dev',
    pairedDeviceName:
      process.env.IOS_SYNC_PAIRED_DEVICE ?? 'Off Grid AI Desktop',
    artifactDir: resolve(
      process.env.IOS_SYNC_ARTIFACT_DIR ??
        '.artifacts/physical-sync/ios-knowledge',
    ),
  };
}

function createAdapter() {
  const config = configFromEnvironment();
  return new IosKnowledgeSyncDeviceAdapter({
    actor: new WdaClient(config.wdaUrl),
    device: new DevicectlBoundary(config),
    config,
  });
}

function responseFor(request, result) {
  return {
    schemaVersion,
    id: request.id ?? null,
    action: request.action,
    status: 'ok',
    ...result,
  };
}

function errorResponse(request, error) {
  return {
    schemaVersion,
    id: request?.id ?? null,
    action: request?.action ?? null,
    status: 'error',
    error: {
      code:
        error instanceof PhysicalSyncError ? error.code : 'UNEXPECTED_ERROR',
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof PhysicalSyncError && error.details
        ? { details: error.details }
        : {}),
    },
  };
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function parseRequest(line) {
  const request = JSON.parse(line);
  if (
    !request ||
    typeof request !== 'object' ||
    typeof request.action !== 'string'
  ) {
    throw new PhysicalSyncError(
      'INVALID_REQUEST',
      'Each JSONL request requires an action string',
    );
  }
  return request;
}

async function runRequest(adapter, request) {
  try {
    const result = await adapter.execute(request.action, request.args ?? {});
    return responseFor(request, result);
  } catch (error) {
    return errorResponse(request, error);
  }
}

async function serve(adapter) {
  const input = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  for await (const line of input) {
    if (!line.trim()) continue;
    let request;
    try {
      request = parseRequest(line);
      writeJson(await runRequest(adapter, request));
    } catch (error) {
      writeJson(errorResponse(request, error));
    }
  }
}

function oneShotRequest(argv) {
  const [action, ...values] = argv;
  switch (action) {
    case 'preflight':
    case 'screenshot':
      return { id: 'cli', action, args: values[0] ? { path: values[0] } : {} };
    case 'launch':
      return {
        id: 'cli',
        action,
        args: {
          restart: values.includes('--restart'),
          pairedDeviceName: values.find(value => value !== '--restart'),
        },
      };
    case 'wait-document':
    case 'delete-document':
      return {
        id: 'cli',
        action,
        args: { project: values[0], name: values[1] },
      };
    case 'add-fixture':
      return {
        id: 'cli',
        action,
        args: { project: values[0], fixture: values[1] },
      };
    case 'toggle-document':
      return {
        id: 'cli',
        action,
        args: {
          project: values[0],
          name: values[1],
          enabled:
            values[2] === 'on' ? true : values[2] === 'off' ? false : undefined,
        },
      };
    default:
      throw new PhysicalSyncError(
        'INVALID_ARGUMENT',
        'Use serve, preflight, launch, wait-document, add-fixture, toggle-document, delete-document, or screenshot',
      );
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  let adapter;
  try {
    adapter = createAdapter();
  } catch (error) {
    writeJson(errorResponse({ action: command ?? null }, error));
    process.exitCode = 2;
    return;
  }
  if (command === 'serve') {
    await serve(adapter);
    return;
  }
  let request;
  try {
    request = oneShotRequest([command, ...args]);
  } catch (error) {
    writeJson(errorResponse({ action: command ?? null }, error));
    process.exitCode = 2;
    return;
  }
  const response = await runRequest(adapter, request);
  writeJson(response);
  if (response.status === 'error') process.exitCode = 1;
}

await main();
