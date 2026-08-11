/**
 * Pair any two devices in the mesh, from the command line.
 *
 * This replaces the per-pair scripts. There is no android-to-mac script and no iphone-to-android
 * script any more - there is one operation, and the devices are arguments:
 *
 *   node scripts/e2e/pair-devices.mjs --host macos:192.168.1.25 --joiner android
 *   node scripts/e2e/pair-devices.mjs --host android --joiner ios
 *   node scripts/e2e/pair-devices.mjs --host windows:192.168.1.26 --joiner ios
 *
 * The HOST shows the code; the JOINER enters it. A desktop must already be running with
 * --remote-debugging-port (default 9222) to be driven; phones need adb / WDA_URL as usual.
 */
import { connectSurface, pair } from './sync-surface.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(`--${name}`);
  return at < 0 ? undefined : argv[at + 1];
};

/** `android` | `ios` | `macos:192.168.1.25` | `windows:192.168.1.26:9222` */
const parse = (value, role) => {
  if (!value) throw new Error(`--${role} is required, e.g. --${role} android or --${role} macos:192.168.1.25`);
  const [kind, host, port] = value.split(':');
  return { kind, host, ...(port ? { port: Number(port) } : {}), restart: kind === 'android' || kind === 'ios' };
};

const hostSpec = parse(flag('host'), 'host');
const joinerSpec = parse(flag('joiner'), 'joiner');

const host = await connectSurface(hostSpec);
const joiner = await connectSurface(joinerSpec);

try {
  await Promise.all([host.openDevices(), joiner.openDevices()]);

  // Each device's own name, read off its screen, so the caller does not have to know them. The rows
  // on the other side are addressed by exactly this text.
  const hostName = flag('host-name') ?? (await nameOf(host));
  const joinerName = flag('joiner-name') ?? (await nameOf(joiner));
  console.log(`host   : ${host.platform} "${hostName}"`);
  console.log(`joiner : ${joiner.platform} "${joinerName}"`);

  const result = await pair({ host, joiner, hostName, joinerName });
  if (result.alreadyConnected) console.log('\nPASS  already connected - nothing to do');
  else console.log(`\nPASS  paired with code ${result.code}; both sides report it`);
} catch (error) {
  console.log(`\nFAIL  ${error.message}`);
  process.exitCode = 1;
} finally {
  await host.close();
  await joiner.close();
}

/**
 * What a device calls ITSELF, taken from its own screen.
 *
 * RN prints "This device" under the name; Electron prints "This device: <name>". Both are read here
 * rather than passed in, because a name typed on the command line goes stale the moment someone
 * renames a device - which happened twice while this harness was being built.
 */
async function nameOf(surface) {
  const text = await surface.text();
  if (surface.family === 'electron') {
    const match = text.match(/This device:\s*(.+)/);
    if (match) return match[1].trim();
  } else {
    const lines = text.split('\n').map((line) => line.trim());
    const at = lines.indexOf('sync-this-device');
    if (at < 0) throw new Error(`no device card on ${surface.platform}`);
    // NEAREST valid neighbour, searched both ways. The two RN platforms order the accessibility tree
    // differently - iOS emits the name just BEFORE the marker, Android just after - so reading in
    // either single direction is right on one phone and returns a caption on the other.
    const caption = new Set([
      'This device',
      'Discoverable',
      'Not discoverable',
      'Hidden',
      'PERSONAL MESH',
      'Rename this device',
      'Discoverable to new devices',
    ]);
    const usable = (line) =>
      Boolean(line) &&
      !line.startsWith('sync-') &&
      !caption.has(line) &&
      !/^\d+$/.test(line) &&
      !/devices saved|connected|Let new devices/i.test(line);
    for (let step = 1; step <= 3; step += 1) {
      for (const index of [at - step, at + step]) {
        if (index >= 0 && index < lines.length && usable(lines[index])) return lines[index];
      }
    }
  }
  throw new Error(`could not read the device name on ${surface.platform}`);
}
