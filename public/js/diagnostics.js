// فحص الجاهزية: يختبر على جهاز المستخدم نفسه ما لا يمكن اختباره خارجه.
const T = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

async function ping(url, ms = 7000) {
  const t0 = performance.now();
  try { const r = await T(fetch(url, { cache: 'no-store' }), ms); return { ok: r.ok, status: r.status, ms: Math.round(performance.now() - t0) }; }
  catch (e) { return { ok: false, err: e.message === 'timeout' ? 'انتهت المهلة' : 'محجوب أو لا يوجد اتصال', ms: Math.round(performance.now() - t0) }; }
}

export async function runDiagnostics(languages) {
  const out = []; const add = (level, title, detail) => out.push({ level, title, detail });
  add(window.isSecureContext ? 'ok' : 'bad', 'اتصال آمن (HTTPS)', window.isSecureContext ? 'نعم' : 'لا: التثبيت والمايك والأوفلاين لن تعمل إلا على HTTPS');
  try {
    const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
    add(navigator.serviceWorker && navigator.serviceWorker.controller ? 'ok' : reg ? 'warn' : 'bad', 'العمل بدون إنترنت (Service Worker)',
      navigator.serviceWorker && navigator.serviceWorker.controller ? 'مفعّل ويتحكم في الصفحة' : reg ? 'مسجّل لكنه لم يتحكم بعد: أغلق التطبيق وافتحه مرة أخرى' : 'غير مسجّل');
  } catch (e) { add('bad', 'Service Worker', e.message); }
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  add(standalone ? 'ok' : 'warn', 'مثبّت كتطبيق', standalone ? 'نعم' : 'لا: يعمل من المتصفح. ثبّته من القائمة لتجربة أفضل');
  try {
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    const pers = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
    const free = est ? (est.quota - est.usage) / 1e9 : null;
    add(free == null ? 'warn' : free > 1.5 ? 'ok' : 'warn', 'مساحة التخزين', est ? `متاح ≈ ${free.toFixed(2)} GB ${pers ? '· محمي من المسح' : '· غير محمي من المسح التلقائي'}` : 'لا يمكن قراءتها');
  } catch (e) {}
  const wasm = typeof WebAssembly === 'object';
  add(wasm ? 'ok' : 'bad', 'WebAssembly', wasm ? 'مدعوم' : 'غير مدعوم: موديلات الجهاز لن تعمل');
  if (wasm) { let simd = false; try { simd = WebAssembly.validate(SIMD); } catch (e) {} add(simd ? 'ok' : 'warn', 'WASM SIMD', simd ? 'مدعوم (أسرع)' : 'غير مدعوم: يتطلب متصفحاً أحدث (iOS 16.4+ أو Chrome حديث)'); }
  let mw = false; try { const u = URL.createObjectURL(new Blob(['export{}'], { type: 'text/javascript' })); const w = new Worker(u, { type: 'module' }); w.terminate(); URL.revokeObjectURL(u); mw = true; } catch (e) {}
  add(mw ? 'ok' : 'bad', 'Worker وحدات', mw ? 'مدعوم' : 'غير مدعوم: موديلات الجهاز لن تعمل');
  add('ok', 'سرعة الموديلات', self.crossOriginIsolated ? 'متعددة الخيوط' : 'خيط واحد (عادي على الاستضافة البسيطة)' + (navigator.deviceMemory ? ` · ذاكرة الجهاز ≈ ${navigator.deviceMemory} GB` : ''));

  const [hf, svc] = await Promise.all([
    ping('https://huggingface.co/Xenova/opus-mt-en-ar/resolve/main/config.json'),
    ping('/api/health'),
  ]);
  let svcCfg = null; if (svc.ok) { try { svcCfg = await (await fetch('/api/health', { cache: 'no-store' })).json(); } catch (e) {} }
  const net = (r) => (r.ok ? `يعمل (${r.ms} ms)` : `لا يعمل: ${r.err || 'HTTP ' + r.status}`);
  add(hf.ok ? 'ok' : 'warn', 'تنزيل الحزم (HuggingFace)', net(hf));
  add(svc.ok && svcCfg && svcCfg.translate ? 'ok' : 'warn', 'خدمة الترجمة والنطق السحابية', svc.ok ? (svcCfg && svcCfg.translate ? `تعمل (${svc.ms} ms)` : 'الخدمة وصلت لكن المفتاح غير مضبوط في الخادم') : net(svc));

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  add(SR ? 'ok' : 'warn', 'التعرّف على الصوت بخدمة المتصفح', SR ? 'متاح (يحتاج إنترنت)' : 'غير متاح: استخدم حزمة المايك على الجهاز');
  try {
    if (navigator.permissions) { const p = await navigator.permissions.query({ name: 'microphone' }); add(p.state === 'granted' ? 'ok' : p.state === 'denied' ? 'bad' : 'warn', 'إذن المايكروفون', p.state === 'granted' ? 'مسموح' : p.state === 'denied' ? 'مرفوض: فعّله من إعدادات المتصفح' : 'سيُطلب عند أول استخدام'); }
  } catch (e) {}
  try {
    const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    const miss = [], seen = new Set();
    for (const l of languages) { const b = (l.ttsCode || l.code).split('-')[0]; if (seen.has(b)) continue; seen.add(b); if (!voices.some((v) => v.lang.toLowerCase().startsWith(b))) miss.push(l.nameAr); }
    const local = voices.filter((v) => v.localService).length;
    add(!voices.length ? 'warn' : miss.length ? 'warn' : 'ok', 'أصوات نطق الترجمة',
      !voices.length ? 'لم تظهر أصوات بعد (جرّب إعادة الفحص بعد لحظات)' : `${voices.length} صوت (${local} منها يعمل بدون إنترنت)` + (miss.length ? ` · ينقصك صوت: ${miss.join('، ')}` : ''));
    // ما الذي يراه المتصفح فعلاً؟ يفيد لتتبع صوت ناقص رغم تثبيته في إعدادات الهاتف
    if (voices.length) {
      const cnt = {}; voices.forEach((v) => { const k = String(v.lang || '?').replace('_', '-'); cnt[k] = (cnt[k] || 0) + 1; });
      const arLike = voices.filter((v) => /arab|عرب|^ar([-_]|$)/i.test(v.name + ' ' + v.lang)).map((v) => v.name + ' (' + v.lang + ')');
      add('ok', 'لغات الأصوات التي يراها المتصفح', Object.keys(cnt).sort().map((k) => k + '×' + cnt[k]).join(' ') + (arLike.length ? ' · عربي: ' + arLike.join('، ') : ' · لا صوت عربي بينها'));
    }
  } catch (e) {}
  try {
    const has = async (u) => !!(await caches.match(u));
    const en = await has('./data/cmudict.json'), ja = await has('./dict/base.dat.gz');
    add(en ? 'ok' : 'warn', 'قاموس نطق الإنجليزية', en ? 'محفوظ على الجهاز' : 'غير محفوظ بعد (استخدم «تجهيز النطق»)');
    add(ja ? 'ok' : 'warn', 'قاموس نطق اليابانية', ja ? 'محفوظ على الجهاز' : 'غير محفوظ بعد (استخدم «تجهيز النطق»)');
  } catch (e) {}
  return out;
}

const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function renderDiagnostics(root, languages) {
  root.innerHTML = '<p class="text-xs text-zinc-400">⏳ جاري الفحص…</p>';
  const res = await runDiagnostics(languages);
  const icon = { ok: '✅', warn: '⚠️', bad: '❌' }, col = { ok: 'text-emerald-300', warn: 'text-amber-300', bad: 'text-red-300' };
  root.innerHTML = res.map((r) => `<div class="flex gap-2 text-[11px] leading-relaxed"><span>${icon[r.level]}</span><p class="${col[r.level]}"><b>${esc(r.title)}:</b> ${esc(r.detail)}</p></div>`).join('') +
    '<button data-copy class="mt-2 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200">نسخ التقرير</button>';
  const text = 'تقرير جاهزية لاس\n' + res.map((r) => `${icon[r.level]} ${r.title}: ${r.detail}`).join('\n') + '\n' + navigator.userAgent;
  root.querySelector('[data-copy]').onclick = async (e) => { try { await navigator.clipboard.writeText(text); e.target.textContent = 'تم النسخ ✓'; } catch (_) { e.target.textContent = 'تعذّر النسخ'; } };
  return res;
}
