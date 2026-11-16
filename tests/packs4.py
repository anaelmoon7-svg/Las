import sys, subprocess, time, json, urllib.request
from playwright.sync_api import sync_playwright
site = subprocess.Popen([sys.executable,"-m","http.server","8773","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
hf = subprocess.Popen([sys.executable,"/home/claude/test-scripts/hfsim.py","8774"])
time.sleep(1.2)
M="Xenova/opus-mt-ar-en"
def setmode(m): urllib.request.urlopen("http://127.0.0.1:8774/__mode/"+m).read()
def state(): return json.loads(urllib.request.urlopen("http://127.0.0.1:8774/__state").read())
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    ctx=b.new_context(service_workers="block"); pg=ctx.new_page()
    pg.goto("http://localhost:8773/app.html",wait_until="domcontentloaded"); pg.wait_for_timeout(400)
    for mode in sys.argv[2:] or ["ok","cut","stall","norange_cors","ignore_range"]:
        setmode(mode)
        r=pg.evaluate("""async ([M, mode]) => { const P = await import('/js/packs.js'); await caches.delete('transformers-cache');
          P.setRemoteHost('http://127.0.0.1:8774/'); P.__tune.idleMs = 1500; P.__tune.backoff = 100; P.__tune.tries = 6;
          const notes = new Set(); let t0 = Date.now();
          try { await P.prefetchViaMain(M, (seen, n) => { if (n) notes.add(n); }); } catch (e) { return {err: e.message, notes:[...notes]}; }
          const c = await caches.open('transformers-cache'); const out = {};
          for (const k of await c.keys()) { const r = await c.match(k); const ab = await r.arrayBuffer(); out[k.url.split('/main/')[1]] = ab.byteLength; if (k.url.includes('decoder')) { const u = new Uint8Array(ab); let bad = 0; for (let i = 0; i < u.length; i++) if (u[i] !== (i * 7) % 256) bad++; out.badBytes = bad; } }
          return {ok: out, notes:[...notes], ms: Date.now()-t0}; }""", [M, mode])
        st=state()
        print(f"== {mode}\n  result: {json.dumps(r, ensure_ascii=False)[:600]}\n  server hits(big)={st['hits'].get('onnx/decoder_model_merged_quantized.onnx')} ranges={st['ranges']}")
    b.close()
finally: site.terminate(); hf.terminate()
