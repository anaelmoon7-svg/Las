import sys, subprocess, time, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,"-m","http.server","8772","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
M="Xenova/opus-mt-ar-en"
SIBL=["config.json","generation_config.json","tokenizer.json","tokenizer_config.json","source.spm","target.spm","vocab.json","onnx/encoder_model_quantized.onnx","onnx/decoder_model_merged_quantized.onnx"]
CORS={"access-control-allow-origin":"*"}
reqs=[]
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    ctx=b.new_context(service_workers="block")
    def handler(route, request):
        u=request.url; reqs.append(u.split('huggingface.co')[1][:80])
        if "/api/models/"+M in u: return route.fulfill(status=200,headers={**CORS,"content-type":"application/json"},body=json.dumps({"siblings":[{"rfilename":f} for f in SIBL]}))
        return route.fulfill(status=200,headers={**CORS,"vary":"Origin"},body=("x"*50000 if u.endswith('.onnx') else "{}"))
    ctx.route("https://huggingface.co/**", handler)
    pg=ctx.new_page(); pg.goto("http://localhost:8772/app.html",wait_until="domcontentloaded"); pg.wait_for_timeout(500)
    pg.evaluate("async (M)=>{ const P=await import('/js/packs.js'); await caches.delete('transformers-cache'); await P.prefetchViaMain(M, ()=>{}); }", M)
    reqs.clear()
    r=pg.evaluate("async (M)=>{ const P=await import('/js/packs.js'); try{ await P.installModels([M]); return 'OK'; }catch(e){ return 'ERR '+e.message.slice(0,200); } }", M)
    print("worker load result:", r)
    print("HF requests made by worker after prefetch:", reqs)
    b.close()
finally: srv.terminate()
