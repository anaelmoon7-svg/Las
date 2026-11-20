// مدير الحزم: تنزيل/حذف موديلات الترجمة والتعرّف على الصوت، والترجمة والتفريغ على الجهاز.
// الموديلات تُنزَّل من HuggingFace (مرة واحدة) وتُخزَّن في Cache Storage باسم transformers-cache.

export const CACHE_NAME = 'transformers-cache';
const MANIFEST_KEY = 'las_packs_v2';

// ---------- الكتالوج (Xenova/opus-mt: الأسماء مؤكدة من HuggingFace، ما عدا ما هو مذكور) ----------
export let OPUS = {
  // من غير علامة لغة: اتجرّب على الموديل الحقيقي إن «>>ara<<» بتلخبطه وبيطلّع أقواس زي «<>البارا><<استمع إلي»،
  // ومن غيرها الترجمة نضيفة («الإصغاء إليّ»).
  ar: { to: 'Xenova/opus-mt-en-ar', from: 'Xenova/opus-mt-ar-en', prefix: '' },
  de: { to: 'Xenova/opus-mt-en-de', from: 'Xenova/opus-mt-de-en' },
  es: { to: 'Xenova/opus-mt-en-es', from: 'Xenova/opus-mt-es-en' },
  fr: { to: 'Xenova/opus-mt-en-fr', from: 'Xenova/opus-mt-fr-en' },
  hi: { to: 'Xenova/opus-mt-en-hi', from: 'Xenova/opus-mt-hi-en' },
  it: { to: 'Xenova/opus-mt-en-it', from: 'Xenova/opus-mt-it-en' },
  nl: { to: 'Xenova/opus-mt-en-nl', from: 'Xenova/opus-mt-nl-en' },
  ru: { to: 'Xenova/opus-mt-en-ru', from: 'Xenova/opus-mt-ru-en' },
  zh: { to: 'Xenova/opus-mt-en-zh', from: 'Xenova/opus-mt-zh-en', prefix: '>>cmn_Hans<< ' },
  ja: { to: 'Xenova/opus-mt-en-jap', from: 'Xenova/opus-mt-jap-en' },
  ko: { to: null, from: 'Xenova/opus-mt-ko-en' },   // لا يوجد en→ko مؤكد
  tr: { to: null, from: 'Xenova/opus-mt-tr-en' },   // لا يوجد en→tr مؤكد
  pt: { to: null, from: null },                      // غير متاح في Opus
};
export const NLLB = { model: 'Xenova/nllb-200-distilled-600M', codes: {
  ar: 'arb_Arab', en: 'eng_Latn', de: 'deu_Latn', fr: 'fra_Latn', nl: 'nld_Latn', it: 'ita_Latn', es: 'spa_Latn',
  zh: 'zho_Hans', hi: 'hin_Deva', tr: 'tur_Latn', ru: 'rus_Cyrl', ja: 'jpn_Jpan', ko: 'kor_Hang', pt: 'por_Latn' } };
export const WHISPER = [
  { id: 'Xenova/whisper-tiny', name: 'سريع (tiny)', approxMB: 50 },
  { id: 'Xenova/whisper-base', name: 'متوازن (base)', approxMB: 100 },
  { id: 'Xenova/whisper-small', name: 'دقيق (small)', approxMB: 280 },
];
const WHISPER_LANG = { ar: 'arabic', en: 'english', de: 'german', fr: 'french', nl: 'dutch', it: 'italian', es: 'spanish',
  zh: 'chinese', hi: 'hindi', tr: 'turkish', ru: 'russian', ja: 'japanese', ko: 'korean', pt: 'portuguese' };

export const baseLang = (c) => String(c || '').toLowerCase().split('-')[0];
export const __setCatalog = (o) => { OPUS = o; }; // للاختبار فقط

// ---------- البيان المحلي لما تم تنزيله ----------
function readManifest() { try { return JSON.parse(localStorage.getItem(MANIFEST_KEY) || '{}'); } catch (e) { return {}; } }
function writeManifest(m) { try { localStorage.setItem(MANIFEST_KEY, JSON.stringify(m)); } catch (e) {} }
export const isInstalled = (model) => !!readManifest()[model];
export const installedBytes = (model) => (readManifest()[model] || {}).bytes || 0;
export const totalInstalledBytes = () => Object.values(readManifest()).reduce((a, x) => a + (x.bytes || 0), 0);

