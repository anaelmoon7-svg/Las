// واجهة إدارة الحزم (الترجمة + المايكروفون) داخل نافذة الأوفلاين.
import * as P from './packs.js';

const fmt = (b) => '\u2066' + (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : Math.max(1, Math.round(b / 1e6)) + ' MB') + '\u2069';
const EST_DIR = 85; // ميجا تقريبي للاتجاه الواحد (المقاس الحقيقي يظهر بعد التنزيل)
const SAMPLE = { ar: 'مرحباً، كيف حالك اليوم؟', ko: '안녕하세요, 오늘 어떻게 지내세요?', tr: 'Merhaba, bugün nasılsınız?' };
const PREFER_KEY = 'las_prefer_local';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

export function initPacks({ root, languages, translator }) {
  const progress = {}; // key → نص التقدم (للصفوف التي تُنزَّل الآن)
  const results = {};  // key → { ok, msg }
  const busy = new Set();
  let storageLine = '', evictNote = '';

  // ربط الموديلات المحلية بالمترجم
  translator.setLocal((x, s, g) => P.localTranslate(x, s, g), (s, g) => P.canTranslateLocally(s, g));
  // نتأكد إن الحزم اللي البيان بيقول إنها منزّلة لسه ملفاتها موجودة فعلاً (المتصفح ممكن يكون مسحها)
  P.reconcileManifest().then((gone) => { if (gone.length) { evictNote = '⚠️ المتصفح مسح بعض الحزم لتوفير المساحة. نزّلها تاني لو محتاجها بدون نت.'; render(); } }).catch(() => {});
  translator.setPreferLocal(ls.get(PREFER_KEY) === '1');

  const rows = [];
  const seen = new Set();
  for (const l of languages) {
    const b = P.baseLang(l.apiCode || l.code);
    if (b === 'ar' || seen.has(b)) continue;
    seen.add(b);
    rows.push({ id: b, flag: l.flag, name: b === 'en' ? 'الإنجليزية (الأساس)' : l.nameAr });
  }
  const modelsOf = (id) => (id === 'en' ? P.langModels('ar') : P.langModels(id));
  const stateOf = (ms) => {
    const done = ms.filter(P.isInstalled).length;
    return { total: ms.length, done, complete: ms.length > 0 && done === ms.length, bytes: ms.reduce((a, m) => a + P.installedBytes(m), 0) };
  };
  const noteOf = (id) => {
    if (id === 'en') return 'مطلوبة لكل اللغات: العربية ↔ الإنجليزية';
    const o = P.OPUS[id];
    if (!o || (!o.from && !o.to)) return 'غير متاحة في الحزم الصغيرة، تعمل فقط مع الحزمة الشاملة';
    if (!o.to) return 'الترجمة من هذه اللغة إلى العربية فقط (الاتجاه المعاكس يحتاج الحزمة الشاملة)';
    if (!o.from) return 'الترجمة من العربية إلى هذه اللغة فقط';
    return 'ترجمة في الاتجاهين مع العربية (عبر الإنجليزية)';
  };

  async function refreshStorage() {
    try {
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      const pers = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
      storageLine = est
        ? `المساحة المستخدمة في المتصفح: ${fmt(est.usage || 0)} من ${fmt(est.quota || 0)}`
        : 'لا يمكن قراءة المساحة المتاحة في هذا المتصفح';
      if (pers === false) storageLine += ' · ⚠️ المتصفح قد يمسح الحزم عند امتلاء الجهاز';
      if (pers === true) storageLine += ' · 🔒 التخزين محمي';
    } catch (e) { storageLine = ''; }
  }

  const safe = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])).replace(/\n/g, '<br>');
  async function selfTest(id) {
    const path = P.testPath(id, !!SAMPLE[id]);
    if (!path) return { ok: false, msg: 'لا يوجد مسار ترجمة جاهز على الجهاز لهذه اللغة بعد.' };
    const [from, to] = path, text = from === 'ar' ? SAMPLE.ar : SAMPLE[id];
    const t0 = performance.now();
    const out = await P.localTranslate(text, from, to);
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    const bad = !out || out.trim() === text.trim() || />>|<<|\?{3,}/.test(out);
    return { ok: !bad, msg: bad ? `⚠️ نتيجة الاختبار غير مقنعة: «${out || 'فارغة'}»` : `✅ «${text}» ← «${out}» (${sec} ث، أول مرة أبطأ)` };
  }

  async function run(key, fn) {
    if (busy.has(key)) return;
    busy.add(key); delete results[key]; progress[key] = 'جاري البدء…'; render();
    try { await fn(); }
    catch (e) {
      const m = e && e.message ? e.message : String(e);
      results[key] = { ok: false, msg: (e && e.noMemory) || /bad_alloc|OrtRun/i.test(m)
        ? '⚠️ ذاكرة الجهاز لا تكفي لتشغيل هذه الحزمة الثقيلة. باقي اللغات تعمل بدونها (والأونلاين يغطي ما ينقص)، ويمكنك حذفها لتوفير المساحة.'
        : '⚠️ تعذّر التنفيذ: ' + m + ' — تأكد من الإنترنت وحاول مرة أخرى.' };
    }
    busy.delete(key); delete progress[key];
    await refreshStorage(); render();
  }
  const onProg = (key, label) => (e) => {
    const pct = e.total > 0 ? Math.min(100, Math.round((e.loaded / e.total) * 100)) : null;
    progress[key] = `${label} ${e.index}/${e.count}` + (pct != null ? ` — ${pct}% (${fmt(e.loaded)} من ${fmt(e.total)})` : '') + (e.note ? ` — ${e.note}` : '');
    const el = root.querySelector(`[data-prog="${key}"]`);
    if (el) el.textContent = progress[key];
  };

  const btn = (act, attrs, label, cls) => `<button data-act="${act}" ${attrs} class="shrink-0 px-3 py-1.5 rounded-xl text-xs font-black ${cls}">${label}</button>`;
  const BTN_ON = 'bg-amber-500 text-zinc-950';
  const BTN_OFF = 'bg-zinc-800 text-red-300 border border-red-500/40';

  function row(key, title, note, st, estText, actions, extra) {
    const status = busy.has(key) ? `<span data-prog="${key}" class="text-amber-300">${progress[key] || ''}</span>`
      : st.complete ? `<span class="text-emerald-300">✅ جاهز على جهازك (${fmt(st.bytes)})</span>`
      : st.done ? `<span class="text-amber-300">جزئي (${st.done}/${st.total}) — ${fmt(st.bytes)}</span>`
      : `<span class="text-zinc-500">غير منزّل — ${estText}</span>`;
    const res = results[key] ? `<p class="text-[11px] ${results[key].ok ? 'text-emerald-300' : 'text-red-300'}">${safe(results[key].msg)}</p>` : '';
    return `<div class="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
      <div class="flex items-center justify-between gap-2"><div class="min-w-0"><p class="text-sm font-black text-zinc-100">${title}</p><p class="text-[11px] text-zinc-500">${note}</p></div>
      <div class="flex gap-1.5 shrink-0">${busy.has(key) ? '<span class="text-xs text-zinc-500">⏳</span>' : actions}</div></div>
      <p class="text-[11px]">${status}</p>${res}${extra || ''}</div>`;
  }

  function render() {
    const prefer = ls.get(PREFER_KEY) === '1';
    let h = `<div class="p-3 rounded-2xl bg-zinc-900 border border-amber-500/30 space-y-2">
      <p class="text-xs font-black text-amber-300">📦 حزم الترجمة على الجهاز</p>
      <p class="text-[11px] text-zinc-400">تُنزَّل مرة واحدة من الإنترنت ثم تعمل بدون اتصال. الأحجام تقديرية حتى يكتمل التنزيل ثم يظهر الحجم الفعلي. يُفضَّل التنزيل على واي فاي.</p>
      <p class="text-[11px] text-zinc-400">مع النت الترجمة دايماً من جوجل (الأدق). الحزم دي بتشتغل لما النت يقطع.</p>
      <p class="text-[11px] text-zinc-500">${storageLine}</p>${evictNote ? `<p class="text-[11px] text-amber-300">${evictNote}</p>` : ''}</div>`;

    h += '<div class="space-y-2">';
    for (const r of rows) {
      const ms = modelsOf(r.id), st = stateOf(ms), miss = ms.filter((m) => !P.isInstalled(m)).length;
      const act = (st.complete ? btn('test', `data-id="${r.id}"`, 'اختبار', 'bg-zinc-800 text-zinc-200 border border-zinc-700') : '') +
        (st.done ? btn('rm', `data-id="${r.id}"`, 'حذف', BTN_OFF) : '') +
        (!st.complete ? btn('inst', `data-id="${r.id}"`, 'تنزيل', BTN_ON) : '');
      h += row('l:' + r.id, `${r.flag} ${r.name}`, noteOf(r.id), st, `≈ ${miss * EST_DIR} MB`, act);
    }
    h += '</div>';

    // الحزمة الشاملة
    const nst = stateOf([P.NLLB.model]);
    h += row('nllb', '🌍 الحزمة الشاملة (NLLB) — كل اللغات الـ 14 في كل الاتجاهات',
      'تغطي البرتغالية والكورية والتركية في الاتجاهين. ثقيلة: قد تبطئ أو تتوقف على الهواتف الضعيفة.',
      nst, '≈ 0.6–1 GB',
      (nst.complete ? btn('test', 'data-id="nllb"', 'اختبار', 'bg-zinc-800 text-zinc-200 border border-zinc-700') + btn('rm-nllb', '', 'حذف', BTN_OFF) : btn('inst-nllb', '', 'تنزيل', BTN_ON)));

    // المايكروفون
    const sel = P.installedWhisper();
    h += `<p class="text-xs font-black text-amber-300 pt-2">🎙️ المايكروفون بدون إنترنت (Whisper)</p><div class="space-y-2">`;
    for (const w of P.WHISPER) {
      const st = stateOf([w.id]);
      const act = (st.complete ? (sel === w.id ? '<span class="text-[11px] text-emerald-300 self-center">المستخدم الآن</span>' : btn('asr-sel', `data-m="${w.id}"`, 'استخدمه', 'bg-zinc-800 text-zinc-200 border border-zinc-700')) + btn('asr-rm', `data-m="${w.id}"`, 'حذف', BTN_OFF) : btn('asr-inst', `data-m="${w.id}"`, 'تنزيل', BTN_ON));
      h += row('w:' + w.id, w.name, 'يدعم اللغات الـ 14. الأدق أبطأ وأثقل.', st, `≈ ${w.approxMB} MB`, act);
    }
    h += '</div>';
    root.innerHTML = h;
  }

  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-act="prefer"]')) {
      ls.set(PREFER_KEY, e.target.checked ? '1' : '0'); translator.setPreferLocal(e.target.checked);
    }
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id, m = b.dataset.m;
    if (act === 'inst') run('l:' + id, async () => {
      await P.installModels(modelsOf(id), { onProgress: onProg('l:' + id, 'نموذج') });
      results['l:' + id] = await selfTest(id);
    });
    else if (act === 'rm') {
      if (id === 'en' && !confirm('الحزمة الأساسية مطلوبة لكل اللغات. حذفها يوقف الترجمة المحلية. متابعة؟')) return;
      run('l:' + id, async () => { await P.removeModels(id === 'en' ? P.langModels('ar') : P.langModels(id, false)); });
    }
    else if (act === 'inst-nllb') run('nllb', async () => {
      await P.installModels([P.NLLB.model], { onProgress: onProg('nllb', 'ملف') });
      results.nllb = await selfTest('pt');
    });
    else if (act === 'rm-nllb') run('nllb', async () => { await P.removeModels([P.NLLB.model]); });
    else if (act === 'test') {
      const key = id === 'nllb' ? 'nllb' : 'l:' + id;
      run(key, async () => { results[key] = await selfTest(id === 'nllb' ? 'pt' : id); });
    }
    else if (act === 'asr-inst') run('w:' + m, async () => {
      await P.installModels([m], { kind: 'automatic-speech-recognition', onProgress: onProg('w:' + m, 'ملف') });
      if (!ls.get('las_asr_model') || !P.isInstalled(ls.get('las_asr_model'))) ls.set('las_asr_model', m);
    });
    else if (act === 'asr-rm') run('w:' + m, async () => { await P.removeModels([m]); });
    else if (act === 'asr-sel') { ls.set('las_asr_model', m); render(); }
  });

  refreshStorage().then(render);
  render();
  return { render: () => { refreshStorage().then(render); render(); } };
}
