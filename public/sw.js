/* Service Worker — منصة لاس (LAS)
   - يحفظ كل ملفات التطبيق عند أول زيارة ليفتح بدون إنترنت.
   - القواميس الكبيرة (الإنجليزي/الياباني) والمكتبات تُحفظ عند أول استخدام.
   - لا يتدخل في طلبات الترجمة والنطق ولا في تنزيل الموديلات (cross-origin). */

const VERSION = 'las-v20';
const SHELL_CACHE = `${VERSION}-shell`;
const BIG_CACHE = `${VERSION}-big`;

const SHELL_FILES = [
  './', './index.html', './app.html', './manifest.webmanifest',
  './css/tailwind.css', './css/fonts.css',
  './js/app.js', './js/landing.js', './js/translate.js', './js/phonetics.js', './js/packs.js', './js/packs-ui.js', './js/offline-mic.js', './js/diagnostics.js', './js/ml-worker.js', './data/cmudict.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png', './icons/las-icon.svg', './icons/las-logo-light.png',
  ...['arabic', 'latin'].flatMap((s) => [400, 600, 700, 800, 900].map((w) => `./fonts/cairo-${s}-${w}-normal.woff2`)),
];

// ملفات كبيرة لا تتغير: كاش أولاً
const BIG_PATTERN = /\/(dict|data|vendor|fonts|icons|js\/chunks)\//;

// الملفات اللي من غيرها التطبيق ما يفتحش أصلاً: لو واحد منها فشل، التثبيت يفشل (ونفضل على النسخة القديمة الشغالة).
// الباقي (أيقونات، خطوط، قاموس...) لو فشل ما يوقفش التثبيت: قبل كده أي ملف واحد يرجع 404 كان بيلغي وضع الأوفلاين كله.
const CRITICAL = new Set(['./', './app.html', './index.html', './js/app.js', './js/landing.js', './js/translate.js', './css/tailwind.css']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => Promise.all(SHELL_FILES.map((u) => fetch(u, { cache: 'reload' }).then((r) => {
        if (!r.ok) throw new Error('precache ' + u + ' ' + r.status);
        return clean(r).then((cr) => c.put(u, cr));
      }).catch((e) => {
        if (CRITICAL.has(u)) throw e;
        console.warn('[sw] optional file not cached:', u, e && e.message);
      }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('las-') && !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// بعض الاستضافات تحوّل app.html إلى /app: الرد المحوَّل لا يصلح لفتح الصفحات من الكاش، فننظّفه.
const clean = (r) => (r.redirected ? r.blob().then((b) => new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers })) : Promise.resolve(r));
const pageFromCache = (req) => {
  const u = new URL(req.url); const p = u.pathname;
  const alts = [req, p.endsWith('.html') ? p.slice(0, -5) : p + '.html', './app.html', './index.html'];
  return alts.reduce((acc, k) => acc.then((hit) => hit || caches.match(k, { ignoreSearch: true })), Promise.resolve(null)).then((hit) => hit && clean(hit));
};

const fetchWithTimeout = (req, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // الشبكة مباشرة

  // الصفحات: شبكة أولاً (4 ثوانٍ) ثم النسخة المحفوظة
  if (req.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(req, 4000)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); clean(copy).then((cr) => caches.open(SHELL_CACHE).then((c) => c.put(req, cr))); }
          return res;
        })
        .catch(() => pageFromCache(req))
    );
    return;
  }

  // سكربت الصفحة نفسها: شبكة أولاً (4 ثوانٍ) كي لا يختلف عن نسخة الصفحة
  // (الآن لكل سكربتات التطبيق مش app.js بس: عشان packs.js و translate.js وغيرهم يفضلوا من نفس نسخة الصفحة،
  //  بدل ما وحدة جديدة تستدعي دالة مش موجودة في وحدة قديمة متخزنة. js/chunks برّه القاعدة دي.)
  if (/\/js\/[^/]+\.js$/.test(url.pathname)) {
    event.respondWith(
      fetchWithTimeout(req, 4000)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then((c) => c.put(req, copy)); } return res; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // الملفات الكبيرة الثابتة: كاش أولاً ثم تخزين عند أول طلب
  if (BIG_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(url.pathname.includes('/icons/') || url.pathname.includes('/fonts/') ? SHELL_CACHE : BIG_CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // باقي الملفات (js/css/html): تظهر المحفوظة فوراً وتتحدّث في الخلفية
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
