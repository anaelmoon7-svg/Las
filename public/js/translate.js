// محرك الترجمة: جوجل → MyMemory → (موديل محلي إن وُجد) → الجمل الجاهزة → خطأ صادق.
// لا يُرجع أبداً نصاً مزيفاً: إما ترجمة حقيقية أو يرمي NoTranslation.

export class NoTranslation extends Error {
  constructor(reasons) { super('no translation'); this.reasons = reasons; }
}

// ---------- الجمل الجاهزة (تعمل بدون أي اتصال) ----------
export const PHRASEBOOK = {
  'لو سمحت، أين توجد أقرب صيدلية أو محطة قطار؟': {
    en: 'Excuse me, where is the nearest pharmacy or train station?',
    de: 'Entschuldigung, wo ist die nächste Apotheke oder der nächste Bahnhof?',
    fr: 'Excusez-moi, où se trouve la pharmacie ou la gare la plus proche ?',
    es: 'Disculpe, ¿dónde está la farmacia o estación de tren más cercana?',
    it: 'Mi scusi, dov’è la farmacia o la stazione ferroviaria più vicina?',
    nl: 'Pardon, waar is de dichtstbijzijnde apotheek of het treinstation?',
    tr: 'Affedersiniz, en yakın eczane veya tren istasyonu nerede?',
    ru: 'Извините, где находится ближайшая аптека или вокзал?',
    zh: '请问，最近的药店或火车站怎么走？',
    ja: 'すみません、一番近い薬局か駅はどこですか？',
    ko: '실례지만, 가장 가까운 약국이나 기차역이 어디인가요?',
    pt: 'Com licença, onde fica a farmácia ou a estação de comboios mais próxima?',
    hi: 'माफ़ कीजिए, सबसे नज़दीकी दवाई की दुकान या रेलवे स्टेशन कहाँ है?',
  },
  'مرحباً، لدي حجز مؤكد في الفندق باسمي اليوم.': {
    en: 'Hello, I have a confirmed reservation under my name today.',
    de: 'Hallo, ich habe heute eine bestätigte Reservierung auf meinen Namen.',
    fr: 'Bonjour, j’ai une réservation confirmée à mon nom aujourd’hui.',
    es: 'Hola, tengo una reserva confirmada a mi nombre hoy.',
    it: 'Salve, ho una prenotazione confermata a mio nome oggi.',
    nl: 'Hallo, ik heb vandaag een bevestigde reservering op mijn naam.',
    tr: 'Merhaba, bugün adıma onaylanmış bir otel rezervasyonum var.',
    ru: 'Здравствуйте, у меня подтвержденная бронь на мое имя сегодня.',
    zh: '你好，我今天有一个以我名字确认的预订。',
    ja: 'こんにちは、本日私の名前で予約があります。',
    ko: '안녕하세요, 오늘 제 이름으로 예약된 방이 있습니다.',
    pt: 'Olá, tenho uma reserva confirmada em meu nome para hoje.',
    hi: 'नमस्ते, आज मेरे नाम से मेरी पुष्टि की हुई बुकिंग है।',
  },
  'أود طلب قهوة ساخنة، وهل يمكن الدفع بالبطاقة؟': {
    en: 'I would like to order a hot coffee, and can I pay by card?',
    de: 'Ich möchte einen heißen Kaffee bestellen, kann ich mit Karte zahlen?',
    fr: 'Je voudrais commander un café chaud, puis-je payer par carte ?',
    es: 'Quisiera pedir un café caliente, ¿puedo pagar con tarjeta?',
    it: 'Vorrei ordinare un caffè caldo, posso pagare con carta?',
    nl: 'Ik wil graag een warme koffie bestellen, kan ik met de kaart betalen?',
    tr: 'Sıcak bir kahve sipariş etmek istiyorum, kartla ödeyebilir miyim?',
    ru: 'Я хотел бы заказать горячий кофе, можно оплатить картой?',
    zh: '我想点一杯热咖啡，可以刷卡支付吗？',
    ja: 'ホットコーヒーを注文したいのですが、カードで支払えますか？',
    ko: '따뜻한 커피를 주문하고 싶은데, 카드로 결제할 수 있나요?',
    pt: 'Gostaria de pedir um café quente, posso pagar com cartão?',
    hi: 'मैं एक गरम कॉफ़ी ऑर्डर करना चाहता हूँ, क्या मैं कार्ड से भुगतान कर सकता हूँ?',
  },
};

