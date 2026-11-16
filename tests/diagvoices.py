import sys, subprocess, time, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,"-m","http.server","8781","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"]); pg=b.new_context(service_workers="block").new_page()
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8781/app.html",wait_until="domcontentloaded"); pg.wait_for_timeout(400)
    for name, voices in [("no-arabic",[("en-US","English US"),("fr-FR","French"),("en_GB","English UK")]),("arabic",[("en-US","English US"),("ar_XA","Arabic Voice II")])]:
        r=pg.evaluate("""async ([voices])=>{ const D=await import('/js/diagnostics.js');
          Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>voices.map(([lang,name])=>({lang,name,localService:true}))},configurable:true});
          const out=await D.runDiagnostics([{code:'ar',nameAr:'العربية'},{code:'en',nameAr:'الإنجليزية'}]);
          return out.filter(x=>x.title.includes('صوت')||x.title.includes('أصوات')||x.title.includes('لغات')).map(x=>x.level+' | '+x.title+': '+x.detail); }""",[voices])
        print("==",name); [print("  ",x) for x in r]
    print("page errors:",errs); b.close()
finally: srv.terminate()