// ---------- Worker ----------
let worker = null, seq = 0, remoteHost = null;
const pending = new Map();
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./ml-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data; const p = pending.get(m.id);
    if (!p) return;
    if (m.type === 'progress') { p.onProgress && p.onProgress(m); return; }
    pending.delete(m.id);
    if (m.type === 'error') p.rej(new Error(m.message)); else p.res(m);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.rej(new Error('worker: ' + (e.message || 'failed')));
    pending.clear(); worker = null;
  };
  if (remoteHost) worker.postMessage({ id: ++seq, op: 'config', remoteHost });
  return worker;
}
function call(msg, onProgress) {
  const w = getWorker();
  return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej, onProgress }); w.postMessage({ id, ...msg }); });
}
export function setRemoteHost(h) { remoteHost = h; if (worker) worker.postMessage({ id: ++seq, op: 'config', remoteHost: h }); }

// ---------- حجم ملفات موديل في الكاش + الحذف ----------
async function modelEntries(model) {
  if (typeof caches === 'undefined') return { c: null, list: [] };
  const c = await caches.open(CACHE_NAME);
  const ks = await c.keys();
  return { c, list: ks.filter((k) => k.url.includes('/' + model + '/')) };
}
// المتصفح ممكن يمسح Cache Storage لما مساحة الجهاز تقل (لو التخزين مش محمي)، بينما البيان في localStorage
// بيفضل يقول «منزّل». النتيجة: الحزمة تبان جاهزة ومن غير نت الترجمة تفشل. هنا بنشيل من البيان أي موديل ملفاته اختفت.
export async function reconcileManifest() {
  if (typeof caches === 'undefined') return [];
  const man = readManifest(), gone = [];
  for (const model of Object.keys(man)) {
    try { const { list } = await modelEntries(model); if (!list.length) { delete man[model]; gone.push(model); } } catch (e) {}
  }
  if (gone.length) writeManifest(man);
  return gone;
}

export async function cacheBytes(model) {
  const { c, list } = await modelEntries(model);
  let sum = 0;
  if (!c) return 0;
  for (const k of list) {
    const r = await c.match(k);
    const cl = Number(r.headers.get('content-length'));
    sum += cl > 0 ? cl : (await r.blob()).size;
  }
  return sum;
}

// ---------- ملفات التشغيل (ONNX Runtime) تُحفظ عبر الـ service worker ----------
export async function prefetchRuntime() {
  const base = new URL('../vendor/ort/', import.meta.url).href;
  for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) { try { await fetch(base + f); } catch (e) {} }
  try { await fetch(new URL('./ml-worker.js', import.meta.url).href); } catch (e) {}
}

// ---------- فحص الشبكة عند فشل التنزيل ----------
// نجرّب ثلاثة طلبات حقيقية: صفحة صغيرة، وطلب الحجم (Range) كما يفعل المحرك، وملف النموذج نفسه. ونقطع الجسم بعد وصول الرؤوس فلا نحمّل شيئاً يُذكر.
async function probe(url, headers) {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ac.signal, ...(headers ? { headers } : {}) });
    const res = r.ok || r.status === 206 ? '✓' : r.status === 404 ? '؟' : '✗ ' + r.status;
    try { ac.abort(); } catch (e) {}
    return res;
  } catch (e) { return ac.signal.aborted ? '✗ مهلة' : '✗'; }
  finally { clearTimeout(timer); }
}
const DIAG_FILES = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'source.spm', 'vocab.json', 'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'];
// لكل ملف: م = الصفحة، و = محرك التنزيل. الرمزان: طلب عادي ثم طلب Range.
export async function netDiag(model) {
  const base = hostBase() + model + '/resolve/main/', urls = DIAG_FILES.map((f) => base + f);
  const main = await Promise.all(urls.map(async (u) => [await probe(u), await probe(u, { Range: 'bytes=0-0' })]));
  let wk = null;
  try { wk = (await Promise.race([call({ op: 'probe', urls }), new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 30000))])).rs; } catch (e) {}
  return 'فحص الشبكة (م=الصفحة، و=المحرك؛ عادي ثم Range):\n' + DIAG_FILES.map((f, i) => `${f.split('/').pop().replace('_quantized.onnx', '')}: م ${main[i].join(' ')} · و ${wk ? wk[urls[i]].join(' ') : '—'}`).join('\n');
}

