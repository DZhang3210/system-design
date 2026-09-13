save message="update":
    git add -A
    git commit -m "{{message}}" || true
    git push

open:
    code .

open-gui:
    cmd.exe /c "Start Viewer.cmd"

# macOS equivalent of open-gui / Start Viewer.cmd: install deps on first run, start the
# server, open the browser once it's up, then stay attached so Ctrl+C stops the server.
open-gui-mac:
    #!/usr/bin/env bash
    set -euo pipefail
    cd viewer-app
    if [ ! -d node_modules ]; then
        echo "Installing dependencies (first run only)..."
        npm install
    fi
    node server.js &
    server_pid=$!
    trap 'kill "$server_pid" 2>/dev/null' EXIT
    sleep 2
    open http://localhost:4173
    wait "$server_pid"

deps:
    cd viewer-app && npm install