#!/usr/bin/env bash
set -euo pipefail

# uat.sh — build + ship a UAT/dev build to internal testers (TestFlight + Play internal).
#
# Same fundamental as scripts/release.sh: build LOCALLY (your Mac is far faster than a free
# CI macOS runner), then hand the signed artifact to fastlane for upload. It uploads to the
# EXISTING app (prod bundle id ai.offgridmobile) — TestFlight for iOS, the Play "internal"
# track for Android — so internal testers get the dev build in the same app record. No
# separate .uat app id (see docs at the bottom to switch to a standalone .uat app later).
#
# Usage:
#   scripts/uat.sh                # both platforms
#   scripts/uat.sh --ios          # iOS only
#   scripts/uat.sh --android      # Android only
#
# Credentials (already on this machine for production) are read from fastlane/.env by
# fastlane; this script does not handle secrets. See fastlane/.env.example. On a Mac whose
# login keychain already holds the distribution cert, export SKIP_KEYCHAIN_IMPORT=1.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── args ───────────────────────────────────────────────────────────
DO_IOS=1; DO_ANDROID=1
case "${1:-}" in
  --ios)     DO_ANDROID=0 ;;
  --android) DO_IOS=0 ;;
  "" )       ;;
  * ) error "Unknown arg '$1'. Use --ios, --android, or no arg for both." ;;
esac

# ── pre-flight ─────────────────────────────────────────────────────
command -v node   >/dev/null || error "node is not installed"
command -v bundle >/dev/null || error "bundler is not installed (gem install bundler; then 'bundle install')"
[ -f fastlane/Fastfile ]     || error "fastlane/Fastfile not found (are you on a branch with the fastlane setup?)"
if [ "$DO_ANDROID" = 1 ]; then
  [ -f android/gradlew ]       || error "android/gradlew not found"
  [ -n "${ANDROID_HOME:-}" ]   || error "ANDROID_HOME is not set"
fi
if [ "$DO_IOS" = 1 ]; then
  command -v xcodebuild >/dev/null || error "xcodebuild not installed (need Xcode)"
fi

# ── build number bump (ever-increasing; unique per TestFlight/Play upload) ──
# UAT builds must NOT churn the public marketing version — only the build number needs to
# increase for each internal upload. Mirror release.sh's timestamp strategy, in place, and
# do NOT commit (a UAT build is ephemeral; commit real version bumps via scripts/release.sh).
BUILD_NUMBER=$(date +%s)
MARKETING_VERSION=$(node -p "require('./package.json').version")
info "UAT build ${BOLD}v${MARKETING_VERSION} (build ${BUILD_NUMBER})${NC} — targets prod app id ai.offgridmobile"

if [ "$DO_ANDROID" = 1 ]; then
  sed -i '' "s/versionCode .*/versionCode $BUILD_NUMBER/" android/app/build.gradle
fi
if [ "$DO_IOS" = 1 ]; then
  sed -i '' "s/CURRENT_PROJECT_VERSION = .*/CURRENT_PROJECT_VERSION = $BUILD_NUMBER;/" ios/OffgridMobile.xcodeproj/project.pbxproj
fi

restore_build_number() {
  # The build-number bump is transient — leave the tree as we found it so a UAT build
  # never dirties git or collides with a later scripts/release.sh bump.
  git checkout -- android/app/build.gradle ios/OffgridMobile.xcodeproj/project.pbxproj 2>/dev/null || true
}
trap restore_build_number EXIT

# ── ship ───────────────────────────────────────────────────────────
if [ "$DO_ANDROID" = 1 ]; then
  info "Android: building Release AAB + uploading to Play internal track…"
  bundle exec fastlane android beta
  info "Android UAT build uploaded to Play internal."
fi
if [ "$DO_IOS" = 1 ]; then
  info "iOS: building Release IPA + uploading to TestFlight…"
  bundle exec fastlane ios beta
  info "iOS UAT build uploaded to TestFlight."
fi

echo ""
info "${BOLD}UAT build shipped to internal testers.${NC}"
info "  iOS:     TestFlight (App Store Connect → TestFlight)"
info "  Android: Play Console → Internal testing"
echo ""
# To ship UAT as a SEPARATE app that installs alongside prod (ai.offgridmobile.uat), you'd
# register that bundle/app id in App Store Connect + Play Console with its own provisioning
# profile / upload key, add an Android `.uat` build type (applicationIdSuffix ".uat") and an
# iOS bundle-id override, then point the fastlane beta lanes at it. Deferred by choice — this
# ships to the existing prod app's internal tracks, which works with the signing on hand.
