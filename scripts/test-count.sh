#!/bin/bash
# Counts all tests across platforms and prints a summary.
# Usage: ./scripts/test-count.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "Counting tests across all platforms..."
echo ""

# Jest (React Native)
JEST_OUTPUT=$(npx jest --forceExit 2>&1 || true)
JEST_SUITES=$(echo "$JEST_OUTPUT" | grep -oE '[0-9]+ passed' | tail -2 | head -1 | grep -oE '[0-9]+')
JEST_TESTS=$(echo "$JEST_OUTPUT" | grep -oE '[0-9]+ passed' | tail -1 | grep -oE '[0-9]+')

# Android (JUnit)
cd android && ./gradlew :app:testDebugUnitTest --rerun-tasks > /dev/null 2>&1 && cd ..
ANDROID_TESTS=0
for xml in android/app/build/test-results/testDebugUnitTest/TEST-*.xml; do
  count=$(grep -oE 'tests="[0-9]+"' "$xml" | grep -oE '[0-9]+')
  ANDROID_TESTS=$((ANDROID_TESTS + count))
done

# iOS (XCTest)
IOS_TESTS=$(grep -c 'func test' ios/OffgridMobileTests/OffgridMobileTests.swift 2>/dev/null || echo 0)

# E2E (Maestro)
E2E_FLOWS=$(find .maestro/flows/p0 -name "*.yaml" 2>/dev/null | wc -l | tr -d ' ')

TOTAL=$((JEST_TESTS + ANDROID_TESTS + IOS_TESTS))

echo "┌─────────────────────┬────────┬──────────────────────────────┐"
echo "│ Platform            │ Tests  │ Framework                    │"
echo "├─────────────────────┼────────┼──────────────────────────────┤"
printf "│ React Native (Jest) │ %6s │ Jest + RNTL (%s suites)     │\n" "$JEST_TESTS" "$JEST_SUITES"
printf "│ Android (JUnit)     │ %6s │ Gradle testDebugUnitTest     │\n" "$ANDROID_TESTS"
printf "│ iOS (XCTest)        │ %6s │ Xcode OffgridMobileTests     │\n" "$IOS_TESTS"
echo "├─────────────────────┼────────┼──────────────────────────────┤"
printf "│ Total               │ %6s │                              │\n" "$TOTAL"
echo "├─────────────────────┼────────┼──────────────────────────────┤"
printf "│ E2E                 │ %6s │ Maestro (P0 critical path)   │\n" "$E2E_FLOWS"
echo "└─────────────────────┴────────┴──────────────────────────────┘"
