// سكربت صفحة التطبيق (كان مضمّناً في app.html؛ فصلناه ليعمل مع سياسة أمان صارمة بدون unsafe-inline).
const LANGUAGES_14 = [
  { code: 'ar',    apiCode: 'ar',    ttsCode: 'ar',    recCode: 'ar-EG', flag: '🇪🇬', nameAr: 'العربية',               native: 'العربية' },
  { code: 'en-US', apiCode: 'en',    ttsCode: 'en-US', recCode: 'en-US', flag: '🇺🇸', nameAr: 'الإنجليزية (أمريكا)',   native: 'English (US)' },
  { code: 'en-GB', apiCode: 'en',    ttsCode: 'en-GB', recCode: 'en-GB', flag: '🇬🇧', nameAr: 'الإنجليزية (بريطانيا)', native: 'English (UK)' },
  { code: 'de',    apiCode: 'de',    ttsCode: 'de',    recCode: 'de-DE', flag: '🇩🇪', nameAr: 'الألمانية',             native: 'Deutsch' },
  { code: 'fr',    apiCode: 'fr',    ttsCode: 'fr',    recCode: 'fr-FR', flag: '🇫🇷', nameAr: 'الفرنسية',              native: 'Français' },
  { code: 'nl',    apiCode: 'nl',    ttsCode: 'nl',    recCode: 'nl-NL', flag: '🇳🇱', nameAr: 'الهولندية',             native: 'Nederlands' },
  { code: 'it',    apiCode: 'it',    ttsCode: 'it',    recCode: 'it-IT', flag: '🇮🇹', nameAr: 'الإيطالية',             native: 'Italiano' },
  { code: 'es',    apiCode: 'es',    ttsCode: 'es',    recCode: 'es-ES', flag: '🇪🇸', nameAr: 'الإسبانية',             native: 'Español' },
  { code: 'zh-CN', apiCode: 'zh-CN', ttsCode: 'zh-CN', recCode: 'zh-CN', flag: '🇨🇳', nameAr: 'الصينية',               native: '中文' },
  { code: 'hi',    apiCode: 'hi',    ttsCode: 'hi',    recCode: 'hi-IN', flag: '🇮🇳', nameAr: 'الهندية',               native: 'हिन्दी' },
  { code: 'tr',    apiCode: 'tr',    ttsCode: 'tr',    recCode: 'tr-TR', flag: '🇹🇷', nameAr: 'التركية',               native: 'Türkçe' },
  { code: 'ru',    apiCode: 'ru',    ttsCode: 'ru',    recCode: 'ru-RU', flag: '🇷🇺', nameAr: 'الروسية',               native: 'Русский' },
  { code: 'ja',    apiCode: 'ja',    ttsCode: 'ja',    recCode: 'ja-JP', flag: '🇯🇵', nameAr: 'اليابانية',             native: '日本語' },
  { code: 'ko',    apiCode: 'ko',    ttsCode: 'ko',    recCode: 'ko-KR', flag: '🇰🇷', nameAr: 'الكورية',               native: '한국어' },
  { code: 'pt',    apiCode: 'pt',    ttsCode: 'pt',    recCode: 'pt-PT', flag: '🇵🇹', nameAr: 'البرتغالية',            native: 'Português' },
];
const $ = (id) => document.getElementById(id);
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const meta = (c) => LANGUAGES_14.find((l) => l.code === c) || LANGUAGES_14[0];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let src = store.get('las_src', 'ar'), tgt = store.get('las_tgt', 'en-US');
if (!LANGUAGES_14.some((l) => l.code === src)) src = 'ar';
if (!LANGUAGES_14.some((l) => l.code === tgt) || tgt === src) tgt = src === 'en-US' ? 'ar' : 'en-US';
// إصلاح لمرة واحدة: النسخ القديمة كانت بتحفظ اللغتين مقلوبين أثناء دور «الطرف الآخر»، فناس كتير اتحفظ عندهم
// إن لغتهم إنجليزي والترجمة للعربي، والمايك العادي بقى يسمع إنجليزي. لو المحفوظ «حاجة ← عربي» من قبل الإصلاح، نرجّعه.
if (!store.get('las_pair_v', '')) {
  if (tgt === 'ar' && src !== 'ar') [src, tgt] = [tgt, src];
  store.set('las_pair_v', '2');
}
let voiceGender = store.get('las_gender', 'female'), autoSpeak = store.get('las_autospeak', '1') === '1';
let lastOut = '', lastOutLang = '', seq = 0, debounce = null, picking = 'from';
// دور مين بيتكلم: false = أنا، true = الطرف الآخر (اللغتين مقلوبتين مؤقتاً). شوف setTurn تحت.
let otherTurn = false;

const enginePromise = import('./translate.js').then((m) => ({ m, t: m.createTranslator() }));
const phoneticPromise = import('./phonetics.js');
const VIA = { google: 'ترجمة جوجل', mymemory: 'ترجمة MyMemory', cache: 'من الذاكرة', phrasebook: 'جملة جاهزة · بدون إنترنت', local: 'موديل على جهازك · بدون إنترنت', same: '' };

function setStatus(msg, kind) { const s = $('status'); s.textContent = msg; s.className = 'status' + (kind ? ' ' + kind : ''); }