const baseCode = (c) => String(c || '').toLowerCase().split('-')[0];

// مطابقة الجمل الجاهزة: الكلام الجاي من المايك ما فيهوش فواصل ولا علامات استفهام وممكن يختلف في الهمزات والتشكيل،
// فالمطابقة الحرفية عمرها ما كانت بتنجح من المايك. بنطبّع الطرفين قبل المقارنة.
export function normalizeArabic(s) {
  return String(s || '')
    .replace(/[ً-ْٰـ]/g, '') // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
let PHRASE_INDEX = null;
export function findPhrase(text) {
  if (!PHRASE_INDEX) PHRASE_INDEX = new Map(Object.entries(PHRASEBOOK).map(([k, v]) => [normalizeArabic(k), v]));
  return PHRASE_INDEX.get(normalizeArabic(text)) || null;
}

// ---------- تقسيم النصوص الطويلة عند حدود الجمل ----------
export function splitText(text, max = 450) {
  const t = String(text).trim();
  if (t.length <= max) return t ? [t] : [];
  const parts = (t.match(/[^.!?؟。！？\n]+[.!?؟。！？\n]*/g) || [t]).map((x) => x.trim()).filter(Boolean);
  const out = [];
  let cur = '';
  for (const p of parts) {
    if (p.length > max) {
      if (cur) { out.push(cur); cur = ''; }
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
    } else if ((cur + ' ' + p).trim().length > max) { out.push(cur); cur = p; }
    else cur = (cur + ' ' + p).trim();
  }
  if (cur) out.push(cur);
  return out;
}

// ---------- جلب مع مهلة ----------
async function getJson(fetchImpl, url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal });
    if (!res.ok) { const e = new Error('http ' + res.status); e.status = res.status; throw e; }
    return await res.json();
  } finally { clearTimeout(timer); }
}

// ---------- المزوّدات ----------
async function googleOnce(fetchImpl, text, sl, tl, ms) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl='
    + encodeURIComponent(sl) + '&tl=' + encodeURIComponent(tl) + '&q=' + encodeURIComponent(text);
  const data = await getJson(fetchImpl, url, ms);
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('bad google payload');
  const out = data[0].map((seg) => (seg && seg[0]) || '').join('').trim();
  if (!out) throw new Error('empty google result');
  return out;
}

// MyMemory بيرفض أي طلب أكبر من 500 بايت. النص بيتقسم على 450 حرف، والحرف العربي = 2 بايت والصيني/الياباني = 3،
// فأي جزء عربي أطول من ~250 حرف كان بيترفض. هنا بنقسمه أصغر على قد البايتات.
const MM_MAX_BYTES = 480;
const utf8Len = (s) => new TextEncoder().encode(s).length;
async function myMemory(fetchImpl, text, sl, tl, ms) {
  if (utf8Len(text) <= MM_MAX_BYTES) return myMemoryOnce(fetchImpl, text, sl, tl, ms);
  const parts = splitText(text, 150).flatMap((p) => (utf8Len(p) <= MM_MAX_BYTES ? [p] : splitText(p, 100)));
  const outs = [];
  for (const p of parts) outs.push(await myMemoryOnce(fetchImpl, p, sl, tl, ms));
  return outs.join(' ');
}

async function myMemoryOnce(fetchImpl, text, sl, tl, ms) {
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text)
    + '&langpair=' + encodeURIComponent(sl + '|' + tl);
  const data = await getJson(fetchImpl, url, ms);
  const out = data && data.responseData && data.responseData.translatedText;
  if (!out || /MYMEMORY WARNING|INVALID LANGUAGE/i.test(out) || (data.responseStatus && Number(data.responseStatus) !== 200)) {
    throw new Error('mymemory refused');
  }
  return String(out).trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- الكاش ----------
const CACHE_KEY = 'las_tcache_v1';
const MEM = new Map();
function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    raw.forEach(([k, v]) => MEM.set(k, v));
  } catch (e) { /* التخزين غير متاح */ }
}
function saveCache() {
  try {
    while (MEM.size > 150) MEM.delete(MEM.keys().next().value);
    localStorage.setItem(CACHE_KEY, JSON.stringify([...MEM.entries()]));
  } catch (e) { /* ممتلئ أو غير متاح */ }
}
let cacheLoaded = false;

