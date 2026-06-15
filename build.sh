#!/usr/bin/env bash
# Build a Chrome Web Store zip containing only the files the extension ships.
set -euo pipefail
cd "$(dirname "$0")"

version=$(node -p "require('./manifest.json').version")
out="dist/claude-usage-tracker-${version}.zip"

mkdir -p dist
rm -f "$out"

zip -r "$out" \
  manifest.json \
  background.js \
  content.js \
  interceptor.js \
  usage-parse.js \
  settings.js \
  popup \
  options \
  icons \
  -x '*.DS_Store' >/dev/null

echo "Built $out"
unzip -l "$out"
