import sys, subprocess, time, json
from playwright.sync_api import sync_playwright
root=sys.argv[1]
srv=subprocess.Popen([sys.executable,"/home/claude/test-scripts/serve_hdr.py",root,"8791"]); time.sleep(1)
hits=[]
def route(r, req):
    u=req.url
    if "/api/" in u:
        hits.append(req.method+" "+u.split("8791")[-1][:60])
        if "/api/translate" in u: return r.fulfill(status=200,headers={"content-type":"application/json"},body=json.dumps({"text":"hello world"}))
        if "/api/tts" in u: return r.fulfill(status=200,headers={"content-type":"audio/mpeg"},body=b"\xff\xfb\x90\x00"*64)
        return r.fulfill(status=200,headers={"content-type":"application/json"},body=json.dumps({"ok":True,"translate":True}))
    return r.continue_()
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"]); ctx=b.new_context(service_workers="allow"); ctx.route("**/*",route)
    pg=ctx.new_page(); pg.goto("http://localhost:8791/app.html",wait_until="load"); pg.wait_for_timeout(2500)
    pg.reload(wait_until="load"); pg.wait_for_timeout(1500)
    print("controlled by SW:", pg.evaluate("!!navigator.serviceWorker.controller"))
    pg.fill("#input","مرحبا"); pg.wait_for_timeout(2500)
    print("translation:", pg.inner_text("#out")[:30])
    pg.evaluate("fetch('/api/tts?lang=ar&text=hi').then(r=>r.status)"); pg.wait_for_timeout(500)
    cached=pg.evaluate("caches.keys().then(async ks=>{const o=[];for(const k of ks){const c=await caches.open(k);for(const r of await c.keys()){if(r.url.includes('/api/'))o.push(r.url)}}return o})")
    print("api urls in SW caches:", cached)
    print("api requests seen:", hits[:4])
    b.close()
finally: srv.terminate()
