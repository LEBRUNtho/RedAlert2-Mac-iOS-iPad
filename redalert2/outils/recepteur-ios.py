#!/usr/bin/env python3
# Récepteur des builds de débogage iPhone (VITE_DEBUG_LOG_HOST) : journal en direct + console à distance.
#   python3 outils/recepteur-ios.py [journal.log]
#   Envoyer du JS à l'iPhone : écrire le code dans <journal>.cmd ; la réponse arrive dans le journal.
import http.server, sys, os, time, threading, json, itertools
LOG = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ra2-iphone.log"
CMD = LOG + ".cmd"
ids = itertools.count(1)
lock = threading.Lock()
def note(line):
    with lock, open(LOG, "a") as f:
        f.write(time.strftime("%H:%M:%S ") + line.rstrip() + "\n")
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode("utf-8", "replace")
        if self.path.startswith("/log"):
            note(body); self._send(204)
        elif self.path.startswith("/cmd"):
            code = None
            with lock:
                if os.path.exists(CMD) and os.path.getsize(CMD):
                    code = open(CMD).read(); open(CMD, "w").close()
            if code:
                i = next(ids); note(f"[REPL>{i}] {code[:200]}")
                self._send(200, json.dumps({"id": str(i), "code": code}).encode(), "application/json")
            else:
                self._send(204)
        elif self.path.startswith("/result"):
            note(f"[REPL<{self.path.split('id=')[-1]}] {body}"); self._send(204)
        else:
            self._send(404)
    def _send(self, code, data=b"", ctype="text/plain"):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in (("Access-Control-Allow-Origin", "*"), ("Access-Control-Allow-Methods", "POST"), ("Access-Control-Allow-Headers", "*")):
            self.send_header(k, v)
        self.end_headers()
note("== récepteur démarré")
http.server.ThreadingHTTPServer(("0.0.0.0", 4100), H).serve_forever()