// ---------- اللغات والمدار ----------
function renderPair() {
  const a = meta(src), b = meta(tgt);
  $('from-name').textContent = `${a.flag} ${a.nameAr}`;
  $('to-name').textContent = `${b.flag} ${b.native}`;
  $('other-label').textContent = `الطرف الآخر يتكلّم: \u2068${b.native}\u2069`;
  $('input').dir = src === 'ar' ? 'rtl' : 'ltr';
  // نحفظ دايماً اتجاه «أنا» مش الاتجاه المقلوب مؤقتاً لدور الطرف الآخر: الموبايل بيقفل الصفحة ويفتحها في الخلفية كتير،
  // ولو حفظنا المقلوب كان التطبيق يفتح على إن لغة الطرف الآخر هي لغتي، والمايك العادي يفضل يسمع بيها.
  store.set('las_src', otherTurn ? tgt : src); store.set('las_tgt', otherTurn ? src : tgt);
  const others = LANGUAGES_14.filter((l) => l.code !== src);
  $('ring').innerHTML = others.map((l, i) => `<div class="slot" style="--a:${(360 / others.length) * i}deg"><div class="unrot"><button class="chip" data-code="${l.code}" aria-pressed="${l.code === tgt}" aria-label="ترجم إلى ${l.nameAr}" title="${l.nameAr}">${l.flag}</button></div></div>`).join('');
}
// أي اختيار يدوي للغات يعتبر الوضع الحالي هو «أنا» من جديد
function setTarget(code) { if (code === src) return; otherTurn = false; tgt = code; renderPair(); setStatus(`الترجمة إلى ${meta(tgt).nameAr}`); translateNow(); }
function swapLangs() { otherTurn = false; [src, tgt] = [tgt, src]; if (lastOut) { $('input').value = lastOut; } renderPair(); translateNow(); }
let holdTimer = null;
function holdOrbit(ms) { $('stage').classList.add('hold'); clearTimeout(holdTimer); if (ms) holdTimer = setTimeout(() => { if (!micBusy()) $('stage').classList.remove('hold'); }, ms); }
$('ring').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) { setTarget(b.dataset.code); holdOrbit(3500); } });
$('stage').addEventListener('pointerdown', () => holdOrbit(3500));
$('swap').onclick = swapLangs;

function openPicker(which) {
  picking = which; $('pick-title').textContent = which === 'from' ? 'أتكلّم بأي لغة؟' : 'الترجمة إلى أي لغة؟';
  const cur = which === 'from' ? src : tgt;
  $('pick-grid').innerHTML = LANGUAGES_14.map((l) => `<button class="lang-btn" data-code="${l.code}" aria-pressed="${l.code === cur}"><em>${l.flag}</em><span><b>${l.native}</b><small>${l.nameAr}</small></span></button>`).join('');
  $('pick-scrim').classList.add('open');
}
$('from-btn').onclick = () => openPicker('from'); $('to-btn').onclick = () => openPicker('to');
$('pick-grid').addEventListener('click', (e) => {
  const b = e.target.closest('.lang-btn'); if (!b) return; const c = b.dataset.code;
  otherTurn = false;
  if (picking === 'from') { if (c === tgt) tgt = src; src = c; } else { if (c === src) src = tgt; tgt = c; }
  $('pick-scrim').classList.remove('open'); renderPair(); translateNow();
});
document.querySelectorAll('.scrim').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s || e.target.closest('[data-close]')) s.classList.remove('open'); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.querySelectorAll('.scrim.open').forEach((s) => s.classList.remove('open')); $('show').classList.remove('open'); } });

// ---------- الترجمة والنطق المكتوب ----------
async function renderPhonetic(text, code) {
  try {
    const { phonetic } = await phoneticPromise;
    const pills = code === 'ar' ? [] : await phonetic(text, code);
    $('phon-wrap').hidden = !pills.length;
    $('phon').innerHTML = pills.map((p) => `<span>${esc(p.ar)}</span>`).join('');
  } catch (e) { $('phon-wrap').hidden = true; }
}
function translateSoon() { clearTimeout(debounce); debounce = setTimeout(translateNow, 450); }
// أثناء الكلام: نترجم الجمل المكتملة فقط (مش كل نتيجة مؤقتة) وببطء أكتر، ومن غير ما نحفظ الجمل الناقصة في الكاش.
// كان بيتبعت طلب كل 450ms طول الكلام، فجوجل بيرد بـ 429 بسرعة والكاش يتملي بأجزاء جمل.
// ترجمة حيّة وإنت بتتكلم، بس بحد أقصى طلب كل 1.2 ثانية (مش مع كل كلمة)، عشان الشاشة ما تبانش واقفة
// وفي نفس الوقت ما نوصلش لحد جوجل (429). بعض موبايلات أندرويد ما بتبعتش نتايج نهائية غير لما توقف المايك.
let partialAt = 0;
function translateSoonPartial() {
  clearTimeout(debounce);
  const wait = Math.max(0, 1200 - (Date.now() - partialAt));
  debounce = setTimeout(() => { partialAt = Date.now(); translateNow({ partial: true }); }, wait);
}
async function translateNow(opts = {}) {
  clearTimeout(debounce);
  const text = $('input').value.trim(), out = $('out'), my = ++seq;
  if (!text) { lastOut = ''; out.textContent = 'الترجمة تظهر هنا.'; out.className = 'out-text muted'; $('via').textContent = ''; $('phon-wrap').hidden = true; return ''; }
  if (!lastOut) { out.textContent = '… جاري الترجمة'; out.className = 'out-text muted'; }
  try {
    const { t } = await enginePromise;
    const res = await t.translate(text, src, tgt, { cache: !opts.partial });
    if (my !== seq) return lastOut;
    lastOut = res.text; lastOutLang = tgt; out.textContent = res.text; out.className = 'out-text'; out.dir = tgt === 'ar' ? 'rtl' : 'ltr';
    $('via').textContent = VIA[res.via] || '';
    renderPhonetic(res.text, tgt);
    return res.text;
  } catch (e) {
    if (my !== seq) return lastOut;
    lastOut = ''; out.className = 'out-text err'; $('via').textContent = ''; $('phon-wrap').hidden = true;
    out.textContent = navigator.onLine === false
      ? 'لا يوجد إنترنت، ولا توجد حزمة ترجمة منزّلة لهاتين اللغتين. نزّل الحزمة من الإعدادات لتترجم بدون اتصال.'
      : 'تعذّرت الترجمة الآن (الخدمة لم تردّ). حاول بعد قليل، أو نزّل حزمة اللغة من الإعدادات.';
    return '';
  }
}
$('input').addEventListener('input', translateSoon);

