// مدير الحزم: تنزيل/حذف موديلات الترجمة والتعرّف على الصوت، والترجمة والتفريغ على الجهاز.
// الموديلات تُنزَّل من HuggingFace (مرة واحدة) وتُخزَّن في Cache Storage باسم transformers-cache.

export const CACHE_NAME = 'transformers-cache';
const MANIFEST_KEY = 'las_packs_v2';

// ---------- الكتالوج (Xenova/opus-mt: الأسماء مؤكدة من HuggingFace، ما عدا ما هو مذكور) ----------
export let OPUS = {
  ar: { to: 'Xenova/opus-mt-en-ar', from: 'Xenova/opus-mt-ar-en', prefix: '>>ara<< ' },
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
  const base = 'https://huggingface.co/' + model + '/resolve/main/', urls = DIAG_FILES.map((f) => base + f);
  const main = await Promise.all(urls.map(async (u) => [await probe(u), await probe(u, { Range: 'bytes=0-0' })]));
  let wk = null;
  try { wk = (await Promise.race([call({ op: 'probe', urls }), new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 30000))])).rs; } catch (e) {}
  return 'فحص الشبكة (م=الصفحة، و=المحرك؛ عادي ثم Range):<br>' + DIAG_FILES.map((f, i) => `${f.split('/').pop().replace('_quantized.onnx', '')}: م ${main[i].join(' ')} · و ${wk ? wk[urls[i]].join(' ') : '—'}`).join('<br>');
}

// ---------- تنزيل بديل من الصفحة نفسها ----------
// إذا فشل المحرك (داخل الـ worker) في الاتصال، نجلب الملفات من الصفحة ونضعها في نفس الكاش الذي يقرأ منه المحرك، ثم نعيد المحاولة.
const SKIP_EXT = /\.(md|bin|h5|msgpack|safetensors|ot|png|jpe?g|gif|gitattributes)$/i;
const NEED_ONNX = /^onnx\/(encoder_model|decoder_model_merged)_quantized\.onnx$/;
async function listFiles(model) {
  try {
    const r = await fetch('https://huggingface.co/api/models/' + model, { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j && Array.isArray(j.siblings)) return j.siblings.map((x) => x.rfilename); }
  } catch (e) {}
  return DIAG_FILES.concat(['target.spm', 'special_tokens_map.json']);
}
export async function prefetchViaMain(model, onProgress) {
  if (typeof caches === 'undefined') throw new Error('Cache Storage غير متاح');
  const base = 'https://huggingface.co/' + model + '/resolve/main/', cache = await caches.open(CACHE_NAME);
  const files = (await listFiles(model)).filter((f) => f.startsWith('onnx/') ? NEED_ONNX.test(f) : !SKIP_EXT.test(f) && !f.startsWith('.'));
  const seen = new Map();
  for (const f of files) {
    const url = base + f;
    if (await cache.match(url)) continue;
    const r = await fetch(url, { cache: 'no-store' });
    if (r.status === 404) continue;
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + f);
    const total = Number(r.headers.get('content-length')) || 0; seen.set(f, { loaded: 0, total });
    const counter = new TransformStream({ transform(chunk, ctl) { seen.get(f).loaded += chunk.byteLength; onProgress && onProgress(seen); ctl.enqueue(chunk); } });
    const h = new Headers(r.headers); h.delete('vary'); // Vary يمنع مطابقة الكاش لاحقاً
    await cache.put(url, new Response(r.body.pipeThrough(counter), { status: 200, headers: h }));
  }
}

// ---------- تنزيل وحذف ----------
// opts: { kind='translation', onProgress({model,index,count,loaded,total}) }
export async function installModels(models, opts = {}) {
  const kind = opts.kind || 'translation';
  const todo = models.filter((m) => !isInstalled(m));
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
  if (todo.length) await prefetchRuntime();
  let cur = todo[0];
  const isNet = (e) => /fetch|network|load failed|اتصال/i.test(String(e && e.message));
  try {
    for (let i = 0; i < todo.length; i++) {
      cur = todo[i];
      const files = new Map();
      const report = () => { let l = 0, t = 0; files.forEach((f) => { l += f.loaded; t += f.total; }); opts.onProgress && opts.onProgress({ model: todo[i], index: i + 1, count: todo.length, loaded: l, total: t }); };
      const load = () => call({ op: 'load', kind, model: todo[i] }, (m) => { if (m.file) files.set(m.file, { loaded: m.loaded, total: m.total }); report(); });
      try { await load(); }
      catch (e) {
        if (!isNet(e)) throw e;
        // المحرك فشل في الاتصال: نجرب الجلب من الصفحة ثم نعيد المحاولة مرة واحدة
        e.firstError = e.message;
        await prefetchViaMain(todo[i], (seen) => { files.clear(); seen.forEach((v, k) => files.set(k, v)); report(); });
        files.clear();
        await load();
      }
      const bytes = await cacheBytes(todo[i]);
      const man = readManifest(); man[todo[i]] = { bytes, at: Date.now(), kind }; writeManifest(man);
    }
  } catch (e) {
    if (isNet(e)) { try { e.message += ' — ' + await netDiag(cur); } catch (x) {} }
    throw e;
  }
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

export async function localTranslate(text, srcCode, tgtCode) {
  const p = plan(srcCode, tgtCode);
  if (!p) return null;
  let cur = String(text);
  for (const st of p.steps) {
    const r = await call({ op: 'translate', model: st.model, text: (st.prefix || '') + cur, opts: st.opts });
    cur = r.text;
  }
  return cur.trim() || null;
}

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
