#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="${HOME}/.local/bin:${PATH}"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install -r requirements.txt
  playwright install chromium
else
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

TRANSPORT="${MCP_TRANSPORT:-stdio}"
if [[ "${1:-}" == "--http" ]]; then
  TRANSPORT="streamable-http"
  shift
fi

export MCP_TRANSPORT="$TRANSPORT"
exec python mcp_server.py "$@"
