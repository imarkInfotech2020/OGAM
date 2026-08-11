// The Mac's end of a real transfer, for proving the phones against.
//
// This runs the ACTUAL desktop host - `DesktopBlobChannelHost`, bundled straight from the desktop
// repo - not a re-implementation of it. That is the whole point: a test that talks to a second copy
// of the protocol proves the two copies agree, which is not the thing that matters. Here the bytes
// cross a real socket between two real implementations, sealed on one platform and opened on another.
//
//   node desktop-side.mjs serve  --request-id ID --secret S --dest PATH --size N
//   node desktop-side.mjs stream --request-id ID --secret S --url U --token T --nonce N --source PATH
//
// `serve` prints one JSON line - the endpoint, plus the derived key the native side needs - and then
// prints the outcome once the payload has landed. `stream` sends a file to a phone's endpoint.
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(3);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : args[at + 1];
};

const hostModule = process.env.BLOB_HOST_BUNDLE;
if (!hostModule) {
  console.error('BLOB_HOST_BUNDLE must point at the bundled desktop host');
  process.exit(2);
}
const { DesktopBlobChannelHost } = await import(pathToFileURL(hostModule).href);
const { blobKeyBase64 } = await import(pathToFileURL(process.env.BLOB_SYNC_BUNDLE).href);

const secret = flag('secret');
const requestId = flag('request-id');
const host = new DesktopBlobChannelHost(() => secret);
const say = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const sha256 = (path) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    import('node:fs').then(({ createReadStream }) => {
      const stream = createReadStream(path);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  });

if (process.argv[2] === 'serve') {
  const dest = flag('dest');
  const size = Number(flag('size'));
  const endpoint = await host.serve({
    requestId,
    deviceId: 'phone',
    filePath: dest,
    fileSize: size,
    mode: 'upload',
    onProgress: () => {}
  });
  if (!endpoint) {
    say({ error: 'no endpoint could be offered' });
    process.exit(1);
  }
  say({ ...endpoint, keyBase64: blobKeyBase64(secret, requestId) });
  // The payload lands through the host's own server; watch the file settle at the offered size.
  const deadline = Date.now() + 120_000;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const landed = statSync(dest, { throwIfNoEntry: false });
    if (landed && landed.size === size) {
      say({ received: true, sha256: await sha256(dest) });
      host.dispose();
      process.exit(0);
    }
    if (Date.now() > deadline) {
      say({ received: false, size: landed?.size ?? 0 });
      host.dispose();
      process.exit(1);
    }
  }
}

if (process.argv[2] === 'stream') {
  const source = flag('source');
  try {
    await host.stream({
      endpoint: { url: flag('url'), token: flag('token'), mode: 'upload', nonce: flag('nonce') },
      deviceId: 'phone',
      requestId,
      filePath: source,
      fileSize: statSync(source).size,
      onProgress: () => {}
    });
    say({ sent: true, sha256: await sha256(source) });
    host.dispose();
    process.exit(0);
  } catch (error) {
    say({ sent: false, error: String(error) });
    host.dispose();
    process.exit(1);
  }
}

console.error('usage: serve | stream');
process.exit(2);
