#!/bin/zsh
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
npm_bin="$(command -v npm || true)"

if [[ -z "$npm_bin" || ! -x "$npm_bin" ]]; then
  print -u2 "Orbital Studio could not find npm"
  exit 1
fi

cd "$project_dir"
# Everyday use: the stable build on port 4178 (npm run dev is the development copy on 4190).
[[ -f dist/index.html ]] || "$npm_bin" run stable:publish
exec "$npm_bin" run stable:serve
