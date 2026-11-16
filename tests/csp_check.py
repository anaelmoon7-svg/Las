import sys, subprocess, time, json
from playwright.sync_api import sync_playwright
root=sys.argv[1]
srv = subprocess.Popen([sys.executable,"/home/claude/test-scripts/serve_hdr.py",root,"8790"]); time.sleep(1)
M="Xenova/opus-mt-ar-en"; CORS={"access-control-allow-origin":"*"}
GOOGLE=json.dumps([[["hello world","مرحبا",None,None,1]],None,"ar"])
issues=[]; out={}
def route(r, req):
    u=req.url
    if "/api/translate" in u: return r.fulfill(status=200,headers={"content-type":"application/json"},body=json.dumps({"text":"hello world"}))
    if "/api/tts" in u: return r.fulfill(status=200,headers={"content-type":"audio/mpeg"},body=b"\xff\xfb\x90\x00"*64)
    if "/api/health" in u: return r.fulfill(status=200,headers={"content-type":"application/json"},body=json.dumps({"ok":True,"translate":True,"tts":True}))
    if u.startswith("https://huggingface.co/api/models/"): return r.fulfill(status=200,headers={**CORS,"content-type":"application/json"},body=json.dumps({"siblings":[{"rfilename":"config.json","size":24},{"rfilename":"tokenizer.json","size":2},{"rfilename":"onnx/encoder_model_quantized.onnx","size":50000},{"rfilename":"onnx/decoder_model_merged_quantized.onnx","size":50000}]}))
    if u.startswith("https://huggingface.co/") and u.endswith(".onnx"): return r.fulfill(status=200,headers={**CORS,"content-type":"application/octet-stream"},body=b"x"*50000)
    if u.startswith("https://cas-bridge.xethub.hf.co/"): return r.fulfill(status=200,headers={**CORS,"content-type":"application/octet-stream"},body=b"x"*50000)
    if u.startswith("https://huggingface.co/"): return r.fulfill(status=200,headers={**CORS,"content-type":"application/json"},body='{"model_type":"marian"}' if u.endswith("config.json") else "{}")
    if u.startswith("http://localhost:8790") or u.startswith("http://127.0.0.1:8790"): return r.continue_()
    issues.append("UNMOCKED "+u[:90]); return r.abort()
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    for sw in ("block","allow"):
        ctx=b.new_context(service_workers=sw); ctx.route("**/*", route)
        pg=ctx.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(m.text) if ("Content Security Policy" in m.text or "Refused to" in m.text or m.type=="error") else None)
        pg.on("pageerror", lambda e: logs.append("PAGEERROR "+str(e)))
        # landing page
        pg.goto("http://localhost:8790/index.html",wait_until="load"); pg.wait_for_timeout(1000)
        out[sw+":landing_chips"]=pg.evaluate("document.querySelectorAll('#ring .chip').length")
        out[sw+":landing_h1"]=bool(pg.query_selector("h1"))
        # app page + translation
        pg.goto("http://localhost:8790/app.html",wait_until="load"); pg.wait_for_timeout(1000)
        pg.fill("#input","مرحبا"); pg.wait_for_timeout(2500)
        out[sw+":translation"]=pg.inner_text("#out")[:40]
        pg.evaluate("document.getElementById('showbig') && document.getElementById('showbig').click()")
        # settings panel, voice picker, diagnostics, packs panel
        pg.evaluate("[...document.querySelectorAll('button,[role=button]')].filter(e=>/إعدادات|settings/i.test((e.getAttribute('aria-label')||'')+e.id)).slice(0,1).forEach(e=>e.click())"); pg.wait_for_timeout(1500)
        pg.evaluate("document.getElementById('diag') && document.getElementById('diag').click()"); pg.wait_for_timeout(3500)
        out[sw+":diag_lines"]=pg.evaluate("document.querySelectorAll('#diag-root p').length")
        out[sw+":packs_rows"]=pg.evaluate("document.querySelectorAll('#packs-root button').length")
        if sw=="block":
            # model download through Xet redirect + wasm/worker start under the CSP
            r=pg.evaluate("""async (M)=>{ const P=await import('/js/packs.js'); await caches.delete('transformers-cache'); try{ await P.installModels([M]); return 'OK'; }catch(e){ return 'ERR '+e.message.slice(0,160); } }""",M)
            out["model_flow"]=r
            out["cdn_xet_allowed"]=pg.evaluate("fetch('https://cas-bridge.xethub.hf.co/a/b.onnx?sig=1').then(r=>r.status).catch(e=>'BLOCKED '+e.message)")
            out["old_google_blocked"]=pg.evaluate("fetch('https://translate.googleapis.com/translate_a/single?client=gtx&q=a').then(r=>'LOADED').catch(e=>'BLOCKED')")
            out["evil_host_blocked"]=pg.evaluate("fetch('https://evil.example.com/x').then(r=>'LOADED '+r.status).catch(e=>'BLOCKED')")
            out["wasm_page"]=pg.evaluate("WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0])).then(()=>'ok').catch(e=>'ERR '+e.message.slice(0,80))")
            out["wasm_worker"]=pg.evaluate("""new Promise(res=>{ try{ const w=new Worker('/js/ml-worker.js',{type:'module'}); w.onerror=e=>res('workererr '+(e.message||'')); setTimeout(()=>res('worker started, no error'),1500);}catch(e){res('ERR '+e.message)} })""")
            out["inline_script_blocked"]=pg.evaluate("new Promise(res=>{ window.__x=0; const s=document.createElement('script'); s.textContent='window.__x=1'; document.head.appendChild(s); setTimeout(()=>res(window.__x===1?'RAN (bad)':'blocked (good)'),200)})")
        else:
            pg.wait_for_timeout(1500); out["sw_registered"]=pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)")
        out[sw+":logs"]=[l[:200] for l in logs if "TUNNEL" not in l][:8]+["tunnel_errors=%d"%sum("TUNNEL" in l for l in logs)]
        ctx.close()
    b.close()
finally: srv.terminate()
out["issues"]=issues
print(json.dumps(out,ensure_ascii=False,indent=1))
