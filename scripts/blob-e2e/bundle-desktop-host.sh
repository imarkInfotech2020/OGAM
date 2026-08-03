#!/usr/bin/env bash
# Bundle the real desktop blob host into something node can run, so the phone code can be proven
# against the Mac's actual implementation rather than a stand-in.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
desktop="${DESKTOP_REPO:-$here/../../../desktop}"
out="${1:-$here/.build}"
if [ ! -f "$desktop/pro/main/sync/blob-channel-host.ts" ]; then
  echo "the desktop repo is not checked out at $desktop - skipping" >&2
  exit 3
fi
mkdir -p "$out"
cd "$desktop"
# CommonJS output: a bundle in ESM form turns node's own `require` into a dynamic one, which node
# then refuses to run. The host is Node code either way.
npx esbuild pro/main/sync/blob-channel-host.ts \
  --bundle --platform=node --format=cjs --log-level=warning \
  --outfile="$out/desktop-blob-host.cjs"
node -e "
  const {buildSync}=require('esbuild');
  buildSync({stdin:{contents:\"export * from '@offgrid/sync'\",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:'$out/offgrid-sync.cjs',logLevel:'warning'});
"
echo "$out"
