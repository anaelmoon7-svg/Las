import sys, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright
site = subprocess.Popen([sys.executable,"-m","http.server","8778","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
hf = subprocess.Popen([sys.executable,"/home/claude/test-scripts/hfsim.py","8779"]); time.sleep(1.2)
urllib.request.urlopen("http://127.0.0.1:8779/__mode/ok").read()
M="Xenova/opus-mt-ar-en"
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"]); pg=b.new_context(service_workers="block").new_page()
    pg.goto("http://localhost:8778/app.html",wait_until="domcontentloaded"); pg.wait_for_timeout(400)
    r=pg.evaluate("""async (M)=>{ const P=await import('/js/packs.js'); await caches.delete('transformers-cache'); P.setRemoteHost('http://127.0.0.1:8779/'); try{ await P.installModels([M]); return 'OK'; }catch(e){ return 'ERR '+e.message.slice(0,300); } }""", M)
    print("installModels ->", r); b.close()
finally: site.terminate(); hf.terminate()