// ---------- تنزيل من الصفحة نفسها: ملف ملف، ويكمل من مكان الانقطاع ----------
// المحرك داخل الـ worker يفشل أحياناً على الشبكات الضعيفة. هنا نجلب كل ملف بالتتابع مع مراقبة التوقف وإعادة المحاولة،
// ونضعه في نفس الكاش الذي يقرأ منه المحرك، فلا يحتاج لطلب شيء بعدها.
const hostBase = () => { const h = remoteHost || 'https://huggingface.co/'; return h.endsWith('/') ? h : h + '/'; };
export const __tune = { idleMs: 20000, tries: 8, backoff: 1000 }; // للاختبار فقط
const SKIP_EXT = /\.(md|bin|h5|msgpack|safetensors|ot|png|jpe?g|gif|gitattributes)$/i;
const NEED_ONNX = /^onnx\/(encoder_model|decoder_model_merged)_quantized\.onnx$/;
const partials = new Map(); // رابط الملف → ما نزل منه، ليكمل من هناك لو أعاد المستخدم المحاولة
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => (n / 1048576).toFixed(n > 1.0e7 ? 0 : 1);

let wakeLock = null, wakeWanted = 0;
async function wakeAcquire() {
  try { if (wakeWanted > 0 && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
}
async function keepAwake(on) { // إطفاء الشاشة يقطع الاتصال على الموبايل
  wakeWanted = Math.max(0, wakeWanted + (on ? 1 : -1));
  if (on) return wakeAcquire();
  if (!wakeWanted && wakeLock) { const w = wakeLock; wakeLock = null; try { await w.release(); } catch (e) {} }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wakeAcquire(); });

async function listFiles(model) {
  try {
    const r = await fetch(hostBase() + 'api/models/' + model + '?blobs=true', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j && Array.isArray(j.siblings)) return j.siblings.map((x) => ({ name: x.rfilename, size: Number(x.size) || 0 })); }
  } catch (e) {}
  return DIAG_FILES.concat(['target.spm', 'special_tokens_map.json']).map((name) => ({ name, size: 0 }));
}
function flush(st) { if (st.parts.length) { st.blob = new Blob(st.blob ? [st.blob, ...st.parts] : st.parts); st.parts = []; st.pend = 0; } }

// يجلب ملفاً واحداً. عند الانقطاع أو توقف البيانات يعيد المحاولة، ويطلب الباقي فقط (Range) إن سمح الخادم، وإلا يبدأ من أول الملف.
async function fetchFile(url, name, st, tick) {
  let last = null;
  st.range = true; st.rangeFails = 0;
  for (let attempt = 1; attempt <= __tune.tries; attempt++) {
    if (attempt > 1) {
      tick('إعادة المحاولة ' + attempt + ' من ' + __tune.tries + (st.range && st.got ? ' — يكمل من ' + mb(st.got) + ' MB' : ''));
      await sleep(Math.min(__tune.backoff * 2 ** (attempt - 2), 8000));
    }
    const ac = new AbortController(); let idle = null, gotHeaders = false;
    const arm = () => { clearTimeout(idle); idle = setTimeout(() => ac.abort(), __tune.idleMs); };
    try {
      const resume = st.got > 0 && st.range;
      arm();
      const r = await fetch(url, { cache: 'no-store', signal: ac.signal, ...(resume ? { headers: { Range: 'bytes=' + st.got + '-' } } : {}) });
      gotHeaders = true; arm();
      if (r.status === 404) return null;
      const cr = /bytes (\d+)-/.exec(r.headers.get('content-range') || '');
      if (resume && r.status === 206 && (!cr || Number(cr[1]) === st.got)) { /* يكمل */ }
      else if (r.ok && r.status !== 206) { st.blob = null; st.parts = []; st.pend = 0; st.got = 0; } // من الأول (الخادم تجاهل Range أو لا استئناف)
      else { st.range = false; throw new Error('HTTP ' + r.status); }
      const cl = Number(r.headers.get('content-length')) || 0;
      if (cl) st.total = st.got + cl;
      const ct = r.headers.get('content-type'); if (ct) st.type = ct;
      const enc = r.headers.get('content-encoding');
      tick('');
      const rd = r.body.getReader();
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        arm(); st.parts.push(value); st.got += value.byteLength; st.pend += value.byteLength;
        if (st.pend >= 4194304) flush(st);
        tick();
      }
      if (!enc && st.total && st.got < st.total) throw new Error('الملف وصل ناقصاً');
      flush(st);
      return st.blob || new Blob([]);
    } catch (e) {
      last = ac.signal.aborted ? new Error('توقف وصول البيانات ' + Math.round(__tune.idleMs / 1000) + ' ثانية') : e;
      if (!gotHeaders && st.got > 0 && st.range && ++st.rangeFails >= 2) st.range = false; // طلب الاستئناف لا يصل: غالباً الـ CDN يرفض Range، فنبدأ الملف من جديد
    } finally { clearTimeout(idle); }
  }
  const err = new Error('توقف التنزيل عند ' + name + ' (' + mb(st.got) + (st.total ? ' من ' + mb(st.total) : '') + ' MB) بعد ' + __tune.tries + ' محاولات: ' + (last && last.message || last));
  err.isNet = true; throw err;
}

