#!/bin/zsh
set -euo pipefail
studio_dir="$(cd "$(dirname "$0")/.." && pwd)"
tracker_dir="$studio_dir/../orbital-tracker"
cd "$tracker_dir"
export PYTHONPATH="$tracker_dir/src${PYTHONPATH:+:$PYTHONPATH}"
exec python3 -m orbital_tracker bridge --source simulate --port 8765