// ---------- نطق الترجمة ----------
const MALE = /\b(male|man|david|mark|daniel|george|james|guy|thomas|diego|jorge|luca|maged|tarik|naayf|hamed|shakir|hans|stefan|pavel|yuri|ichiro|otoya|rishi|hemant|cem|xander)\b/i;
const FEMALE = /\b(female|woman|zira|samantha|susan|karen|moira|tessa|victoria|laila|salma|hoda|zariyah|mariam|amelie|anna|helena|sabina|paulina|monica|alice|federica|ellen|kyoko|yuna|lekha|kalpana|yelda|milena|irina|luciana|joana|ting|mei)\b/i;
const GOOD = /natural|neural|enhanced|premium|online|google|siri|wavenet/i, BAD = /espeak|compact|eloquence|pico/i;
const voiceMode = () => store.get('las_voice_mode', 'auto');
const isHQ = (v) => !!v && !BAD.test(v.name) && (GOOD.test(v.name) || v.localService === false);
const voicesFor = (l) => { const base = l.ttsCode.split('-')[0].toLowerCase(); return (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base)); };
const voiceScore = (v, l, male, online) => (GOOD.test(v.name) ? 4 : 0) - (BAD.test(v.name) ? 6 : 0)
  + ((male ? MALE : FEMALE).test(v.name) ? 3 : 0) - ((male ? FEMALE : MALE).test(v.name) ? 3 : 0)
  + (online && v.localService === false ? 2 : 0)
  + (v.lang.replace('_', '-').toLowerCase() === l.recCode.toLowerCase() ? 4 : 0);
// الصوت الذي اختاره المستخدم لهذه اللغة (إن كان لا يزال موجوداً، ومتاحاً بدون إنترنت عند انقطاعه)
function chosenVoice(l) {
  const name = store.get('las_voice_' + l.code, ''); if (!name) return null;
  const v = voicesFor(l).find((x) => x.name === name) || null;
  return v && (navigator.onLine !== false || v.localService !== false) ? v : null;
}
function pickVoice(l, male) {
  const online = navigator.onLine !== false;
  let pool = voicesFor(l);
  if (!online) { const local = pool.filter((v) => v.localService !== false); if (local.length) pool = local; }
  return chosenVoice(l) || pool.sort((x, y) => voiceScore(y, l, male, online) - voiceScore(x, l, male, online))[0] || null;
}
// نقسّم النص إلى جمل: أنعم في الإيقاع، ويتفادى انقطاع الجمل الطويلة في بعض المتصفحات.
const splitSentences = (t) => ((t.match(/[^.!?؟。！？…\n]+[.!?؟。！？…]*/g) || [t]).map((x) => x.trim()).filter(Boolean));
function speakDevice(text, l, slow, voiceOverride, done) {
  if (!('speechSynthesis' in window)) { setStatus('جهازك لا يدعم نطق النص.', 'err'); if (done) done(); return; }
  try {
    speechSynthesis.cancel();
    const v = voiceOverride || pickVoice(l, voiceGender === 'male');
    if (!v && navigator.onLine === false && !voicesFor(l).length) { setStatus(`لا يوجد صوت ${l.nameAr} على جهازك للنطق بدون إنترنت.`, 'err'); if (done) done(); return; }
    const parts = splitSentences(text);
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = l.recCode; if (v) u.voice = v;
      u.pitch = 1; u.rate = slow ? 0.75 : 1; // بدون تغيير النبرة: هو ما كان يجعل الصوت آلياً
      if (done && i === parts.length - 1) { u.onend = done; u.onerror = done; }
      speechSynthesis.speak(u);
    });
    if (done && !parts.length) done();
  } catch (e) { setStatus('تعذّر تشغيل الصوت.', 'err'); if (done) done(); }
}
// صوت طبيعي من الإنترنت (خدمة جوجل غير الرسمية): يُقسَّم النص ويُشغَّل بالتتابع، وعند أي فشل نرجع لصوت الجهاز.
let netAudio = null, speakSeq = 0;
function chunkText(t) {
  const out = []; let cur = '';
  for (const w of t.split(/\s+/)) { if ((cur + ' ' + w).length > 170 && cur) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
  if (cur) out.push(cur);
  return out.flatMap((c) => c.length > 180 ? c.match(/.{1,180}/gu) : [c]);
}
function speakNet(text, l, slow, done) {
  const parts = chunkText(text), my = ++speakSeq; let i = 0;
  let failed = false;
  const fail = () => { if (failed || my !== speakSeq) return; failed = true; speakDevice(parts.slice(i).join(' '), l, slow, undefined, done); };
  const next = () => {
    if (my !== speakSeq) return;
    if (i >= parts.length) { if (done) done(); return; }
    const a = new Audio(`https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${encodeURIComponent(l.ttsCode)}&ttsspeed=${slow ? 0.3 : 1}&q=${encodeURIComponent(parts[i])}`);
    netAudio = a; a.onended = () => { i++; next(); }; a.onerror = fail;
    a.play().catch(fail);
  };
  next();
}
function stopSpeaking() { speakSeq++; try { netAudio && netAudio.pause(); } catch (e) {} try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} }
function speak(text, code, slow, done) {
  if (!text) { if (done) done(); return; }
  stopSpeaking();
  const l = meta(code), mode = voiceMode(), online = navigator.onLine !== false;
  if (mode === 'device') { speakDevice(text, l, slow, undefined, done); return; }
  if (mode === 'natural') { if (online) speakNet(text, l, slow, done); else speakDevice(text, l, slow, undefined, done); return; }
  // تلقائي: أفضل صوت على الجهاز إن كان عالي الجودة (أو اختاره المستخدم)، وإلا صوت الإنترنت
  const dv = pickVoice(l, voiceGender === 'male');
  if (!online || chosenVoice(l) || isHQ(dv)) speakDevice(text, l, slow, undefined, done); else speakNet(text, l, slow, done);
}