export async function prefetchViaMain(model, onProgress) {
  if (typeof caches === 'undefined') throw Object.assign(new Error('Cache Storage غير متاح'), { noCache: true });
  const base = hostBase() + model + '/resolve/main/', cache = await caches.open(CACHE_NAME);
  const files = (await listFiles(model)).filter((f) => f.name.startsWith('onnx/') ? NEED_ONNX.test(f.name) : !SKIP_EXT.test(f.name) && !f.name.startsWith('.'));
  const seen = new Map(); let note = '';
  files.forEach((f) => seen.set(f.name, { loaded: 0, total: f.size }));
  const emit = () => onProgress && onProgress(seen, note);
  emit();
  for (const f of files) {
    const url = base + f.name, ent = seen.get(f.name);
    if (await cache.match(url)) { ent.loaded = ent.total = ent.total || 1; emit(); continue; }
    let st = partials.get(url);
    if (!st) { st = { blob: null, parts: [], pend: 0, got: 0, total: f.size }; partials.set(url, st); }
    const tick = (n) => { ent.loaded = st.got; if (st.total) ent.total = st.total; if (typeof n === 'string') note = n; emit(); };
    const blob = await fetchFile(url, f.name, st, tick);
    partials.delete(url);
    if (blob === null) { seen.delete(f.name); continue; } // ملف اختياري غير موجود
    const h = { 'content-length': String(blob.size) }; if (st.type) h['content-type'] = st.type;
    await cache.put(url, new Response(blob, { status: 200, headers: h }));
    ent.loaded = ent.total = blob.size; emit();
  }
}

// ---------- تنزيل وحذف ----------
export async function installModels(models, opts = {}) {
  const kind = opts.kind || 'translation';
  const todo = models.filter((m) => !isInstalled(m));
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
  if (todo.length) await prefetchRuntime();
  let cur = todo[0];
  const isNet = (e) => (e && e.isNet) || /fetch|network|load failed|اتصال|توقف/i.test(String(e && e.message));
  await keepAwake(true);
  try {
    for (let i = 0; i < todo.length; i++) {
      cur = todo[i];
      const files = new Map(); let note = '';
      const report = () => { let l = 0, t = 0; files.forEach((f) => { l += f.loaded; t += f.total; }); opts.onProgress && opts.onProgress({ model: todo[i], index: i + 1, count: todo.length, loaded: l, total: t, note }); };
      try { await prefetchViaMain(todo[i], (seen, n) => { note = n; files.clear(); seen.forEach((v, k) => files.set(k, v)); report(); }); }
      catch (e) { if (!e.noCache) throw e; } // لا كاش في الصفحة: نترك المحرك يتولى التنزيل بنفسه
      files.clear(); note = 'تجهيز النموذج…'; report();
      await call({ op: 'load', kind, model: todo[i] }, (m) => { if (m.file) files.set(m.file, { loaded: m.loaded, total: m.total }); note = ''; report(); });
      const bytes = await cacheBytes(todo[i]);
      const man = readManifest(); man[todo[i]] = { bytes, at: Date.now(), kind }; writeManifest(man);
    }
  } catch (e) {
    if (isNet(e)) { try { e.message += ' — ' + await netDiag(cur); } catch (x) {} }
    throw e;
  } finally { await keepAwake(false); }
}

export async function removeModels(models) {
  const man = readManifest();
  for (const m of models) {
    try { if (worker) await call({ op: 'dispose', model: m }); } catch (e) {}
    const { c, list } = await modelEntries(m);
    for (const k of list) await c.delete(k);
    delete man[m];
  }
  writeManifest(man);
}

// ---------- مجموعات الحزم ----------
export const langModels = (code, withBase = true) => {
  const c = baseLang(code); const o = OPUS[c]; if (!o) return [];
  const own = [o.from, o.to].filter(Boolean);
  const base = c === 'ar' || !withBase ? [] : [OPUS.ar.from, OPUS.ar.to];
  return [...new Set([...base, ...own])];
};
export const packState = (code) => {
  const ms = langModels(code); const done = ms.filter(isInstalled).length;
  return { total: ms.length, done, complete: ms.length > 0 && done === ms.length, bytes: ms.reduce((a, m) => a + installedBytes(m), 0) };
};

