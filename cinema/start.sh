#!/usr/bin/env sh
# Lumen: get the latest code and start the server (Mac/Linux).
cd "$(dirname "$0")" || exit 1
git pull origin claude/virtual-tryon-fashion-store-hjuwq9 || echo "Could not get the latest code. Starting the version you already have."
echo "Lumen on http://127.0.0.1:5500"
node server.js
