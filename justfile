save message="update":
    git add -A
    git commit -m "{{message}}" || true
    git push

open:
    code .

open-gui:
    cmd.exe /c "Start Viewer.cmd"

deps:
    cd viewer-app && npm install