// ---------- المحرك ----------
export function createTranslator(opts = {}) {
  const fetchImpl = opts.fetch || ((...a) => fetch(...a));
  const timeout = opts.timeout ?? 6000;
  let local = null; // async (text, src, tgt) => string | null
  let canLocal = null; // (src, tgt) => boolean
  let preferLocal = false;
  const isOffline = opts.isOffline || (() => typeof navigator !== 'undefined' && navigator.onLine === false);

  async function translateChunk(text, sl, tl, reasons, fast) {
    // 1) جوجل (محاولتان، ومحاولة واحدة وقصيرة إن كان الموديل المحلي جاهزاً)
    for (let i = 0; i < (fast ? 1 : 2); i++) {
      try { return { text: await googleOnce(fetchImpl, text, sl, tl, fast ? 3500 : timeout), via: 'google' }; }
      catch (e) {
        reasons.push('google:' + (e.name === 'AbortError' ? 'timeout' : e.message));
        if (e.status === 429 || e.status === 403 || e.status === 400) break;
        if (i === 0) await sleep(350);
      }
    }
    // 2) MyMemory
    if (fast) return null;
    try { return { text: await myMemory(fetchImpl, text, sl, tl, timeout), via: 'mymemory' }; }
    catch (e) { reasons.push('mymemory:' + (e.name === 'AbortError' ? 'timeout' : e.message)); }
    return null;
  }

  // o.cache = false: ما نحفظش النتيجة (مثلاً جمل ناقصة أثناء الكلام)
  async function translate(text, srcCode, tgtCode, o = {}) {
    const remember = (k, v) => { if (o.cache !== false) { MEM.set(k, v); saveCache(); } };
    if (!cacheLoaded) { loadCache(); cacheLoaded = true; }
    const t = String(text || '').trim();
    if (!t) return { text: '', via: 'none' };
    const sl = baseCode(srcCode) === 'zh' ? 'zh-CN' : baseCode(srcCode);
    const tl = baseCode(tgtCode) === 'zh' ? 'zh-CN' : baseCode(tgtCode);
    if (sl === tl) return { text: t, via: 'same' };

    const key = sl + '>' + tl + '|' + t;
    if (MEM.has(key)) return { text: MEM.get(key), via: 'cache' };

    const reasons = [];
    const hasLocal = !!(local && (!canLocal || canLocal(srcCode, tgtCode)));
    const tryLocal = async () => {
      if (!hasLocal) return null;
      try {
        const r = await local(t, srcCode, tgtCode);
        if (r) { remember(key, r); return { text: r, via: 'local' }; }
      } catch (e) { reasons.push('local:' + e.message); }
      return null;
    };

    // تفضيل الجهاز أو لا يوجد اتصال: الموديل المحلي أولاً
    if (hasLocal && (preferLocal || isOffline())) { const r = await tryLocal(); if (r) return r; }

    // الأونلاين: كل جزء على حدة
    if (!isOffline()) {
      const chunks = splitText(t);
      const outs = [];
      let via = null;
      let onlineOk = true;
      for (const c of chunks) {
        const r = await translateChunk(c, sl, tl, reasons, hasLocal);
        if (!r) { onlineOk = false; break; }
        outs.push(r.text); via = via === 'mymemory' ? 'mymemory' : r.via;
      }
      if (onlineOk && outs.length) {
        const res = outs.join(' ');
        remember(key, res);
        return { text: res, via };
      }
    } else reasons.push('offline');

    // الموديل المحلي كخطة بديلة
    if (!(hasLocal && (preferLocal || isOffline()))) { const r = await tryLocal(); if (r) return r; }

    // الجمل الجاهزة
    if (sl === 'ar') {
      // ملاحظة: tl للصيني بيبقى 'zh-CN' بينما مفتاح الجمل الجاهزة 'zh'، فكان الصيني عمره ما بيطابق
      const hit = findPhrase(t), out = hit && (hit[tl] || hit[baseCode(tl)]);
      if (out) return { text: out, via: 'phrasebook' };
    }
    throw new NoTranslation(reasons);
  }

  return { translate, setLocal(fn, can) { local = fn; canLocal = can || null; }, setPreferLocal(v) { preferLocal = !!v; }, clearCache() { MEM.clear(); saveCache(); } };
}
