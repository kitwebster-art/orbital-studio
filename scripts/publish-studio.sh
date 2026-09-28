#!/bin/zsh
# Publish Orbital Studio to the stable copy Kit uses at http://127.0.0.1:4178/.
# Builds into dist-next and swaps it in as dist in one step, so a page load never
# sees a half-written build. Open Studio pages are not touched: they show
# "Update ready" and reload when Kit chooses.
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsc -b
npx vite build --outDir dist-next --emptyOutDir --logLevel warn
stamp="$(date +%Y-%m-%dT%H:%M:%S)"
printf '{"version":"%s"}\n' "$stamp" > dist-next/version.json
rm -rf dist-prev
[[ -d dist ]] && mv dist dist-prev
mv dist-next dist
print "Published Orbital Studio ${stamp}"
