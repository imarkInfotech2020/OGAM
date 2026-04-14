#!/usr/bin/env bash

set -eu

# Source .env if present (for local dev — CI sets SONAR_TOKEN directly)
if [[ -f ".env" ]]; then
  # shellcheck disable=SC1091
  . ./.env
fi

if [[ -z "${SONAR_TOKEN:-}" ]]; then
  echo "SONAR_TOKEN is not set. Skipping Sonar scan."
  exit 0
fi

run_sonar() {
  if [[ -x "./node_modules/.bin/sonar-scanner" ]]; then
    ./node_modules/.bin/sonar-scanner "$@"
  elif command -v sonar-scanner >/dev/null 2>&1; then
    sonar-scanner "$@"
  else
    echo "sonar-scanner is not installed. Skipping Sonar scan."
    echo "Install it with: npm install --save-dev sonar-scanner"
    return 0
  fi
}

if ! output=$(run_sonar "$@" 2>&1); then
  if echo "$output" | grep -q "running manual analysis while Automatic Analysis is enabled"; then
    echo "SonarCloud automatic analysis is enabled — skipping local scan (runs automatically on push)."
    exit 0
  fi
  echo "$output" >&2
  exit 1
fi
echo "$output"
