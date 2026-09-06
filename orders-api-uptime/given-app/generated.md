# Given-app: done

Built per `given-app-spec.md`: `app.py`, a stdlib-only Python 3 HTTP server (no dependencies,
no framework) implementing `GET /health`, `POST /orders`, `GET /orders`, `GET /orders/<id>`,
404 otherwise. In-memory storage, small deliberate CPU cost on `POST /orders` so load is
actually visible under the Friday-spike scenario.

**Not executed in this pass** — this session's Bash tool required interactive approval to run
`python`/`curl`, which isn't available in a non-interactive run, so the code was written and
reviewed carefully but not smoke-tested live. Worth a quick manual `python app.py` + a couple
of `curl` calls before relying on it for the Terraform/test phases, since it hasn't been run
yet.

Run locally with:
```
python given-app/app.py
# in another terminal:
curl localhost:8080/health
curl -X POST localhost:8080/orders -d '{"item":"widget","quantity":3}'
curl localhost:8080/orders
```
