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
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"net running at http://localhost:{PORT}/", flush=True)
    httpd.serve_forever()
