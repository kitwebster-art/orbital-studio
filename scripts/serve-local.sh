#!/bin/zsh
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
npm_bin="$(command -v npm || true)"

if [[ -z "$npm_bin" || ! -x "$npm_bin" ]]; then
  print -u2 "Orbital Studio could not find npm"
  exit 1
fi

cd "$project_dir"
exec "$npm_bin" run dev
