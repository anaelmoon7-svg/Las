import sys, subprocess, time, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,"-m","http.server","8771","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
M="Xenova/opus-mt-ar-en"
SIBL=["config.json","generation_config.json","tokenizer.json","tokenizer_config.json","source.spm","target.spm","vocab.json","README.md",
      "onnx/encoder_model.onnx","onnx/encoder_model_quantized.onnx","onnx/decoder_model_merged.onnx","onnx/decoder_model_merged_quantized.onnx","pytorch_model.bin"]
CORS={"access-control-allow-origin":"*"}
def run(scenario):
    reqs=[]
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        ctx=b.new_context(service_workers="block")
        def handler(route, request):
            h=request.headers; u=request.url
            reqs.append((request.method, u.split('huggingface.co')[1][:70], 'R' if 'range' in h else '-'))
            if scenario=="listfail" and '/api/' in u: return route.abort("failed")
            if u.endswith('/api/models/'+M):
                return route.fulfill(status=200,headers={**CORS,"content-type":"application/json"},body=json.dumps({"siblings":[{"rfilename":f} for f in SIBL]}))
            if scenario=="listfail" and '/api/' in u: return route.abort("failed")
            if 'range' in h and scenario=="range_blocked": return route.abort("failed")
            if scenario=="blocked": return route.abort("failed")
            return route.fulfill(status=200,headers={**CORS,"content-type":"application/octet-stream","vary":"Origin"},body=("x"*50000 if u.endswith('.onnx') else "{}"))
        ctx.route("https://huggingface.co/**", handler)
        pg=ctx.new_page(); pg.goto("http://localhost:8771/app.html",wait_until="domcontentloaded"); pg.wait_for_timeout(500)
        out={}
        out['prefetch']=pg.evaluate("""async (M) => { const P = await import('/js/packs.js'); await caches.delete('transformers-cache');
          try { const seen=[]; await P.prefetchViaMain(M, s=>{}); } catch (e) { return 'ERR '+e.message; }
          const c = await caches.open('transformers-cache'); const ks=(await c.keys()).map(k=>k.url.replace('https://huggingface.co/'+M+'/resolve/main/',''));
          const hit = await c.match('https://huggingface.co/'+M+'/resolve/main/onnx/encoder_model_quantized.onnx');
          return {keys:ks, hit: hit? (await hit.arrayBuffer()).byteLength : null, vary: hit && hit.headers.get('vary')}; }""", M)
        out['diag']=pg.evaluate("""async (M) => { const P = await import('/js/packs.js'); try { return await P.netDiag(M); } catch (e) { return 'ERR '+e.message; } }""", M)
        b.close()
    return out, reqs
try:
    for sc in sys.argv[2:] or ("ok","listfail","blocked"):
        out, reqs = run(sc)
        print(f"== {sc}\n  prefetch: {out['prefetch']}\n  diag: {str(out['diag'])[:900]}\n  nreq={len(reqs)} sample={reqs[:5]}")
finally: srv.terminate()
