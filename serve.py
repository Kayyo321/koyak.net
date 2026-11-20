"""Local dev server for net. Serves site/ at / and the lab at /lab/ (lab is never linked from the site)."""
import http.server, os, socketserver, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", 4317))

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".ttf": "font/ttf"}
    def translate_path(self, path):
        path = path.split("?", 1)[0].split("#", 1)[0]
        if path.startswith("/lab/") or path.startswith("/art/"):
            base, rest = ROOT, path
        else:
            base, rest = os.path.join(ROOT, "site"), path
        full = os.path.normpath(os.path.join(base, rest.lstrip("/")))
        return full if full.startswith(ROOT) else os.path.join(ROOT, "site", "404")
    def do_POST(self):
        """Local stand-in for the Worker's /api/chat (worker/index.js), so the typewriter's turn can be tried
        offline. It never calls OpenAI. Send
        X-Mock: no-key|rate to fake the Worker's failures."""
        import json, random, time
        if self.path.split("?")[0] in ("/api/hello", "/api/debug/cutscenes"):
            # the story layer needs the Worker (`npm run dev`); here there is simply nothing under the page
            data = b'{"arg": false}' if self.path.split("?")[0] == "/api/hello" else b'{"cutscenes": null}'
            self.send_response(200); self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data))); self.end_headers(); self.wfile.write(data); return
        if self.path.split("?")[0] != "/api/chat":
            self.send_error(404); return
        n = int(self.headers.get("content-length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        last = next((m["content"] for m in reversed(body.get("messages", [])) if m.get("role") == "user"), "")
        fail = self.headers.get("x-mock")
        time.sleep(0.6 + random.random())
        if fail:
            out, code = {"error": fail}, 503 if fail == "no-key" else 429
        else:
            out, code = {"reply": f"local press, not the real me. you typed \"{last[:40]}\". who are you, and what brought you to my page?"}, 200
        data = json.dumps(out).encode()
        self.send_response(code); self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"net running at http://localhost:{PORT}/", flush=True)
    httpd.serve_forever()
