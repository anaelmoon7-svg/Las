import sys, subprocess, time, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,"-m","http.server","8780","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"]); pg=b.new_context(service_workers="block").new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8780/app.html",wait_until="domcontentloaded"); pg.wait_for_timeout(500)
    r=pg.evaluate("""async ()=>{ const P=await import('/js/packs.js');
      const man={}; for (const m of ['Xenova/opus-mt-tr-en','Xenova/opus-mt-ar-en','Xenova/opus-mt-en-ar','Xenova/opus-mt-en-zh','Xenova/opus-mt-zh-en',P.NLLB.model]) man[m]={bytes:1,at:1,kind:'translation'};
      localStorage.setItem('las_packs_v2', JSON.stringify(man));
      const k=(id,has)=>JSON.stringify(P.testPath(id,has)); const kind=(s,t)=>{const x=P.plan(s,t); return x?x.kind:null};
      return {tr:k('tr',true), tr_plan_ar_tr:kind('ar','tr'), tr_plan_tr_ar:kind('tr','ar'), zh:k('zh',false), pt:k('pt',false), ko:k('ko',true), ko_plan:kind('ko','ar')}; }""")
    print(json.dumps(r)); 
    # without NLLB
    r2=pg.evaluate("""async ()=>{ const P=await import('/js/packs.js'); const man=JSON.parse(localStorage.getItem('las_packs_v2')); delete man[P.NLLB.model]; localStorage.setItem('las_packs_v2', JSON.stringify(man)); return {tr:JSON.stringify(P.testPath('tr',true)), pt:JSON.stringify(P.testPath('pt',false))}; }""")
    print("no NLLB:", json.dumps(r2)); print("page errors:", errs); b.close()
finally: srv.terminate()
