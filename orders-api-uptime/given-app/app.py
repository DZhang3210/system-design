"""Minimal orders API — stdlib only, no dependencies.

In-memory storage only: orders live in a plain list in this process. Restarting the
process, or running more than one instance, means each process has its own independent
order history. That's intentional (see given-app-spec.md) — the infra exercise should
account for it, not "fix" it by smuggling in a database.
"""

import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

orders = []


def _busy_work():
    # Deliberate light CPU cost so concurrent POSTs actually move the needle on a small
    # instance's CPU load during the Friday-spike scenario.
    h = hashlib.sha256(b"orders-api")
    for _ in range(20000):
        h.update(h.digest())


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._send_json(200, {"status": "ok"})

        if self.path == "/orders":
            return self._send_json(200, list(reversed(orders)))

        if self.path.startswith("/orders/"):
            order_id = self.path[len("/orders/"):]
            for order in orders:
                if order["id"] == order_id:
                    return self._send_json(200, order)
            return self._send_json(404, {"error": "not found"})

        return self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/orders":
            return self._send_json(404, {"error": "not found"})

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return self._send_json(400, {"error": "invalid json"})

        if "item" not in data or "quantity" not in data:
            return self._send_json(400, {"error": "item and quantity are required"})

        _busy_work()

        order = {
            "id": str(uuid.uuid4()),
            "item": data["item"],
            "quantity": data["quantity"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        orders.append(order)
        return self._send_json(201, order)

    def log_message(self, fmt, *args):
        # Keep default stdout logging (no external logging infra per spec), just tagged.
        print(f"[orders-api] {self.address_string()} - {fmt % args}")


def main():
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"[orders-api] listening on 0.0.0.0:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