// ---------- منتقي صوت اللغة ----------
const SAMPLES = { 'ar': 'مرحباً، كيف حالك اليوم؟', 'en-US': 'Hello, how are you today?', 'en-GB': 'Hello, how are you today?', 'de': 'Hallo, wie geht es dir heute?', 'fr': 'Bonjour, comment allez-vous aujourd\u2019hui ?', 'nl': 'Hallo, hoe gaat het vandaag met je?', 'it': 'Ciao, come stai oggi?', 'es': 'Hola, ¿cómo estás hoy?', 'zh-CN': '你好，你今天好吗？', 'hi': 'नमस्ते, आप आज कैसे हैं?', 'tr': 'Merhaba, bugün nasılsın?', 'ru': 'Привет, как у тебя дела сегодня?', 'ja': 'こんにちは、今日はお元気ですか？', 'ko': '안녕하세요, 오늘 잘 지내세요?', 'pt': 'Olá, como estás hoje?' };
function paintVoicePicker() {
  const langSel = $('vp-lang'), voiceSel = $('vp-voice'); if (!langSel || !voiceSel) return;
  if (!langSel.options.length) langSel.innerHTML = LANGUAGES_14.map((l) => `<option value="${l.code}">${l.flag} ${l.nameAr}</option>`).join('');
  if (!langSel.dataset.init) { langSel.value = tgt; langSel.dataset.init = '1'; }
  const l = meta(langSel.value), online = navigator.onLine !== false, male = voiceGender === 'male';
  const list = voicesFor(l).sort((x, y) => voiceScore(y, l, male, online) - voiceScore(x, l, male, online));
  const saved = store.get('las_voice_' + l.code, '');
  voiceSel.innerHTML = `<option value="">تلقائي (الأفضل المتاح)</option>` + list.map((v) => `<option value="${esc(v.name)}">${isHQ(v) ? '✦ ' : ''}${esc(v.name)}${v.localService === false ? ' (يحتاج إنترنت)' : ''}</option>`).join('');
  voiceSel.value = list.some((v) => v.name === saved) ? saved : '';
  $('vp-hint').textContent = list.length ? '' : 'لا توجد أصوات لهذه اللغة على جهازك. ثبّت بيانات الصوت من إعدادات «تحويل النص إلى كلام» في هاتفك، أو استخدم وضع «أونلاين».';
}
function testVoice() {
  const l = meta($('vp-lang').value), name = $('vp-voice').value;
  const v = name ? voicesFor(l).find((x) => x.name === name) : null;
  stopSpeaking(); speakDevice(SAMPLES[l.code] || SAMPLES[l.ttsCode] || '', l, false, v || undefined);
}
$('vp-lang').onchange = () => { paintVoicePicker(); testVoice(); };
$('vp-voice').onchange = () => { store.set('las_voice_' + $('vp-lang').value, $('vp-voice').value); testVoice(); };
$('vp-test').onclick = testVoice;
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => paintVoicePicker();
// lastOutLang: لغة الترجمة المعروضة (ممكن تختلف عن tgt بعد ما نرجع من دور الطرف الآخر)
$('play').onclick = () => speak(lastOut, lastOutLang || tgt, false);
$('slow').onclick = () => speak(lastOut, lastOutLang || tgt, true);
$('copy').onclick = async () => { if (!lastOut) return; try { await navigator.clipboard.writeText(lastOut); setStatus('تم نسخ الترجمة.', 'ok'); } catch (e) { setStatus('تعذّر النسخ.', 'err'); } };
$('showbig').onclick = () => { if (!lastOut) return; $('show-text').textContent = lastOut; $('show').classList.add('open'); };
$('show').onclick = () => $('show').classList.remove('open');

