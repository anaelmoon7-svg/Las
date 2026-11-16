# سيرفر ثابت يطبّق ملف _headers كما تفعل Cloudflare (القاعدة /* وقواعد المسارات)
import http.server, socketserver, sys, os, re
root, port = sys.argv[1], int(sys.argv[2])
rules = []  # (pattern, {h: v})
cur = None
hp=os.path.join(root,'_headers')
for line in (open(hp,encoding='utf-8') if os.path.exists(hp) else []):
    if not line.strip() or line.lstrip().startswith('#'): continue
    if not line.startswith((' ', '\t')): cur = {}; rules.append((line.strip(), cur))
    else: k, v = line.strip().split(':', 1); cur[k.strip()] = v.strip()
def match(pat, path): return re.fullmatch(re.escape(pat).replace(r'\*', '.*'), path) is not None
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=root, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        p = self.path.split('?')[0]
        for pat, hs in rules:
            if match(pat, p):
                for k, v in hs.items(): self.send_header(k, v)
        super().end_headers()
class S(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads = True; allow_reuse_address = True
S(('127.0.0.1', port), H).serve_forever()