// ---------- خطة الترجمة المحلية ----------
export function plan(srcCode, tgtCode) {
  const s = baseLang(srcCode), t = baseLang(tgtCode);
  if (s === t) return null;
  const steps = [];
  let ok = true;
  if (s !== 'en') { const m = OPUS[s] && OPUS[s].from; if (m && isInstalled(m)) steps.push({ model: m }); else ok = false; }
  if (t !== 'en') { const o = OPUS[t]; if (o && o.to && isInstalled(o.to)) steps.push({ model: o.to, prefix: o.prefix || '' }); else ok = false; }
  if (ok && steps.length) return { kind: 'opus', steps };
  if (isInstalled(NLLB.model) && NLLB.codes[s] && NLLB.codes[t]) return { kind: 'nllb', steps: [{ model: NLLB.model, opts: { src_lang: NLLB.codes[s], tgt_lang: NLLB.codes[t] } }] };
  return null;
}
export const canTranslateLocally = (s, t) => !!plan(s, t);
// اتجاه الاختبار: نفضّل مسار Opus الخفيف على NLLB الثقيل، فلا يفشل اختبار لغة جاهزة بسبب حزمة أخرى
export function testPath(id, hasSample) {
  const c = [['ar', id]]; if (hasSample) c.push([id, 'ar']);
  return c.find(([s, t]) => { const p = plan(s, t); return p && p.kind === 'opus'; }) || c.find(([s, t]) => plan(s, t)) || null;
}

export async function localTranslate(text, srcCode, tgtCode) {
  const p = plan(srcCode, tgtCode);
  if (!p) return null;
  let cur = String(text);
  for (const st of p.steps) {
    // جملة جملة: الموديلات الصغيرة لما ياخدوا كلام طويل فيه كذا جملة بيسقطوا جمل منه
    // (اتجرّب: «Listen to me. What I'm gonna do…» طلعت من غير «Listen to me»).
    const parts = splitSentencesLocal(cur), outs = [];
    for (const part of parts) {
      let r;
      try { r = await call({ op: 'translate', model: st.model, text: (st.prefix || '') + part, opts: st.opts }); }
      catch (e) {
        // نفاد الذاكرة: نحرّر الموديل الثقيل كي لا يعطّل بقية الموديلات
        if (/bad_alloc|OrtRun|out of memory/i.test(String(e && e.message))) { try { await call({ op: 'dispose', model: st.model }); } catch (x) {} e.noMemory = true; }
        throw e;
      }
      const o = stripLangToken(r.text);
      if (o) outs.push(o);
    }
    cur = outs.join(' ');
  }
  return cur.trim() || null;
}
const splitSentencesLocal = (t) => {
  const parts = (String(t).match(/[^.!?؟。！？\n]+[.!?؟。！？]*/g) || [String(t)]).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [String(t)];
};
// علامات اللغة وبواقيها (زي «>>ara<>» أو «<>ara>>») ممكن ترجع في الترجمة؛ والترجمة نفسها عمرها ما بتحتاج < أو >
// متكررة، فبنشيل العلامات كاملة وأي تكرار للرموز دي.
export const stripLangToken = (s) => String(s || '')
  .replace(/(?:>>|<<|<>|><)\s*[a-zA-Z]{2,4}(?:_[a-zA-Z]{2,5})?\s*[<>]*/g, ' ')
  .replace(/[<>]{2,}/g, ' ')
  .replace(/^\s*[<>]+\s*/, '')
  .replace(/\s{2,}/g, ' ').trim();

// ---------- التعرّف على الصوت على الجهاز ----------
export function installedWhisper() {
  const pref = (() => { try { return localStorage.getItem('las_asr_model'); } catch (e) { return null; } })();
  if (pref && isInstalled(pref)) return pref;
  const w = WHISPER.find((x) => isInstalled(x.id));
  return w ? w.id : null;
}
export async function transcribe(float32, langCode) {
  const model = installedWhisper();
  if (!model) throw new Error('لا توجد حزمة تعرّف على الصوت');
  const r = await call({ op: 'asr', model, audio: float32, language: WHISPER_LANG[baseLang(langCode)] || 'english' });
  return r.text;
}
