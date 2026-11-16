import sys, subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,"-m","http.server","8777","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
M="Xenova/opus-mt-ar-en"
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"]); ctx=b.new_context(service_workers="block")
    ctx.route("https://huggingface.co/**", lambda route, req: route.abort("failed"))
    pg=ctx.new_page(); pg.goto("http://localhost:8777/app.html",wait_until="domcontentloaded"); pg.wait_for_timeout(400)
    r=pg.evaluate("""async (M)=>{ const P=await import('/js/packs.js'); P.__tune.backoff=50; P.__tune.tries=3; const notes=[]; try{ await P.installModels([M],{onProgress:e=>notes.push(e.note)}); return 'OK'; }catch(e){ return 'ERR '+e.message; } }""", M)
    print(r[:700]); b.close()
finally: srv.terminate()
