#!/usr/bin/env bash
# Compile the iPhone's blob-channel code for the command line, from the app's OWN sources, so the
# other platforms can be tested against it. Nothing here is written for the test: the four files are
# the ones the app ships, and `main.swift` only parses arguments and calls them.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ios="$here/../../ios"
out="${1:-$here/.build}"
mkdir -p "$out"
swiftc -O -o "$out/blob-harness-ios" \
  "$ios/BlobFrameCipher.swift" \
  "$ios/BlobChannelSupport.swift" \
  "$ios/BlobChannelServer.swift" \
  "$ios/BlobChannelUploader.swift" \
  "$ios/e2e/main.swift"
echo "$out/blob-harness-ios"
