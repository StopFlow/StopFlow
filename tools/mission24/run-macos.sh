#!/bin/bash
set -eu
umask 077
unset NODE_OPTIONS NODE_PATH NODE_USE_ENV_PROXY HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'NO-GO : Node.js 22 ou plus doit être installé avant ce test. Aucune installation automatique.'
  exit 1
fi
exec node runner.cjs "$@"
