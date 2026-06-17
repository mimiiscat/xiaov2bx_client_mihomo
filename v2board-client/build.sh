#!/bin/bash
set -e

cd "$(dirname "$0")"

TARGET="${TARGET:-}"
ARCH="${ARCH:-}"

if [ -n "$TARGET" ] && [ -n "$ARCH" ]; then
  node scripts/build.js "$TARGET" "$ARCH"
elif [ -n "$TARGET" ]; then
  node scripts/build.js "$TARGET"
else
  node scripts/build.js
fi
