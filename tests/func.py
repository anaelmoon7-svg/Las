import sys, subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,"-m","http.server","8767","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
errs=[]
try:
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        # Android-like
        ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36")
        pg=ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.goto("http://localhost:8767/index.html",wait_until="networkidle")
        print("android tab selected:", pg.get_attribute("#tab-android","aria-selected"), "| ios panel hidden:", pg.evaluate("document.querySelector('#panel-ios').hidden"))
        pg.click("#tab-ios"); print("after click ios panel hidden:", pg.evaluate("document.querySelector('#panel-ios').hidden"))
        pg.click("#tab-android")
        pg.click("#installBtn"); pg.wait_for_timeout(900)
        print("scrolled to install:", pg.evaluate("Math.abs(document.querySelector('#install').getBoundingClientRect().top) < 80"))
        # sticky bar visibility mid-page
        pg.evaluate("window.scrollTo(0, document.querySelector('#features').offsetTop)"); pg.wait_for_timeout(500)
        print("sticky visible mid-page:", pg.evaluate("document.querySelector('#stickyCta').classList.contains('show')"))
        pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(500)
        print("sticky visible at top:", pg.evaluate("document.querySelector('#stickyCta').classList.contains('show')"))
        print("mic link:", pg.get_attribute(".mic","href"))
        ctx.close()
        # iOS-like
        ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1")
        pg=ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.goto("http://localhost:8767/index.html",wait_until="networkidle")
        print("ios default tab:", pg.get_attribute("#tab-ios","aria-selected"))
        pg.click("#installBtn"); pg.wait_for_timeout(400)
        print("ios sheet open:", pg.evaluate("document.querySelector('#iosSheet').open"))
        pg.screenshot(path="/home/claude/shots/ios-sheet.png")
        pg.click("#iosClose"); print("ios sheet closed:", not pg.evaluate("document.querySelector('#iosSheet').open"))
        ctx.close()
        # reduced motion
        ctx=b.new_context(viewport={"width":390,"height":844},reduced_motion="reduce")
        pg=ctx.new_page(); pg.goto("http://localhost:8767/index.html",wait_until="networkidle")
        print("reduced-motion ring animation:", pg.evaluate("getComputedStyle(document.querySelector('#ring')).animationName"))
        b.close()
finally: srv.terminate()
print("PAGE ERRORS:", errs)
