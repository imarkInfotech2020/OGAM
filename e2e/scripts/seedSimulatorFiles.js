/* eslint-disable */
// NOSONAR
/**
 * Seed test .gguf files into the iOS simulator's File Provider Storage
 * so Maestro can navigate the native file picker and select them.
 *
 * Usage:
 *   node e2e/scripts/seedSimulatorFiles.js
 *
 * Run this BEFORE: maestro test e2e/maestro/import_vision_model.yaml
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// ── Find booted simulator ────────────────────────────────────────────────
const simctlOutput = execSync('xcrun simctl list devices --json').toString();
const devices = JSON.parse(simctlOutput).devices;
let bootedUDID = null;

for (const runtime of Object.values(devices)) {
  for (const device of runtime) {
    if (device.state === 'Booted') {
      bootedUDID = device.udid;
      break;
    }
  }
  if (bootedUDID) break;
}

if (!bootedUDID) {
  console.error('No booted simulator found. Start the iOS simulator first.');
  process.exit(1);
}

console.log(`Booted simulator: ${bootedUDID}`);

// ── Find File Provider Storage ───────────────────────────────────────────
const appGroupBase = path.join(
  process.env.HOME,
  'Library/Developer/CoreSimulator/Devices',
  bootedUDID,
  'data/Containers/Shared/AppGroup',
);

const appGroups = fs.readdirSync(appGroupBase);
let fileProviderDir = null;

for (const group of appGroups) {
  const candidate = path.join(appGroupBase, group, 'File Provider Storage');
  if (fs.existsSync(candidate)) {
    // Pick the one that already has .gguf files (the active Files app storage)
    const files = fs.readdirSync(candidate);
    if (files.some(f => f.endsWith('.gguf') || files.length > 0)) {
      fileProviderDir = candidate;
      break;
    }
  }
}

if (!fileProviderDir) {
  // Fallback: use first File Provider Storage found
  for (const group of appGroups) {
    const candidate = path.join(appGroupBase, group, 'File Provider Storage');
    if (fs.existsSync(candidate)) {
      fileProviderDir = candidate;
      break;
    }
  }
}

if (!fileProviderDir) {
  console.error('Could not find File Provider Storage in simulator.');
  process.exit(1);
}

console.log(`File Provider Storage: ${fileProviderDir}`);

// ── Create minimal valid GGUF files ─────────────────────────────────────
// GGUF header: magic(4) + version(4) + n_tensors(8) + n_kv(8) = 24 bytes
function makeMinimalGguf() {
  const buf = Buffer.alloc(24);
  buf.write('GGUF', 0, 'ascii');          // magic
  buf.writeUInt32LE(3, 4);               // version = 3
  buf.writeBigUInt64LE(0n, 8);           // n_tensors = 0
  buf.writeBigUInt64LE(0n, 16);          // n_kv = 0
  return buf;
}

const testFiles = [
  'e2e-test-model-Q4_K_M.gguf',
  'e2e-test-mmproj-f16.gguf',
];

// Also clean up any previously imported copies from the app's documents dir
const appContainersBase = path.join(
  process.env.HOME,
  'Library/Developer/CoreSimulator/Devices',
  bootedUDID,
  'data/Containers/Data/Application',
);
if (fs.existsSync(appContainersBase)) {
  for (const appId of fs.readdirSync(appContainersBase)) {
    const modelsDir = path.join(appContainersBase, appId, 'Documents/models');
    if (fs.existsSync(modelsDir)) {
      for (const name of testFiles) {
        const imported = path.join(modelsDir, name);
        if (fs.existsSync(imported)) {
          fs.unlinkSync(imported);
          console.log(`Cleaned up previously imported: ${imported}`);
        }
      }
    }
  }
}

// Write fresh test files into the picker storage
for (const name of testFiles) {
  const dest = path.join(fileProviderDir, name);
  fs.writeFileSync(dest, makeMinimalGguf());
  console.log(`Created: ${dest}`);
}

console.log('\nDone. Now run:');
console.log('  maestro test e2e/maestro/import_vision_model.yaml');
