import sys, subprocess, time, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,"-m","http.server","8770","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
def run(scenario):
    reqs=[]
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        ctx=b.new_context(service_workers="block")
        state={"n":0}
        def handler(route, request):
            h = request.headers
            reqs.append((request.method, request.url.split('huggingface.co')[1][:60], 'Range' if 'range' in h else '-'))
            state["n"]+=1
            if scenario=="blocked": return route.abort("failed")
            if scenario=="range_blocked":
                if 'range' in h: return route.abort("failed")
                return route.fulfill(status=200, headers={"content-length":"123456","content-type":"application/octet-stream","access-control-allow-origin":"*"}, body="x"*10)
            if scenario=="flaky":
                if state["n"]<=2: return route.abort("failed")
                return route.fulfill(status=404, headers={"access-control-allow-origin":"*"}, body="nf")
        ctx.route("https://huggingface.co/**", handler)
        pg=ctx.new_page(); pg.goto("http://localhost:8770/app.html",wait_until="domcontentloaded"); pg.wait_for_timeout(500)
        res=pg.evaluate("""async () => { const P = await import('/js/packs.js'); try { await P.installModels(['Xenova/opus-mt-ar-en']); return 'OK'; } catch (e) { return 'ERR: ' + e.message; } }""")
        b.close()
    return res, reqs
try:
    for sc in ("blocked","range_blocked","flaky"):
        res, reqs = run(sc)
        print(f"== {sc}\n  result: {res[:420]}\n  requests({len(reqs)}): {reqs[:12]}")
finally: srv.terminate()