// ---------- المايكروفون ----------
let micState = 'idle', rec = null, finalText = '', offlineRec = null, offlineTimer = null;
const micBusy = () => micState !== 'idle';
const getMicMode = () => store.get('las_mic_mode', 'auto');
function micUI(state) {
  micState = state; const m = $('mic');
  m.classList.toggle('rec', state === 'online' || state === 'device'); m.classList.toggle('busy', state === 'working');
  m.setAttribute('aria-label', state === 'idle' ? 'ابدأ الكلام' : 'أوقف واسمع الترجمة');
  $('stage').classList.toggle('hold', state !== 'idle');
}
// ---------- المحادثة التلقائية ----------
// تتكلم وتسكت ← تتترجم وتتنطق للطرف الآخر ← المايك يفتح للطرف الآخر بلغته ← يسكت ← يتترجملك ويتنطق ← يرجعلك… وهكذا.
// للإيقاف: اضغط المايك وإنت ساكت (أو والترجمة بتتنطق).
// 2.5 ثانية سكوت = خلص كلامه. أقل من كده كان بيقطع الجمل الطويلة لما الواحد ياخد نفسه.
const SILENCE_MS = Math.max(1200, parseInt(store.get('las_silence_ms', '2500'), 10) || 2500);
// المايك التالي: من غير نت (أو وضع الجهاز) = Whisper على الموبايل، غير كده = تعرّف المتصفح
const useDeviceMic = () => getMicMode() === 'device' || !(window.SpeechRecognition || window.webkitSpeechRecognition) || navigator.onLine === false;
function startListening(opts) { if (useDeviceMic()) startDevice(opts); else startOnline(opts); }
let convo = false, silenceTimer = null, convoSpeaking = false, convoSpeakFin = null;
function armSilence() {
  clearTimeout(silenceTimer);
  if (!convo) return;
  silenceTimer = setTimeout(() => { if (micState === 'online' && $('input').value.trim()) stopOnline(); }, SILENCE_MS);
}
function endConvo(msg) {
  convo = false; clearTimeout(silenceTimer);
  if (convoSpeakFin) { const f = convoSpeakFin; convoSpeakFin = null; f(); }
  convoSpeaking = false; stopSpeaking(); setTurn(false);
  if (msg) setStatus(msg);
}
// نطق ينتظر لحد ما الصوت يخلص فعلاً (عشان المايك ما يفتحش والترجمة لسه بتتنطق فيسمعها)
function speakAndWait(text, lang) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (done) return; done = true; convoSpeakFin = null; resolve(); };
    convoSpeakFin = fin;
    speak(text, lang, false, fin);
    setTimeout(fin, 20000 + text.length * 150); // حماية لو المتصفح ما قالش إن النطق خلص
  });
}
async function finishSpeech() {
  const outLang = tgt; // نثبّت لغة الترجمة قبل ما نغيّر الدور، عشان النطق يبقى باللغة الصح
  if (convo) micUI('working');
  const out = await translateNow();
  if (out) {
    setStatus('تمت الترجمة.', 'ok'); $('talk').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (autoSpeak) {
      if (convo) { micUI('idle'); convoSpeaking = true; setStatus(`🔊 بينطق الترجمة (${meta(outLang).nameAr})… اضغط المايك للإيقاف`, 'ok'); await speakAndWait(out, outLang); convoSpeaking = false; }
      else setTimeout(() => speak(out, outLang, false), 150);
    }
  }
  if (convo && out) {
    // الدور للطرف التاني، والمايك يفتح لوحده بلغته
    await new Promise((r) => setTimeout(r, 300));
    if (!convo) return;
    setTurn(!otherTurn); startListening({ keepConvo: true });
    return;
  }
  if (convo) { micUI('idle'); endConvo(out ? '' : 'وقفت المحادثة لأن الترجمة ما نجحتش. اضغط المايك وجرّب تاني.'); return; }
  // دور الطرف الآخر خلص: نرجّع الشاشة والمايك لاتجاهي أنا على طول
  if (otherTurn) setTurn(false);
}
function startOnline(opts = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!opts.keepConvo) convo = store.get('las_autoconvo', '1') === '1';
  finalText = ''; $('input').value = ''; lastOut = '';
  try {
    rec = new SR(); rec.lang = meta(src).recCode; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalText += r[0].transcript + ' '; else interim += r[0].transcript; }
      $('input').value = (finalText + interim).trim();
      if (micState === 'online') { translateSoonPartial(); armSilence(); }
    };
    rec.onend = () => {
      if (micState === 'online') { try { rec.start(); } catch (e) {} return; }
      if (recEnded) { const r = recEnded; recEnded = null; r(); }
    };
    rec.onerror = (ev) => {
      const er = ev && ev.error;
      if (er === 'no-speech' || er === 'aborted') return;
      micUI('idle');
      if (er === 'network' || er === 'service-not-allowed' || er === 'language-not-supported') fallbackToDevice();
      else if (er === 'not-allowed') setStatus('لم يُسمح باستخدام المايكروفون. فعّل الإذن من إعدادات المتصفح.', 'err');
      else setStatus('توقف المايكروفون. اضغط للمحاولة مرة أخرى.', 'err');
    };
    rec.start(); micUI('online');
    setStatus(convo
      ? `${otherTurn ? '🗣️ دور الطرف الآخر' : '🎙️ دورك'}: اتكلم ${meta(src).nameAr}، ولما تسكت هيترجم وينطق لوحده. (اضغط المايك وإنت ساكت لإنهاء المحادثة)`
      : `يسمعك الآن (${meta(src).nameAr})… اضغط للإيقاف.`, 'rec');
  } catch (e) { micUI('idle'); setStatus('تعذّر تشغيل المايكروفون: ' + e.message, 'err'); }
}
// بعد stop() المتصفح بيبعت آخر نتيجة نهائية ثم onend. كنا بنستنى 350ms ثابتة، وده أقل من اللازم غالباً على أندرويد
// فآخر كلمات المتكلم كانت بتضيع. دلوقتي بنستنى onend فعلاً (بحد أقصى 2.5 ثانية).
let recEnded = null;
async function stopOnline() {
  clearTimeout(silenceTimer);
  micUI('working');
  const ended = new Promise((r) => { recEnded = r; setTimeout(r, 2500); });
  try { rec && rec.stop(); } catch (e) { if (recEnded) { recEnded(); recEnded = null; } }
  await ended; recEnded = null;
  micUI('idle'); await finishSpeech();
}
// المايك على الجهاز (Whisper) — بيشتغل من غير نت بالحزمة المتنزلة.
// في المحادثة التلقائية بنكشف السكوت من مستوى الصوت نفسه (مفيش نتايج كلام لحظية زي تعرّف المتصفح):
// لما يتسمع كلام وبعده سكوت SILENCE_MS، بنقفل التسجيل ونفرّغ ونترجم وننطق ونفتح للطرف التاني.
let devHeard = false, devLastLoud = 0, devNoise = 0.01, devVadTimer = null;
async function startDevice(opts = {}) {
  if (!opts.keepConvo) convo = store.get('las_autoconvo', '1') === '1';
  let P, M;
  try { [P, M] = await Promise.all([import('./packs.js'), import('./offline-mic.js')]); }
  catch (e) { convo = false; setStatus('تعذّر تحميل وحدة التعرّف على الصوت: ' + e.message, 'err'); return; }
  if (!P.installedWhisper()) { convo = false; setTurn(false); setStatus('المايك بدون إنترنت يحتاج حزمة تعرّف على الصوت (Whisper). نزّلها من الإعدادات.', 'err'); return; }
  devHeard = false; devLastLoud = Date.now(); devNoise = 0.01;
  const onLevel = (lv) => {
    // أرضية الضوضاء بتتعلم ببطء من الأصوات الواطية؛ الكلام = أعلى منها بوضوح
    if (lv < devNoise * 2) devNoise = devNoise * 0.95 + lv * 0.05;
    if (lv > Math.max(0.02, devNoise * 3)) { devHeard = true; devLastLoud = Date.now(); }
  };
  try { offlineRec = M.createRecorder(); await offlineRec.start(onLevel); }
  catch (e) { offlineRec = null; convo = false; setStatus('تعذّر فتح المايكروفون: ' + (e && e.name === 'NotAllowedError' ? 'لم يُسمح بالإذن' : (e && e.message) || e), 'err'); return; }
  $('input').value = ''; lastOut = '';
  micUI('device');
  setStatus(convo
    ? `${otherTurn ? '🗣️ دور الطرف الآخر' : '🎙️ دورك'} (بدون إنترنت): اتكلم ${meta(src).nameAr}، ولما تسكت هيترجم وينطق لوحده. (اضغط المايك وإنت ساكت لإنهاء المحادثة)`
    : 'يسجّل على جهازك بدون إنترنت… اضغط للإيقاف.', 'rec');
  offlineTimer = setTimeout(() => { if (micState === 'device') stopDevice(); }, 120000);
  clearInterval(devVadTimer);
  if (convo) devVadTimer = setInterval(() => {
    if (micState !== 'device' || !convo) { clearInterval(devVadTimer); return; }
    if (devHeard && Date.now() - devLastLoud > SILENCE_MS) { clearInterval(devVadTimer); stopDevice(); }
  }, 200);
}
async function stopDevice() {
  clearInterval(devVadTimer);
  const r0 = offlineRec; offlineRec = null; clearTimeout(offlineTimer); micUI('working');
  setStatus('جاري التعرّف على الصوت على جهازك… (أول مرة أبطأ)');
  // في المحادثة: لو ما اتسمعش كلام مفهوم نرجع نسمع نفس الشخص بدل ما نوقف كل حاجة
  const retry = (msg) => { micUI('idle'); if (convo) { setStatus(msg); startDevice({ keepConvo: true }); } else setStatus(msg, 'err'); };
  try {
    const r = await r0.stop();
    if (r.seconds < 0.4 || r.peak < 0.01) return retry('لم يُسمع صوت واضح. قرّب الجهاز وحاول مرة أخرى.');
    const P = await import('./packs.js');
    const text = await P.transcribe(r.audio, meta(src).recCode);
    if (!text) return retry('لم يُلتقط كلام مفهوم. حاول بصوت أوضح.');
    $('input').value = text; micUI('idle'); await finishSpeech();
  } catch (e) { micUI('idle'); if (convo) endConvo(); setStatus('فشل التعرّف على الصوت على الجهاز: ' + ((e && e.message) || e), 'err'); }
}
async function fallbackToDevice() {
  const P = await import('./packs.js');
  if (P.installedWhisper()) startDevice();
  else setStatus('خدمة التعرّف على الصوت تحتاج إنترنت. نزّل حزمة المايك من الإعدادات لتعمل بدونه.', 'err');
}
// قبل كده زرار «الطرف الآخر» كان بيقلب اللغتين كل مرة: يسيبهم مقلوبين بعد دوره، ولو اتداس مرتين ورا بعض يرجعهم
// فيسمع الطرف الآخر بلغتي أنا. دلوقتي otherTurn (فوق) بيحدد الدور، ودور الطرف الآخر بيخلص لوحده في finishSpeech.
function setTurn(other) { if (other !== otherTurn) { [src, tgt] = [tgt, src]; otherTurn = other; renderPair(); } }
function toggleMic(reverse) {
  // أثناء المحادثة التلقائية: الضغط والترجمة بتتنطق = إيقاف المحادثة
  if (convo && convoSpeaking) { endConvo('⏹️ وقفت المحادثة.'); micUI('idle'); return; }
  if (micState === 'working') return;
  if (micState === 'online') {
    // الضغط وإنت ساكت (مفيش كلام) أثناء المحادثة = إنهاؤها. والضغط بعد كلام = ترجم دلوقتي من غير ما تستنى السكوت.
    if (convo && !$('input').value.trim()) {
      clearTimeout(silenceTimer); micUI('idle'); try { rec && rec.stop(); } catch (e) {}
      endConvo('⏹️ وقفت المحادثة.'); return;
    }
    return stopOnline();
  }
  if (micState === 'device') {
    if (convo && !devHeard) {
      clearInterval(devVadTimer); clearTimeout(offlineTimer);
      const r0 = offlineRec; offlineRec = null; try { r0 && r0.cancel(); } catch (e) {}
      micUI('idle'); endConvo('⏹️ وقفت المحادثة.'); return;
    }
    return stopDevice();
  }
  convo = false;
  setTurn(!!reverse);
  stopSpeaking();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (getMicMode() === 'device' || !SR || navigator.onLine === false) startDevice(); else startOnline();
}
$('mic').onclick = () => toggleMic(false);
$('other').onclick = () => toggleMic(true);

