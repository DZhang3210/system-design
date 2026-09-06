save message="update":
    git add -A
    git commit -m "{{message}}" || true
    git push

open:
    code .
