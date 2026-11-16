import sys, subprocess, time, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,"-m","http.server","8768","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
errs=[]
MOCK = """
(() => {
  window.__spoken = []; window.__audio = [];
  const voices = [
    {name:'Google العربية', lang:'ar-EG', localService:false, default:false, voiceURI:'g-ar'},
    {name:'ar-compact', lang:'ar-SA', localService:true, default:false, voiceURI:'c-ar'},
    {name:'Samantha', lang:'en-US', localService:true, default:true, voiceURI:'sam'},
    {name:'Daniel', lang:'en-GB', localService:true, default:false, voiceURI:'dan'},
    {name:'espeak-de', lang:'de-DE', localService:true, default:false, voiceURI:'es-de'},
  ];
  const mock = { getVoices: () => voices, cancel(){ window.__spoken.push('CANCEL'); }, speak(u){ window.__spoken.push({text:u.text, voice:u.voice && u.voice.name, rate:u.rate, lang:u.lang}); }, onvoiceschanged:null, speaking:false };
  Object.defineProperty(window,'speechSynthesis',{value:mock, configurable:true});
  window.SpeechSynthesisUtterance = class { constructor(t){ this.text=t; this.voice=null; this.rate=1; this.pitch=1; this.lang=''; } };
  const RealAudio = window.Audio;
  window.Audio = function(src){ window.__audio.push(src); const a = {src, play:()=>Promise.resolve(), pause(){}, onended:null, onerror:null}; return a; };
})();
"""
def spoken(pg): return [x for x in pg.evaluate("window.__spoken") if x!='CANCEL']
try:
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
        ctx.add_init_script(MOCK)
        pg=ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.on("console",lambda m: errs.append("console:"+m.text) if m.type=="error" else None)
        pg.goto("http://localhost:8768/app.html",wait_until="networkidle"); pg.wait_for_timeout(800)
        # helper to call speak via page scope: speak is a top-level function in a classic script
        def speak(text, code, slow=False):
            pg.evaluate("window.__spoken=[]; window.__audio=[]")
            pg.evaluate(f"speak({json.dumps(text)}, {json.dumps(code)}, {json.dumps(slow)})")
            return spoken(pg), pg.evaluate("window.__audio")
        print("default mode:", pg.evaluate("voiceMode()"))
        print("T1 auto/ar HQ online ->", speak("مرحبا. كيف حالك؟ أنا بخير","ar"))
        print("T2 auto/de only espeak(BAD) online ->", speak("Guten Tag","de"))
        print("T3 auto/en-US Samsantha (local, no GOOD) online ->", speak("Hello there","en-US"))
        pg.evaluate("localStorage.setItem('las_voice_en-US','Samantha')")
        print("T4 auto/en-US chosen Samantha ->", speak("Hello there","en-US"))
        pg.evaluate("localStorage.setItem('las_voice_mode','natural')")
        print("T5 natural online ->", speak("Hello there","en-US"))
        pg.evaluate("localStorage.setItem('las_voice_mode','device')")
        print("T6 device slow ->", speak("Hello there. Bye","en-GB", True))
        # picker UI
        pg.evaluate("localStorage.setItem('las_voice_mode','auto')")
        pg.click("#open-settings"); pg.wait_for_timeout(600)
        pg.select_option("#vp-lang","ar")
        opts = pg.evaluate("[...document.querySelectorAll('#vp-voice option')].map(o=>o.textContent)")
        print("picker ar options:", opts)
        pg.evaluate("window.__spoken=[]")
        pg.select_option("#vp-voice","Google العربية"); pg.wait_for_timeout(200)
        print("saved:", pg.evaluate("localStorage.getItem('las_voice_ar')"), "| sample spoken:", spoken(pg))
        pg.select_option("#vp-lang","de"); pg.wait_for_timeout(200)
        print("de hint:", pg.evaluate("document.querySelector('#vp-hint').textContent"), "| options:", pg.evaluate("[...document.querySelectorAll('#vp-voice option')].map(o=>o.textContent)"))
        print("seg pressed:", pg.evaluate("[...document.querySelectorAll('#voicemode button')].map(b=>b.dataset.v+':'+b.getAttribute('aria-pressed'))"))
        pg.evaluate("document.querySelector('#set-scrim .sheet').scrollTo(0,160)"); pg.wait_for_timeout(200)
        pg.screenshot(path="/home/claude/shots/voice-settings.png")
        b.close()
finally: srv.terminate()
print("ERRORS:", errs)
