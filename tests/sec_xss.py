import sys, subprocess, time, json, urllib.parse
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,"-m","http.server","8782","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
PAY = '<img src=x onerror="window.__xss=(window.__xss||0)+1">'
res = {}
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"]); ctx=b.new_context(service_workers="block")
    dialogs=[]
    def route(r, req):
        u=req.url
        if "/api/translate" in u:
            return r.fulfill(status=200, headers={"content-type":"application/json"}, body=json.dumps({"text":PAY}))
        if "/api/health" in u: return r.fulfill(status=200, headers={"content-type":"application/json"}, body=json.dumps({"ok":True,"translate":True,"tts":True,"x":PAY}))
        if "/api/tts" in u: return r.abort()
        return r.continue_()
    ctx.route("**/*", route)
    pg=ctx.new_page(); pg.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
    pg.goto("http://localhost:8782/app.html", wait_until="domcontentloaded"); pg.wait_for_timeout(800)
    # 1) malicious translation from the network → output
    pg.fill("#input", "مرحبا"); pg.wait_for_timeout(2500)
    res["out_text"] = pg.inner_text("#out")[:90] if pg.query_selector("#out") else "?"
    res["xss_after_translate"] = pg.evaluate("window.__xss || 0")
    res["img_in_out"] = pg.evaluate("document.querySelectorAll('#out img, #phon img, #show-text img').length")
    # 2) malicious text typed by the user, rendered in phonetic pills / big-text view
    pg.fill("#input", PAY); pg.wait_for_timeout(2500)
    res["xss_after_typed"] = pg.evaluate("window.__xss || 0")
    # 3) tampered localStorage (settings / voice choice / caches) then reload
    pg.evaluate("""(PAY)=>{ for (const k of Object.keys(localStorage)) { try { localStorage.setItem(k, PAY); } catch(e){} } localStorage.setItem('las_voice_ar', PAY); }""", PAY)
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(1500)
    res["xss_after_tampered_storage"] = pg.evaluate("window.__xss || 0")
    # 4) URL based inputs
    for q in ["?text="+urllib.parse.quote(PAY), "#"+urllib.parse.quote(PAY), "?lang="+urllib.parse.quote(PAY)]:
        pg.goto("http://localhost:8782/app.html"+q, wait_until="domcontentloaded"); pg.wait_for_timeout(1000)
        res["xss_url_"+q[:6]] = pg.evaluate("window.__xss || 0")
    # 5) voice names from a hostile speech engine → settings picker and readiness report
    pg.goto("http://localhost:8782/app.html", wait_until="domcontentloaded"); pg.wait_for_timeout(500)
    res["xss_report"] = pg.evaluate("""async (PAY)=>{ const D=await import('/js/diagnostics.js');
      Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{lang:'ar-XA',name:PAY,localService:true},{lang:PAY,name:'x',localService:true}], speak(){}, cancel(){}, addEventListener(){}},configurable:true});
      const root=document.createElement('div'); document.body.appendChild(root); await D.renderDiagnostics(root,[{code:'ar',nameAr:'ع'}]);
      await new Promise(r=>setTimeout(r,800)); return {imgs: root.querySelectorAll('img').length, xss: window.__xss||0}; }""", PAY)
    # 6) error message with HTML shown in the packs panel
    res["dialogs"]=dialogs
    print(json.dumps(res, ensure_ascii=False, indent=1)); b.close()
finally: srv.terminate()
