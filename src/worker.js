// Worker وسيط لمنصة لاس: يخدم /api/* فقط عبر خدمات Google Cloud الرسمية.
// الملفات الثابتة لا تمرّ من هنا (run_worker_first لـ /api/* فقط)، فتبقى مجانية وبلا حد.
// المفتاح السري: GOOGLE_CLOUD_API_KEY (يُضاف كسرّ للـWorker من لوحة Cloudflare، لا يوضع في الكود).

const MAX_TRANSLATE = 600;
const MAX_TTS = 220;

// لغات التطبيق كما يرسلها المتصفح (apiCode)
const TR_LANGS = new Set(['ar', 'en', 'de', 'fr', 'nl', 'it', 'es', 'zh-CN', 'hi', 'tr', 'ru', 'ja', 'ko', 'pt']);
// رموز النطق (ttsCode) ← languageCode في Cloud Text-to-Speech
const TTS_LANGS = {
  ar: 'ar-XA', 'en-US': 'en-US', 'en-GB': 'en-GB', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL', it: 'it-IT', es: 'es-ES',
  'zh-CN': 'cmn-CN', hi: 'hi-IN', tr: 'tr-TR', ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR', pt: 'pt-BR',
};

const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
});
const fail = (status, error, extra) => json({ error }, status, extra);

// طلبات المتصفح من نفس الموقع فقط (يمنع استخدام مفتاحنا من مواقع أخرى عبر المتصفح)
function sameOrigin(req, url) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.get('origin');
  if (origin && origin !== url.origin) return false;
  return true;
}

async function limited(env, req, route) {
  if (!env.RL || typeof env.RL.limit !== 'function') return false; // غير مفعّل (اختبار محلي)
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  try { const { success } = await env.RL.limit({ key: route + ':' + ip }); return !success; }
  catch (e) { return false; }
}

async function google(env, url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GOOGLE_CLOUD_API_KEY, ...(init && init.headers) },
  });
  if (!res.ok) { console.log('google upstream status', res.status, new URL(url).pathname); const e = new Error('upstream'); e.status = res.status; throw e; }
  return res;
}

// ---------- الترجمة ----------
async function handleTranslate(req, env) {
  let body;
  try { body = await req.json(); } catch (e) { return fail(400, 'bad_json'); }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const sl = body.sl, tl = body.tl;
  if (!text || !TR_LANGS.has(sl) || !TR_LANGS.has(tl) || sl === tl) return fail(400, 'bad_request');
  if (text.length > MAX_TRANSLATE) return fail(413, 'too_long');
  try {
    const res = await google(env, 'https://translation.googleapis.com/language/translate/v2', {
      method: 'POST',
      body: JSON.stringify({ q: text, source: sl, target: tl, format: 'text' }),
    });
    const data = await res.json();
    const out = data && data.data && data.data.translations && data.data.translations[0] && data.data.translations[0].translatedText;
    if (!out) return fail(502, 'empty_result');
    return json({ text: String(out) });
  } catch (e) { return fail(502, 'upstream_error'); }
}

// ---------- النطق ----------
let voicesCache = { at: 0, list: null };
async function voicesFor(env, languageCode) {
  if (!voicesCache.list || Date.now() - voicesCache.at > 6 * 3600 * 1000) {
    const res = await google(env, 'https://texttospeech.googleapis.com/v1/voices', { method: 'GET' });
    const data = await res.json();
    voicesCache = { at: Date.now(), list: Array.isArray(data.voices) ? data.voices : [] };
  }
  return voicesCache.list.filter((v) => (v.languageCodes || []).includes(languageCode));
}

// يختار أفضل صوت متاح للغة حسب الفئة المطلوبة (TTS_TIER) والجنس، دون تثبيت أسماء أصوات في الكود.
export function pickVoice(voices, gender, tier = 'wavenet') {
  const order = {
    standard: ['Standard', 'WaveNet', 'Neural2'],
    wavenet: ['WaveNet', 'Neural2', 'Standard'],
    neural2: ['Neural2', 'WaveNet', 'Standard'],
    chirp: ['Chirp3-HD', 'Neural2', 'WaveNet', 'Standard'],
  }[tier] || ['WaveNet', 'Neural2', 'Standard'];
  const want = gender === 'male' ? 'MALE' : 'FEMALE';
  for (const kind of order) {
    const ofKind = voices.filter((v) => new RegExp('-' + kind + '(-|$)', 'i').test(v.name));
    const hit = ofKind.find((v) => v.ssmlGender === want) || ofKind[0];
    if (hit) return hit.name;
  }
  return null;
}

async function handleTts(url, env) {
  const text = (url.searchParams.get('text') || '').trim();
  const languageCode = TTS_LANGS[url.searchParams.get('lang')];
  const gender = url.searchParams.get('gender') === 'male' ? 'male' : 'female';
  const slow = url.searchParams.get('slow') === '1';
  if (!text || !languageCode) return fail(400, 'bad_request');
  if (text.length > MAX_TTS) return fail(413, 'too_long');
  try {
    let name = null;
    try { name = pickVoice(await voicesFor(env, languageCode), gender, env.TTS_TIER); } catch (e) { /* نكمل بلا اسم صوت */ }
    const voice = name ? { languageCode, name } : { languageCode, ssmlGender: gender === 'male' ? 'MALE' : 'FEMALE' };
    const res = await google(env, 'https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      body: JSON.stringify({ input: { text }, voice, audioConfig: { audioEncoding: 'MP3', speakingRate: slow ? 0.7 : 1 } }),
    });
    const data = await res.json();
    if (!data.audioContent) return fail(502, 'empty_result');
    const bin = Uint8Array.from(atob(data.audioContent), (c) => c.charCodeAt(0));
    return new Response(bin, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=604800', 'x-content-type-options': 'nosniff' } });
  } catch (e) { return fail(502, 'upstream_error'); }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });

    if (url.pathname === '/api/health') {
      if (req.method !== 'GET') return fail(405, 'method', { allow: 'GET' });
      return json({ ok: true, translate: !!env.GOOGLE_CLOUD_API_KEY, tts: !!env.GOOGLE_CLOUD_API_KEY });
    }
    const route = url.pathname === '/api/translate' ? 'translate' : url.pathname === '/api/tts' ? 'tts' : null;
    if (!route) return fail(404, 'not_found');
    const method = route === 'translate' ? 'POST' : 'GET';
    if (req.method !== method) return fail(405, 'method', { allow: method });
    if (!sameOrigin(req, url)) return fail(403, 'forbidden');
    if (!env.GOOGLE_CLOUD_API_KEY) return fail(503, 'not_configured');
    if (await limited(env, req, route)) return fail(429, 'rate_limited', { 'retry-after': '30' });
    return route === 'translate' ? handleTranslate(req, env) : handleTts(url, env);
  },
};
