#!/usr/bin/env bash
# On-device e2e: the "Auto-discover on Wi-Fi" Settings toggle actually gates the automatic LAN scan.
#
# The automatic remote-LLM discovery (background scan that finds + auto-adds Ollama/LM Studio/gateway
# servers) must run ONLY when the toggle is ON. Fresh installs are OFF. This asserts the un-fakeable
# gate decision from the app's own debug log after a Home mount:
#
#   PHASE=off  → the log shows "[HomeScreen] LAN auto-discovery disabled in settings — skipping",
#               NO "enabled — scanning" line, and ZERO new-server auto-adds this launch.
#   PHASE=on   → the log shows "[HomeScreen] LAN auto-discovery enabled — scanning" and NO skip line.
#
# Both phases key on the runLANDiscovery gate's OWN decision line — not on RemoteServerManager
# health-checks of ALREADY-configured servers (those refresh regardless of this setting and must not
# be counted as auto-discovery).
#
# The toggle flip + app reload are operator-driven (Settings → Remote Servers → Auto-discover switch,
# then reload Home); this script owns the deterministic log assertion. PLATFORM=android|ios.
#
#   PLATFORM=android bash remoteAutoDiscoveryToggle.e2e.sh <off|on>
set -uo pipefail
PLATFORM="${PLATFORM:-android}"
IOS_UDID="${IOS_UDID:-00008150-000225103CD8C01C}"
PKG=ai.offgridmobile.dev
SKIP_LINE='LAN auto-discovery disabled in settings'

read_log() {
  if [ "$PLATFORM" = ios ]; then
    xcrun devicectl device copy from --device "$IOS_UDID" --domain-type appDataContainer \
      --domain-identifier "$PKG" --source Documents/offgrid-debug.log --destination /tmp/autodisc-ios.log >/dev/null 2>&1
    cat /tmp/autodisc-ios.log 2>/dev/null
  else
    export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
    adb exec-out run-as "$PKG" sh -c 'cat files/offgrid-debug.log 2>/dev/null'
  fi
}

# Only look at the CURRENT launch: everything after the last "session start" marker.
current_session() { read_log | awk 'BEGIN{s=""} /session start/{s=""} {s=s $0 "\n"} END{printf "%s", s}'; }

SCAN_LINE='LAN auto-discovery enabled — scanning'
ADD_LINE='Auto-adding discovered server'
DUMP=$(current_session)
SKIP=$(printf '%s' "$DUMP" | grep -ac "$SKIP_LINE")
SCAN=$(printf '%s' "$DUMP" | grep -ac "$SCAN_LINE")
ADDS=$(printf '%s' "$DUMP" | grep -ac "$ADD_LINE")

case "${1:?phase: off|on}" in
  off)
    echo "[$PLATFORM] skip=$SKIP scanning=$SCAN new-server-adds=$ADDS"
    if [ "$SKIP" -ge 1 ] && [ "$SCAN" -eq 0 ] && [ "$ADDS" -eq 0 ]; then
      echo "PASS(off): auto-discovery gated OFF — logged skip, never entered the scan, added no servers"
    else
      echo "FAIL(off): expected skip>=1 & scanning=0 & adds=0; got skip=$SKIP scanning=$SCAN adds=$ADDS"; exit 1
    fi ;;
  on)
    echo "[$PLATFORM] skip=$SKIP scanning=$SCAN new-server-adds=$ADDS"
    if [ "$SKIP" -eq 0 ] && [ "$SCAN" -ge 1 ]; then
      echo "PASS(on): auto-discovery ON — entered the scan this session, no skip"
    else
      echo "FAIL(on): expected skip=0 & scanning>=1; got skip=$SKIP scanning=$SCAN"; exit 1
    fi ;;
  *) echo "unknown phase $1"; exit 2 ;;
esac
