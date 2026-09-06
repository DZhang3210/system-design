# Given app spec — orders API

A minimal REST API standing in for Priya's "orders" service. Deliberately trivial business
logic — the exercise is the infrastructure around it, not the app itself.

## Language

Python 3 (stdlib `http.server` only, no framework/dependency install needed — keeps the
given-app trivially runnable on any instance without a build step, which matters since the
exercise is about deployment/scaling, not packaging).

## Endpoints

- `GET /health` — returns `200 {"status": "ok"}`. This is the endpoint the load balancer's
  health check should target.
- `POST /orders` — body `{"item": string, "quantity": int}`. Creates an order, returns `201`
  with the created order (including a generated `id` and `created_at`).
- `GET /orders` — returns `200` with the full list of orders created so far, newest first.
- `GET /orders/<id>` — returns `200` with that order, or `404` if it doesn't exist.
- Any other path/method → `404 {"error": "not found"}`.

## Deliberate quirks (realistic, worth noticing)

- **In-memory storage, per-process.** Orders live in a plain Python list in memory — nothing
  is persisted to disk or a database. This means orders are NOT shared across multiple
  instances/processes, and a restart wipes all orders. This is a real, intentional quirk: it
  means a naive multi-instance deployment behind a load balancer will show different orders
  depending on which instance answers a given request. The design doc should at least
  recognize this (even if resolving it — e.g. adding a real datastore — is explicitly out of
  scope per `problem.md`).
- **Artificial light CPU work on `POST /orders`.** To make "load" mean something under the
  Friday-spike scenario, `POST /orders` does a small deliberate busy-loop (a few thousand
  iterations of hashing) before responding — enough that many concurrent requests will
  measurably raise CPU load on a small instance, without being so heavy it's unrealistic.
- Listens on `0.0.0.0:8080` by default (overridable via `PORT` env var).
- No auth, no HTTPS termination in the app itself (that's the infra's job, per problem.md's
  scope).

## Non-goals

- No database, no ORM, no framework, no external dependencies.
- No auth.
- No logging infrastructure beyond stdout.