// ---------- وضع المؤتمرات ----------
let confRec = null, confOn = false, confVoice = false, confLock = null; const confLines = [];
// نطق الترجمة بالتتابع: كل جملة تنتظر انتهاء السابقة، وإذا تراكمت أكثر من 3 نتجاوز النطق (النص يظهر دائماً) كي لا يتأخر الصوت عن المتحدث.
let confSpeakChain = Promise.resolve(), confSpeakGen = 0, confSpeakPending = 0;
function confSpeak(text, code) {
  if (confSpeakPending >= 3) return;
  const gen = confSpeakGen; confSpeakPending++;
  confSpeakChain = confSpeakChain.then(() => new Promise((resolve) => {
    const fin = () => { if (fin.done) return; fin.done = true; confSpeakPending = Math.max(0, confSpeakPending - 1); resolve(); };
    if (gen !== confSpeakGen) { fin(); return; }
    speak(text, code, false, fin); setTimeout(fin, 45000);
  }));
}
function confSpeakReset() { confSpeakGen++; confSpeakPending = 0; confSpeakChain = Promise.resolve(); stopSpeaking(); }
const CONF_SIZES = [22, 30, 40]; let confSize = Math.min(CONF_SIZES.length - 1, Math.max(0, parseInt(store.get('las_conf_size', '0'), 10) || 0));
function confPaintSize() { $('conf-log').style.setProperty('--conf-fs', CONF_SIZES[confSize] + 'px'); }
const nearBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 90;
function confSetup() {
  const opts = LANGUAGES_14.map((l) => `<option value="${l.code}">${l.flag} ${l.nameAr}</option>`).join('');
  $('conf-spk').innerHTML = opts; $('conf-mine').innerHTML = opts; $('conf-spk').value = tgt; $('conf-mine').value = src;
}
async function confAdd(text) {
  const spk = $('conf-spk').value, mine = $('conf-mine').value, log = $('conf-log');
  $('conf-empty').hidden = true;
  const d = document.createElement('div'); d.className = 'conf-line';
  const stick = nearBottom(log);
  d.innerHTML = `<small dir="auto">${esc(text)}</small><p dir="auto">…</p>`; log.appendChild(d); if (stick) log.scrollTop = log.scrollHeight;
  const row = { src: text, out: '' }; confLines.push(row);
  try {
    const { t } = await enginePromise; const res = await t.translate(text, spk, mine);
    row.out = res.text; d.lastChild.textContent = res.text;
    if (confVoice && confOn) confSpeak(res.text, mine);
  } catch (e) { d.lastChild.textContent = 'تعذّرت ترجمة هذه الجملة.'; d.lastChild.className = 'err'; }
  if (stick) log.scrollTop = log.scrollHeight;
}
function confPaint() { $('conf-go').textContent = confOn ? 'إيقاف الاستماع' : 'ابدأ الاستماع'; $('conf-go').classList.toggle('on', confOn); $('conf-spk').disabled = $('conf-mine').disabled = confOn; }
async function confStart() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $('conf-live').textContent = 'متصفحك لا يدعم الاستماع المستمر. استخدم Chrome على أندرويد.'; return; }
  if (navigator.onLine === false) { $('conf-live').textContent = 'وضع المؤتمرات يحتاج اتصالاً بالإنترنت.'; return; }
  if ($('conf-spk').value === $('conf-mine').value) { $('conf-live').textContent = 'اختر لغتين مختلفتين.'; return; }
  try {
    confRec = new SR(); confRec.lang = meta($('conf-spk').value).recCode; confRec.continuous = true; confRec.interimResults = true;
    confRec.onresult = (e) => {
      if (!confOn) return;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) { const tx = r[0].transcript.trim(); if (tx) confAdd(tx); } else interim += r[0].transcript; }
      $('conf-live').textContent = interim;
    };
    confRec.onend = () => { if (confOn) { try { confRec.start(); } catch (e) {} } };
    confRec.onerror = (ev) => {
      const er = ev && ev.error; if (er === 'no-speech' || er === 'aborted') return;
      confOn = false; confPaint();
      $('conf-live').textContent = er === 'not-allowed' ? 'لم يُسمح باستخدام المايكروفون.' : er === 'network' ? 'انقطع الاتصال بخدمة التعرّف على الصوت.' : 'توقف الاستماع. اضغط للمتابعة.';
    };
    confRec.start(); confOn = true; confPaint(); $('conf-live').textContent = 'يستمع الآن…';
    try { confLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  } catch (e) { $('conf-live').textContent = 'تعذّر تشغيل المايكروفون: ' + e.message; }
}
function confStop() { confOn = false; try { confRec && confRec.stop(); } catch (e) {} try { confLock && confLock.release(); } catch (e) {} confLock = null; confSpeakReset(); confPaint(); $('conf-live').textContent = ''; }
// الشاشة تُطفأ تلقائياً عند مغادرة الصفحة: نعيد طلب بقائها مضاءة عند العودة أثناء الاستماع
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && confOn && !confLock && navigator.wakeLock) { try { confLock = await navigator.wakeLock.request('screen'); } catch (e) {} } });
$('conf-open').onclick = () => { if (micBusy()) return; confSetup(); confPaintSize(); $('conf').classList.add('open'); };
$('conf-close').onclick = () => { confStop(); $('conf').classList.remove('open'); };
$('conf-go').onclick = () => (confOn ? confStop() : confStart());
// المايك في المؤتمر لازم يفضل شغال طول الوقت عشان ما يفوتش كلام المحاضر، فلو الترجمة اتنطقت من سماعة الموبايل
// المايك هيلقطها ويترجمها كأنها كلام المحاضر. الحل الوحيد اللي ما يضيعش كلام: سماعة أذن، فبننبه عليها بوضوح.
$('conf-voice').onclick = (e) => {
  confVoice = !confVoice; e.currentTarget.setAttribute('aria-pressed', confVoice);
  if (!confVoice) confSpeakReset();
  else $('conf-live').textContent = '🎧 استخدم سماعة أذن: لو الترجمة اتنطقت من سماعة الموبايل، المايك هيلقطها ويترجمها كأنها كلام المتحدث.';
};
$('conf-size').onclick = () => { confSize = (confSize + 1) % CONF_SIZES.length; store.set('las_conf_size', String(confSize)); confPaintSize(); };
$('conf-save').onclick = () => {
  if (!confLines.length) { $('conf-live').textContent = 'لا يوجد نص للحفظ بعد.'; return; }
  const head = `لاس LAS — وضع المؤتمرات\n${new Date().toLocaleString('ar-EG')}\n${meta($('conf-spk').value).nameAr} ← ${meta($('conf-mine').value).nameAr}\n\n`;
  const txt = head + confLines.map((r) => r.src + '\n' + r.out).join('\n\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' })); a.download = 'las-transcript.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ---------- الإعدادات ----------
