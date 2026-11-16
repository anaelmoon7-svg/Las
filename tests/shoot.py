import sys, subprocess, time, json
from playwright.sync_api import sync_playwright

root = sys.argv[1]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--directory", root],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        for name, vp, mobile in [("mobile", {"width": 390, "height": 844}, True), ("desktop", {"width": 1280, "height": 900}, False)]:
            ctx = b.new_context(viewport=vp, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
            pg = ctx.new_page()
            pg.on("console", lambda m: errors.append((name, m.type, m.text)) if m.type in ("error", "warning") else None)
            pg.on("pageerror", lambda e: errors.append((name, "pageerror", str(e))))
            pg.goto("http://localhost:8765/index.html", wait_until="networkidle")
            pg.wait_for_timeout(600)
            pg.screenshot(path=f"/home/claude/shots/{name}-full.png", full_page=True)
            m = pg.evaluate("() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, chips: document.querySelectorAll('.chip').length, h: document.documentElement.scrollHeight})")
            print(name, json.dumps(m))
            ctx.close()
        b.close()
finally:
    srv.terminate()
print("ERRORS:", errors)
