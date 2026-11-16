# سيرفر يحاكي huggingface مع أعطال: يقطع في نص الملف، أو يتوقف، أو يرفض Range
import http.server, socketserver, sys, json, threading, time
MODE = {"m": "ok"}; STATE = {"hits": {}, "ranges": []}
M = "Xenova/opus-mt-ar-en"
FILES = {"config.json": b'{"model_type":"marian"}', "tokenizer.json": b"{}", "onnx/encoder_model_quantized.onnx": bytes(range(256)) * 8192,  # 2MB
         "onnx/decoder_model_merged_quantized.onnx": bytes((i * 7) % 256 for i in range(3_000_000))}
class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def cors(self):
        self.send_header("access-control-allow-origin", "*"); self.send_header("access-control-allow-headers", "range")
        self.send_header("access-control-expose-headers", "content-range,content-length,accept-ranges")
    def do_OPTIONS(self):
        if MODE["m"] == "norange_cors": self.send_response(403); self.send_header("content-length","0"); self.end_headers(); return
        self.send_response(204); self.cors(); self.send_header("content-length","0"); self.end_headers()
    def do_GET(self):
        p = self.path
        if p.startswith("/__mode/"): MODE["m"] = p.split("/")[-1]; STATE["hits"].clear(); STATE["ranges"].clear(); self.reply(b"ok"); return
        if p == "/__state": self.reply(json.dumps(STATE).encode()); return
        if p.startswith("/api/models/"):
            body = json.dumps({"siblings": [{"rfilename": k, "size": len(v)} for k, v in FILES.items()] + [{"rfilename": "README.md", "size": 5}]}).encode(); self.reply(body, "application/json"); return
        f = p.split("/resolve/main/")[-1].split("?")[0]
        if f not in FILES: self.send_response(404); self.cors(); self.send_header("content-length","0"); self.end_headers(); return
        data = FILES[f]; STATE["hits"][f] = STATE["hits"].get(f, 0) + 1
        rng = self.headers.get("range"); start = 0; status = 200
        if rng and MODE["m"] == "range_drop":
            STATE["ranges"].append(rng); self.close_connection = True; self.connection.shutdown(2); return
        if rng: STATE["ranges"].append(rng); start = int(rng.split("=")[1].split("-")[0]); status = 206
        if rng and MODE["m"] == "ignore_range": start = 0; status = 200
        body = data[start:]
        self.send_response(status); self.cors(); self.send_header("content-type", "application/octet-stream")
        self.send_header("content-length", str(len(body)))
        if status == 206: self.send_header("content-range", f"bytes {start}-{len(data)-1}/{len(data)}")
        self.end_headers()
        big = f.endswith("decoder_model_merged_quantized.onnx")
        fail_now = big and STATE["hits"][f] <= 2 and MODE["m"] in ("cut", "stall", "norange_cors", "ignore_range", "range_drop")
        try:
            cut = len(body) // 2 if fail_now else len(body)
            for i in range(0, cut, 65536):
                self.wfile.write(body[i:min(i + 65536, cut)]); self.wfile.flush(); time.sleep(0.002)
            if fail_now:
                if MODE["m"] == "stall": time.sleep(6)   # يتوقف والاتصال مفتوح
                self.close_connection = True; self.connection.shutdown(2) if MODE["m"] != "stall" else None
        except Exception: pass
    def reply(self, b, ct="text/plain"):
        self.send_response(200); self.cors(); self.send_header("content-type", ct); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
class S(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads = True; allow_reuse_address = True
S(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