let packsApiPromise = null;
function getPacksApi() {
  if (!packsApiPromise) packsApiPromise = Promise.all([import('./packs-ui.js'), enginePromise]).then(([ui, eng]) => ui.initPacks({ root: $('packs-root'), languages: LANGUAGES_14, translator: eng.t }));
  return packsApiPromise;
}
function paintSettings() {
  document.querySelectorAll('#gender button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.g === voiceGender));
  document.querySelectorAll('#voicemode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === voiceMode()));
  document.querySelectorAll('#gender button').forEach((b) => { b.disabled = voiceMode() === 'natural'; b.style.opacity = b.disabled ? .45 : 1; });
  document.querySelectorAll('#micmode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === getMicMode()));
  $('autospeak').checked = autoSpeak; paintVoicePicker();
  if (store.get('las_speechdata_ready', '')) { $('prep').textContent = 'تم التجهيز ✓ (اضغط للتحديث)'; }
}
$('open-settings').onclick = () => { paintSettings(); $('set-scrim').classList.add('open'); getPacksApi().then((a) => a.render()).catch((e) => { $('packs-root').textContent = 'تعذّر تحميل مدير الحزم: ' + e.message; }); };
$('gender').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; voiceGender = b.dataset.g; store.set('las_gender', voiceGender); paintSettings(); speak(voiceGender === 'male' ? 'تم اختيار صوت الرجل' : 'تم اختيار صوت المرأة', 'ar', false); });
$('voicemode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; store.set('las_voice_mode', b.dataset.v); paintSettings(); speak('هذا هو الصوت المختار', 'ar', false); });
$('micmode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; store.set('las_mic_mode', b.dataset.m); paintSettings(); });
$('autospeak').onchange = (e) => { autoSpeak = e.target.checked; store.set('las_autospeak', autoSpeak ? '1' : '0'); };
$('prep').onclick = async () => {
  const btn = $('prep'), st = $('prep-status'); btn.disabled = true;
  const steps = [['en', 'القاموس الإنجليزي'], ['zh', 'الصيني'], ['ja', 'الياباني (الأكبر، قد يستغرق دقيقة)']];
  try {
    const { preloadPhonetics } = await phoneticPromise;
    for (let i = 0; i < steps.length; i++) { st.textContent = `(${i + 1}/${steps.length}) جاري تحميل ${steps[i][1]}…`; await preloadPhonetics(steps[i][0]); }
    store.set('las_speechdata_ready', String(Date.now())); st.textContent = 'تم. النطق جاهز للعمل بدون إنترنت.'; btn.textContent = 'تم التجهيز ✓';
  } catch (e) { st.textContent = 'تعذّر التحميل (تأكد من الإنترنت) وحاول مرة أخرى.'; }
  btn.disabled = false;
};
$('diag').onclick = () => import('./diagnostics.js').then((m) => m.renderDiagnostics($('diag-root'), LANGUAGES_14)).catch((e) => { $('diag-root').textContent = e.message; });

// ---------- الشبكة والتشغيل ----------
function paintNet() { const on = navigator.onLine !== false; $('net').textContent = on ? 'متصل' : 'بدون إنترنت'; $('net').classList.toggle('off', !on); }
window.addEventListener('online', paintNet); window.addEventListener('offline', paintNet);
renderPair(); paintNet();
setTimeout(() => getPacksApi().catch(() => {}), 1200);
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });

// ---------- إشعار «فيه نسخة جديدة» ----------
// الـ service worker الجديد بيتفعّل لوحده، لكن الصفحة المفتوحة بتفضل شغالة بالكود القديم لحد ما تتفتح من جديد.
// فلما نسخة جديدة تتفعّل بنظهر زرار تحديث واضح، ونشيّك على تحديثات كل ما المستخدم يرجع للتطبيق.
function showUpdateBanner() {
  if ($('las-update')) return;
  const b = document.createElement('button');
  b.id = 'las-update'; b.type = 'button';
  b.textContent = '✨ فيه نسخة جديدة من لاس — اضغط هنا للتحديث';
  b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:9999;padding:14px 16px;border-radius:16px;border:2px solid #F5CE42;background:#462659;color:#FCE988;font:800 15px Cairo,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.45);cursor:pointer';
  b.onclick = () => { b.disabled = true; b.textContent = '… جاري التحديث'; location.reload(); };
  document.body.appendChild(b);
}
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdateBanner(); hadController = true; });
  const checkForUpdate = () => navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
  setInterval(checkForUpdate, 30 * 60 * 1000);
}
