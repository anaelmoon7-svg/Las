import sys, subprocess, time, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,"-m","http.server","8769","--directory",sys.argv[1]],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
errs=[]
MOCK = """
(() => {
  window.__spoken=[]; window.__cancels=0; window.__recs=[];
  const voices=[{name:'Google العربية', lang:'ar-EG', localService:false},{name:'Samantha', lang:'en-US', localService:true}];
  window.SpeechSynthesisUtterance = class { constructor(t){ this.text=t; this.voice=null; this.rate=1; this.lang=''; this.onend=null; this.onerror=null; } };
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
    getVoices:()=>voices, onvoiceschanged:null,
    cancel(){ window.__cancels++; },
    speak(u){ window.__spoken.push({t:u.text, at:Date.now()}); setTimeout(()=>{ u.onend && u.onend(); }, 300); }
  }});
  window.SpeechRecognition = window.webkitSpeechRecognition = class { constructor(){ window.__recs.push(this); this.continuous=false; this.interimResults=false; } start(){} stop(){ this.onend && this.onend(); } };
  window.__final = (txt) => { const r=window.__recs[window.__recs.length-1]; const res=[{isFinal:true, 0:{transcript:txt}}]; r.onresult({resultIndex:0, results:res}); };
  window.__interim = (txt) => { const r=window.__recs[window.__recs.length-1]; const res=[{isFinal:false, 0:{transcript:txt}}]; r.onresult({resultIndex:0, results:res}); };
})();
"""
try:
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        ctx=b.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,accept_downloads=True)
        ctx.add_init_script(MOCK)
        pg=ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.goto("http://localhost:8769/app.html",wait_until="networkidle"); pg.wait_for_timeout(600)
        pg.evaluate("localStorage.setItem('las_voice_mode','device')")
        pg.evaluate("enginePromise.then(({t}) => { t.translate = async (text) => ({text: 'ترجمة: ' + text, via: 'test'}); })"); pg.wait_for_timeout(200)
        pg.click("#conf-open"); pg.wait_for_timeout(300)
        pg.select_option("#conf-spk","en-US"); pg.select_option("#conf-mine","ar")
        pg.click("#conf-voice")
        pg.click("#conf-go"); pg.wait_for_timeout(200)
        print("listening label:", pg.inner_text("#conf-go"), "| live:", pg.inner_text("#conf-live"))
        pg.evaluate("__interim('we are about to')"); print("interim shown:", pg.inner_text("#conf-live"))
        for i in range(1,7): pg.evaluate(f"__final('Sentence number {i}.')")
        pg.wait_for_timeout(300)
        lines = pg.evaluate("[...document.querySelectorAll('.conf-line')].map(d=>d.querySelector('small').textContent+' => '+d.querySelector('p').textContent)")
        print("lines:", len(lines)); [print("  ",l) for l in lines]
        pg.wait_for_timeout(1500)
        sp = pg.evaluate("window.__spoken.map(x=>x.t)")
        print("spoken (queue, cap 3 pending):", sp)
        starts = pg.evaluate("window.__spoken.map(x=>x.at)"); 
        print("gaps between utterance starts (ms, should be >=~290):", [starts[i+1]-starts[i] for i in range(len(starts)-1)])
        # autoscroll: add many lines, scroll to top, add another
        for i in range(7,30): pg.evaluate(f"__final('Filler line {i}.')")
        pg.wait_for_timeout(300)
        pg.evaluate("document.querySelector('#conf-log').scrollTop = 0"); 
        pg.evaluate("__final('Late line while reading above.')"); pg.wait_for_timeout(200)
        print("scrollTop stays 0 while reading above:", pg.evaluate("document.querySelector('#conf-log').scrollTop"))
        pg.evaluate("document.querySelector('#conf-log').scrollTop = 1e6")
        pg.evaluate("__final('Line at bottom.')"); pg.wait_for_timeout(200)
        print("sticks to bottom when at bottom:", pg.evaluate("(()=>{const l=document.querySelector('#conf-log');return Math.round(l.scrollHeight-l.scrollTop-l.clientHeight)<5})()"))
        # font size
        fs0 = pg.evaluate("getComputedStyle(document.querySelector('.conf-line p')).fontSize")
        pg.click("#conf-size"); fs1 = pg.evaluate("getComputedStyle(document.querySelector('.conf-line p')).fontSize")
        pg.click("#conf-size"); fs2 = pg.evaluate("getComputedStyle(document.querySelector('.conf-line p')).fontSize")
        pg.click("#conf-size"); fs3 = pg.evaluate("getComputedStyle(document.querySelector('.conf-line p')).fontSize")
        print("font sizes cycle:", fs0, fs1, fs2, fs3)
        pg.screenshot(path="/home/claude/shots/conf.png")
        # save
        with pg.expect_download() as dl: pg.click("#conf-save")
        d=dl.value; path=d.path(); txt=open(path,encoding='utf-8').read()
        print("download name:", d.suggested_filename); print(txt[:170].replace("\n"," | "))
        # stop clears
        pg.click("#conf-go"); pg.wait_for_timeout(200)
        print("after stop label:", pg.inner_text("#conf-go"))
        b.close()
finally: srv.terminate()
print("ERRORS:", errs)
