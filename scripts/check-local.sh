#!/bin/zsh
set -euo pipefail

health_url="http://127.0.0.1:4178/"
curl -fsS --max-time 3 -o /dev/null "$health_url"
print "Orbital Studio is reachable at $health_url"
