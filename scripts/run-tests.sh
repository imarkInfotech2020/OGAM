#!/bin/bash

# Run Maestro E2E tests in alphabetical order
# Usage: ./run-tests.sh [folder] [--ios | --android]
# Examples:
#   ./run-tests.sh                          # auto-detect platform, run p0
#   ./run-tests.sh --ios                    # force iOS, run p0
#   ./run-tests.sh .maestro/flows/p1 --android

# Parse arguments: flags vs positional
for arg in "$@"; do
  case "$arg" in
    --ios|--android) PLATFORM="$arg" ;;
    *) TEST_DIR="$arg" ;;
  esac
done
TEST_DIR="${TEST_DIR:-.maestro/flows/p0}"

FAILED_TESTS=()
PASSED_TESTS=()

# ── Resolve APP_ID per platform ──
resolve_app_id() {
    if [[ "$PLATFORM" == "--ios" ]]; then
        echo "ai.offgridmobile"
        return
    fi
    if [[ "$PLATFORM" == "--android" ]]; then
        echo "ai.offgridmobile.dev"
        return
    fi

    # Auto-detect: prefer iOS simulator, fall back to Android emulator
    if xcrun simctl list devices booted 2>/dev/null | grep -q "Booted"; then
        echo "ai.offgridmobile"
    elif adb devices 2>/dev/null | grep -q "device$"; then
        echo "ai.offgridmobile.dev"
    else
        echo "ERROR: No booted simulator or emulator found" >&2
        return 1
    fi
}

APP_ID=$(resolve_app_id) || exit 1
echo "Platform app ID: $APP_ID"
echo "Running tests from: $TEST_DIR"
echo "================================"

# Find all .yaml files and sort them
for test_file in $(find "$TEST_DIR" -name "*.yaml" -type f | sort); do
    echo ""
    echo "Running: $test_file"
    echo "--------------------------------"

    if maestro test -e APP_ID="$APP_ID" "$test_file"; then
        PASSED_TESTS+=("$test_file")
        echo "PASSED: $test_file"
    else
        FAILED_TESTS+=("$test_file")
        echo "FAILED: $test_file"
        echo "Stopping on first failure..."
        break
    fi
done

echo ""
echo "================================"
echo "Test Summary"
echo "================================"
echo "Passed: ${#PASSED_TESTS[@]}"
echo "Failed: ${#FAILED_TESTS[@]}"

if [[ ${#FAILED_TESTS[@]} -gt 0 ]]; then
    echo ""
    echo "Failed tests:"
    printf '%s\n' "${FAILED_TESTS[@]}"
    exit 1
fi

echo ""
echo "All tests passed!"
exit 0
